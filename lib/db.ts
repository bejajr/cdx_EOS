export type AppMode = "local" | "hybrid" | "cloud";

export const APP_MODE: AppMode = ["local", "hybrid", "cloud"].includes(process.env.APP_MODE || "")
  ? (process.env.APP_MODE as AppMode)
  : "local";
export const DEFAULT_WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID || "local-default";
export const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "local-user";
export const DEFAULT_GROUP_ID = process.env.DEFAULT_GROUP_ID || "group-operations";

export type WorkspaceScoped = {
  workspace_id: string;
};

export type QueryParams = Array<string | number | null | boolean>;

export type DatabaseAdapter = {
  mode: AppMode;
  get<T = unknown>(sql: string, params?: QueryParams): Promise<T | null>;
  all<T = unknown>(sql: string, params?: QueryParams): Promise<T[]>;
  run(sql: string, params?: QueryParams): Promise<{ lastInsertRowid?: number | bigint; changes?: number }>;
};

export function getWorkspaceId(input?: string | null) {
  return input?.trim() || DEFAULT_WORKSPACE_ID;
}

export function getUserId(input?: string | null) {
  return input?.trim() || DEFAULT_USER_ID;
}

export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  parent_workspace_id TEXT,
  name TEXT NOT NULL,
  workspace_type TEXT NOT NULL DEFAULT 'personal',
  mode TEXT NOT NULL DEFAULT 'local',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  organization_id TEXT,
  parent_department_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (parent_department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  department_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS markdown_views (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  view_type TEXT NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT,
  last_synced_at TEXT NOT NULL,
  metadata_json TEXT,
  UNIQUE (workspace_id, group_id, view_type),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  title TEXT,
  metadata_json TEXT,
  deactivated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  member_type TEXT NOT NULL DEFAULT 'employee',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL,
  left_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  parent_group_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  group_type TEXT NOT NULL DEFAULT 'team',
  description TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (parent_group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, group_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_permissions (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, group_id, resource_type, permission),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE (resource_type, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  granted_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, role_id, permission_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, group_id, user_id, role_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS work_assignments (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  assigned_to_user_id TEXT,
  assigned_to_group_id TEXT,
  assigned_by TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS user_transitions (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  from_group_id TEXT,
  to_group_id TEXT,
  from_role_id TEXT,
  to_role_id TEXT,
  transition_type TEXT NOT NULL,
  notes TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  project_id TEXT,
  user_id TEXT,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT,
  group_id TEXT,
  project_id TEXT,
  thread_id TEXT,
  job_id INTEGER,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  user_id TEXT,
  memory_type TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  project_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  payload_json TEXT,
  available_at TEXT,
  completed_at TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  requester_id TEXT,
  owner_id TEXT,
  title TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  summary TEXT,
  due_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  owner_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  author_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  user_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS approval_flows (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required_group_id TEXT,
  required_user_id TEXT,
  decided_by TEXT,
  decided_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT,
  group_id TEXT,
  project_id TEXT,
  job_id INTEGER,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at TEXT,
  assigned_to_user_id TEXT,
  source TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS agent_outputs (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  project_id TEXT,
  thread_id TEXT,
  agent_name TEXT NOT NULL,
  output_type TEXT NOT NULL DEFAULT 'message',
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
);

CREATE TABLE IF NOT EXISTS agent_state (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  agent_name TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, agent_name),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS file_sources (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  project_id TEXT,
  label TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'local',
  path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_indexed_at TEXT,
  last_index_error TEXT,
  last_indexed_document_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  project_id TEXT,
  owner_id TEXT,
  file_source_id INTEGER,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  byte_size INTEGER,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (file_source_id) REFERENCES file_sources(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  project_id TEXT,
  file_source_id INTEGER,
  connector_id INTEGER,
  title TEXT NOT NULL,
  source_path TEXT,
  content_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (file_source_id) REFERENCES file_sources(id),
  FOREIGN KEY (connector_id) REFERENCES connectors(id)
);

CREATE TABLE IF NOT EXISTS markdown_files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  project_id TEXT,
  file_id TEXT,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'generated',
  content_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, file_path),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  document_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE TABLE IF NOT EXISTS chunk_embeddings (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  document_id INTEGER NOT NULL,
  chunk_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'local',
  model TEXT NOT NULL DEFAULT 'local-hash-v1',
  dimensions INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, chunk_id, provider, model),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (chunk_id) REFERENCES document_chunks(id)
);

CREATE TABLE IF NOT EXISTS connectors (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  provider TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, provider),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS connector_syncs (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  connector_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (connector_id) REFERENCES connectors(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  before_json TEXT,
  after_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_project ON chat_threads(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_workspace ON document_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_workspace ON chunk_embeddings(workspace_id, document_id);
CREATE INDEX IF NOT EXISTS idx_events_workspace_status ON events(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id, created_at);
`;

export async function ensureDefaultWorkspace(db: DatabaseAdapter) {
  const timestamp = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO workspaces (id, name, workspace_type, mode, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [DEFAULT_WORKSPACE_ID, "EOS Personal Workspace", "personal", APP_MODE, JSON.stringify({ product: "EOS", local_first: true }), timestamp, timestamp]
  );
  await db.run(
    `INSERT OR IGNORE INTO users (id, workspace_id, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID, "Local User", "owner", timestamp, timestamp]
  );
  await db.run(
    `INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, member_type, status, joined_at, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `member-${DEFAULT_WORKSPACE_ID}-${DEFAULT_USER_ID}`,
      DEFAULT_WORKSPACE_ID,
      DEFAULT_USER_ID,
      "employee",
      "active",
      timestamp,
      JSON.stringify({ system_default: true }),
      timestamp,
      timestamp
    ]
  );
  await db.run(
    `INSERT OR IGNORE INTO groups (id, workspace_id, name, slug, group_type, description, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [DEFAULT_GROUP_ID, DEFAULT_WORKSPACE_ID, "Operations", "operations", "department", "Default operational group.", JSON.stringify({ system_default: true }), timestamp, timestamp]
  );
  await db.run(
    `INSERT OR IGNORE INTO group_members (workspace_id, group_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    [DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID, DEFAULT_USER_ID, "owner", timestamp]
  );
}
