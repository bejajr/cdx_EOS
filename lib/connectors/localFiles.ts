import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DatabaseAdapter } from "../db";
import { APP_MODE } from "../db";

const textExtensions = [".txt", ".md", ".csv", ".json", ".html", ".htm", ".log"];

function isTextPath(path: string) {
  return textExtensions.some((extension) => path.toLowerCase().endsWith(extension));
}

function isSupportedPath(path: string) {
  return [...textExtensions, ".pdf", ".docx"].some((extension) => path.toLowerCase().endsWith(extension));
}

function extractContent(path: string) {
  if (isTextPath(path)) return normalizeText(readFileSync(path, "utf8").slice(0, 2_000_000));
  if (path.toLowerCase().endsWith(".pdf") || path.toLowerCase().endsWith(".docx")) {
    return `Text extraction for this file type is not implemented yet. The approved file is registered for future extraction: ${path}`;
  }
  return "";
}

function normalizeText(content: string) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[ \u00a0]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function titleFromContent(content: string, fallback: string) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 140);
  const firstLine = content.split(/\n+/).map((line) => line.trim()).find((line) => line && line.length <= 140);
  return (firstLine || fallback.replace(/\.[^.]+$/, "") || "Local file").slice(0, 140);
}

function listApprovedFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const stats = statSync(path);
  if (stats.isFile()) return isSupportedPath(path) ? [path] : [];
  if (!stats.isDirectory()) return [];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const child = resolve(dir, name);
      const childStats = statSync(child);
      if (childStats.isDirectory()) walk(child);
      if (childStats.isFile() && isSupportedPath(child)) files.push(child);
    }
  };
  walk(path);
  return files;
}

function chunkText(text: string, size = 2400, overlap = 180) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size - overlap) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "local-file";
}

function displayPath(path: string) {
  const root = process.cwd();
  return path.startsWith(`${root}/`) ? path.replace(`${root}/`, "") : path;
}

function writeMarkdownMirror(source: any, sourcePath: string, content: string) {
  const timestamp = new Date().toISOString();
  const sourceHash = createHash("sha256").update(sourcePath).digest("hex").slice(0, 10);
  const title = titleFromContent(content, source.label || sourcePath.split("/").pop() || "Local file source");
  const markdownPath = join(process.cwd(), "docs", "source-knowledge", "local-files", `${slugify(`${source.id}-${sourcePath.split("/").pop() || title}-${sourceHash}`)}.md`);
  const markdown = `# ${title}

## Source Metadata

- Intake method: approved local file source
- Original path: ${sourcePath}
- File source ID: ${source.id}
- Indexed: ${timestamp}
- Knowledge format: Markdown wiki
- Extracted characters: ${content.length}

## Extracted Reference Text

${content || "No extracted text available."}
`;
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(markdownPath, markdown);
  return { markdownPath, markdown, title };
}

export async function indexApprovedLocalFileSources(db: DatabaseAdapter, workspaceId: string) {
  if (APP_MODE !== "local") {
    return { indexed: 0, skipped: "Local file indexing is only available in APP_MODE=local." };
  }

  const sources = await db.all<any>(
    `SELECT * FROM file_sources WHERE workspace_id = ? AND enabled = 1 AND source_type = 'local'`,
    [workspaceId]
  );
  let indexed = 0;
  for (const source of sources) {
    const path = resolve(String(source.path));
    for (const filePath of listApprovedFiles(path)) {
      const content = extractContent(filePath);
      if (!content) continue;
      const mirror = writeMarkdownMirror(source, filePath, content);
      const hash = createHash("sha256").update(mirror.markdown).digest("hex");
      const timestamp = new Date().toISOString();
      const sourcePath = displayPath(mirror.markdownPath);
      const existing = await db.get<any>(
        `SELECT id FROM documents WHERE workspace_id = ? AND source_path = ?`,
        [workspaceId, sourcePath]
      );
      const documentId = existing?.id || (await db.run(
        `INSERT INTO documents (workspace_id, group_id, file_source_id, title, source_path, content_hash, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workspaceId,
          source.group_id || null,
          source.id,
          mirror.title,
          sourcePath,
          hash,
          JSON.stringify({ intake_method: "approved_local_file", original_path: filePath, approved_root: path, source_format: "markdown" }),
          timestamp,
          timestamp
        ]
      )).lastInsertRowid;

      if (existing?.id) {
        await db.run(
          `UPDATE documents SET title = ?, content_hash = ?, metadata_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`,
          [
            mirror.title,
            hash,
            JSON.stringify({ intake_method: "approved_local_file", original_path: filePath, approved_root: path, source_format: "markdown" }),
            timestamp,
            existing.id,
            workspaceId
          ]
        );
        await db.run(`DELETE FROM document_chunks WHERE document_id = ? AND workspace_id = ?`, [existing.id, workspaceId]);
      }

      const chunks = chunkText(mirror.markdown);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        await db.run(
          `INSERT INTO document_chunks (workspace_id, group_id, document_id, chunk_index, content, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            workspaceId,
            source.group_id || null,
            Number(documentId),
            chunkIndex,
            chunks[chunkIndex],
            JSON.stringify({ source_path: sourcePath, original_path: filePath, approved_root: path, source_format: "markdown" }),
            timestamp
          ]
        );
      }
      indexed += 1;
    }
  }
  return { indexed, method: "markdown_mirrors", folder: "docs/source-knowledge/local-files" };
}

export const localFilesConnector = {
  async search() {
    return {
      provider: "local_files",
      content: "Local file context is served from indexed documents. Run /api/index-files after approving file_sources.",
      metadata: { implemented: true }
    };
  }
};
