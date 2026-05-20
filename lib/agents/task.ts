import type { DatabaseAdapter } from "../db";

export type TaskAgentInput = {
  workspace_id: string;
  group_id?: string | null;
  title?: string;
  due_at?: string | null;
  priority?: "low" | "normal" | "high";
  assigned_to_user_id?: string | null;
  source_event_id?: number | string | null;
};

export async function taskAgent(db: DatabaseAdapter, input: TaskAgentInput) {
  const title = input.title?.trim();
  if (!title) {
    return {
      agent: "task",
      status: "placeholder",
      message: "Task agent is ready to create tasks when a title is provided."
    };
  }

  const timestamp = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO tasks (workspace_id, group_id, title, status, priority, due_at, assigned_to_user_id, source, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.workspace_id,
      input.group_id || null,
      title,
      input.priority || "normal",
      input.due_at || null,
      input.assigned_to_user_id || null,
      input.source_event_id ? `event:${input.source_event_id}` : "taskAgent",
      JSON.stringify({ source_event_id: input.source_event_id || null }),
      timestamp,
      timestamp
    ]
  );

  return {
    agent: "task",
    status: "created",
    task_id: result.lastInsertRowid
  };
}
