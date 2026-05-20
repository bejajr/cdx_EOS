import type { DatabaseAdapter } from "./db";

export async function listMemories(db: DatabaseAdapter, workspaceId: string) {
  return db.all(
    `SELECT * FROM memories WHERE workspace_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 100`,
    [workspaceId]
  );
}

export async function saveMemory(db: DatabaseAdapter, input: {
  workspace_id: string;
  user_id?: string | null;
  content: string;
  memory_type?: string;
  source?: string;
  metadata?: unknown;
}) {
  const timestamp = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO memories (workspace_id, user_id, memory_type, content, status, source, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [
      input.workspace_id,
      input.user_id || null,
      input.memory_type || "note",
      input.content,
      input.source || "manual",
      JSON.stringify(input.metadata || {}),
      timestamp,
      timestamp
    ]
  );
  return { id: result.lastInsertRowid, created_at: timestamp };
}

export async function updateMemory(db: DatabaseAdapter, input: {
  id: number;
  workspace_id: string;
  content: string;
  memory_type?: string;
  status?: "active" | "archived";
  source?: string;
  metadata?: unknown;
}) {
  const timestamp = new Date().toISOString();
  await db.run(
    `UPDATE memories
     SET content = ?, memory_type = COALESCE(?, memory_type), status = COALESCE(?, status), source = COALESCE(?, source), metadata_json = COALESCE(?, metadata_json), updated_at = ?
     WHERE id = ? AND workspace_id = ?`,
    [
      input.content,
      input.memory_type || null,
      input.status || null,
      input.source || null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata || {}),
      timestamp,
      input.id,
      input.workspace_id
    ]
  );
  return { id: input.id, updated_at: timestamp };
}
