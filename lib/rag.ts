import type { DatabaseAdapter } from "./db";
import { authorizedDocumentWhereClause } from "./auth/permissions";
import { cosineSimilarity, createLocalEmbedding, LOCAL_EMBEDDING_MODEL, parseEmbedding } from "./embeddings";

export type RagContext = {
  content: string;
  citations: Array<{
    document_id: number;
    title: string;
    source_path: string | null;
    file_source_id: number | null;
    connector_id: number | null;
  }>;
};

export async function retrieveContext(db: DatabaseAdapter, workspaceId: string, query: string, limit = 6, groupId?: string | null): Promise<RagContext> {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2).slice(0, 12);
  const whereClause = authorizedDocumentWhereClause(groupId);
  const chunks = groupId
    ? await db.all<any>(
      `SELECT
         document_chunks.*,
         documents.title,
         documents.source_path,
         documents.file_source_id,
         documents.connector_id,
         chunk_embeddings.vector_json
       FROM document_chunks
       JOIN documents ON documents.id = document_chunks.document_id
       LEFT JOIN chunk_embeddings
         ON chunk_embeddings.chunk_id = document_chunks.id
        AND chunk_embeddings.workspace_id = document_chunks.workspace_id
        AND chunk_embeddings.provider = 'local'
        AND chunk_embeddings.model = '${LOCAL_EMBEDDING_MODEL}'
       LEFT JOIN file_sources
         ON file_sources.id = documents.file_source_id
        AND file_sources.workspace_id = documents.workspace_id
       WHERE ${whereClause}
       ORDER BY document_chunks.created_at DESC
       LIMIT 200`,
      [workspaceId, groupId, groupId]
    )
    : await db.all<any>(
      `SELECT
         document_chunks.*,
         documents.title,
         documents.source_path,
         documents.file_source_id,
         documents.connector_id,
         chunk_embeddings.vector_json
       FROM document_chunks
       JOIN documents ON documents.id = document_chunks.document_id
       LEFT JOIN chunk_embeddings
         ON chunk_embeddings.chunk_id = document_chunks.id
        AND chunk_embeddings.workspace_id = document_chunks.workspace_id
        AND chunk_embeddings.provider = 'local'
        AND chunk_embeddings.model = '${LOCAL_EMBEDDING_MODEL}'
       LEFT JOIN file_sources
         ON file_sources.id = documents.file_source_id
        AND file_sources.workspace_id = documents.workspace_id
       WHERE ${whereClause}
       ORDER BY document_chunks.created_at DESC
       LIMIT 200`,
      [workspaceId]
    );

  const queryVector = createLocalEmbedding(query);
  const scored = chunks
    .map((chunk) => {
      const haystack = `${chunk.title} ${chunk.source_path || ""} ${chunk.content}`.toLowerCase();
      const keywordScore = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      const vectorScore = cosineSimilarity(queryVector, parseEmbedding(chunk.vector_json));
      const score = keywordScore + Math.max(0, vectorScore) * 2;
      return { ...chunk, keywordScore, vectorScore, score };
    })
    .filter((chunk) => chunk.keywordScore > 0 || chunk.vectorScore > 0.12 || terms.length === 0)
    .sort((a, b) => b.score - a.score || a.chunk_index - b.chunk_index)
    .slice(0, limit);

  return {
    content: scored.map((chunk) => `Source: ${chunk.title}\nPath: ${chunk.source_path || "unknown"}\n\n${chunk.content}`).join("\n\n---\n\n"),
    citations: scored.map((chunk) => ({
      document_id: Number(chunk.document_id),
      title: chunk.title,
      source_path: chunk.source_path,
      file_source_id: chunk.file_source_id ? Number(chunk.file_source_id) : null,
      connector_id: chunk.connector_id ? Number(chunk.connector_id) : null
    }))
  };
}
