import type { DatabaseAdapter } from "../db";
import { indexApprovedLocalFileSources } from "../connectors/localFiles";

export type FileAgentInput = {
  workspace_id: string;
  action?: "index" | "search";
  query?: string;
};

export async function fileAgent(db: DatabaseAdapter, input: FileAgentInput) {
  if (input.action === "search") {
    return {
      agent: "file",
      status: "placeholder",
      message: "File search will use permission-aware RAG after retrieval is implemented.",
      query: input.query || ""
    };
  }

  return indexApprovedLocalFileSources(db, input.workspace_id);
}
