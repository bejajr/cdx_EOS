import type { DatabaseAdapter } from "./db";

export const EVENT_TYPES = {
  MESSAGE_CREATED: "MESSAGE_CREATED",
  FILE_UPLOADED: "FILE_UPLOADED",
  TASK_CREATED: "TASK_CREATED",
  WORKFLOW_TRIGGERED: "WORKFLOW_TRIGGERED",
  CONNECTOR_SYNCED: "CONNECTOR_SYNCED",
  MEMORY_UPDATED: "MEMORY_UPDATED",
  DECISION_RECORDED: "DECISION_RECORDED"
} as const;

export type EventType = keyof typeof EVENT_TYPES | (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
export type EventStatus = "pending" | "processing" | "completed" | "failed";

export type WorkspaceEvent = {
  id: number;
  workspace_id: string;
  group_id?: string | null;
  type: string;
  status: EventStatus;
  actor_type: string;
  actor_id?: string | null;
  payload_json?: string | null;
  available_at?: string | null;
  completed_at?: string | null;
  error_json?: string | null;
  created_at: string;
};

export async function createEvent(db: DatabaseAdapter, input: {
  workspace_id: string;
  group_id?: string | null;
  type: EventType;
  actor_type?: string;
  actor_id?: string | null;
  payload?: unknown;
  available_at?: string | null;
}) {
  const timestamp = new Date().toISOString();
  const availableAt = input.available_at || timestamp;
  const result = await db.run(
    `INSERT INTO events (workspace_id, group_id, type, status, actor_type, actor_id, payload_json, available_at, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      input.workspace_id,
      input.group_id || null,
      input.type,
      input.actor_type || "system",
      input.actor_id || null,
      JSON.stringify(input.payload || {}),
      availableAt,
      timestamp
    ]
  );
  return { id: result.lastInsertRowid, status: "pending" as const, created_at: timestamp, available_at: availableAt };
}

export async function getPendingEvents(db: DatabaseAdapter, input: {
  workspace_id?: string;
  limit?: number;
} = {}) {
  const limit = Math.max(1, Math.min(input.limit || 25, 100));
  const now = new Date().toISOString();
  if (input.workspace_id) {
    return db.all<WorkspaceEvent>(
      `SELECT * FROM events
       WHERE workspace_id = ?
         AND status = 'pending'
         AND (available_at IS NULL OR available_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      [input.workspace_id, now, limit]
    );
  }
  return db.all<WorkspaceEvent>(
    `SELECT * FROM events
     WHERE status = 'pending'
       AND (available_at IS NULL OR available_at <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [now, limit]
  );
}

export async function completeEvent(db: DatabaseAdapter, input: {
  event_id: number | string;
  result?: unknown;
}) {
  const timestamp = new Date().toISOString();
  await db.run(
    `UPDATE events
     SET status = 'completed',
         completed_at = ?,
         error_json = NULL
     WHERE id = ?`,
    [timestamp, Number(input.event_id)]
  );
  return { id: Number(input.event_id), status: "completed" as const, completed_at: timestamp };
}

export async function failEvent(db: DatabaseAdapter, input: {
  event_id: number | string;
  error: unknown;
}) {
  const timestamp = new Date().toISOString();
  const errorPayload = input.error instanceof Error
    ? { message: input.error.message, name: input.error.name }
    : { message: String(input.error || "Event failed") };
  await db.run(
    `UPDATE events
     SET status = 'failed',
         completed_at = ?,
         error_json = ?
     WHERE id = ?`,
    [timestamp, JSON.stringify(errorPayload), Number(input.event_id)]
  );
  return { id: Number(input.event_id), status: "failed" as const, completed_at: timestamp };
}

export async function getEventsForWorkspace(db: DatabaseAdapter, input: {
  workspace_id: string;
  status?: EventStatus;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit || 100, 500));
  if (input.status) {
    return db.all<WorkspaceEvent>(
      `SELECT * FROM events
       WHERE workspace_id = ? AND status = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [input.workspace_id, input.status, limit]
    );
  }
  return db.all<WorkspaceEvent>(
    `SELECT * FROM events
     WHERE workspace_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [input.workspace_id, limit]
  );
}
