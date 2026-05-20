import type { DatabaseAdapter } from "../db";
import { indexApprovedLocalFileSources } from "../connectors/localFiles";

export async function fileIndexerAgent(db: DatabaseAdapter, workspaceId: string) {
  return indexApprovedLocalFileSources(db, workspaceId);
}
