import type { DatabaseAdapter } from "../db";
import { retrieveContext } from "../rag";

export async function researcherAgent(db: DatabaseAdapter, workspaceId: string, query: string, groupId?: string | null) {
  return retrieveContext(db, workspaceId, query, 6, groupId);
}
