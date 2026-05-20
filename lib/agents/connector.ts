import type { DatabaseAdapter } from "../db";
import { githubConnector } from "../connectors/github";
import { googleDriveConnector } from "../connectors/googleDrive";
import { localFilesConnector } from "../connectors/localFiles";
import { slackConnector } from "../connectors/slack";

const providers = {
  github: githubConnector,
  google_drive: googleDriveConnector,
  local_files: localFilesConnector,
  slack: slackConnector
};

export async function connectorAgent(db: DatabaseAdapter, workspaceId: string, query: string) {
  const connectors = await db.all<any>(
    `SELECT * FROM connectors WHERE workspace_id = ? AND enabled = 1 ORDER BY provider`,
    [workspaceId]
  );
  const results = [];
  for (const connector of connectors) {
    const runner = providers[connector.provider as keyof typeof providers];
    if (!runner) continue;
    results.push(await runner.search({ db, workspaceId, query, connector }));
  }
  return results;
}
