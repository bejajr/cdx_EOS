import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = process.cwd();
loadDotEnv(join(ROOT, ".env"));

const APP_MODE = ["local", "hybrid", "cloud"].includes(process.env.APP_MODE) ? process.env.APP_MODE : "local";
const DEFAULT_WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID || "local-default";
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "local-user";
const DEFAULT_GROUP_ID = process.env.DEFAULT_GROUP_ID || "group-operations";
const DATA_DIR = join(ROOT, "work-wiki-data");
const JOBS_DIR = join(DATA_DIR, "jobs");
const JIMMY_DIR = join(DATA_DIR, "jimmy");
const SOURCE_DOCS_DIR = join(DATA_DIR, "source-documents");
const SOURCE_WIKI_CATEGORY = "source-knowledge";
const JIMMY_CHAT_LOG = join(JIMMY_DIR, "chat.md");
const DB_PATH = join(DATA_DIR, "work-wiki.sqlite");
const PUBLIC_DIR = join(ROOT, "public");
const DOCS_DIR = join(ROOT, "docs");
let pendingJimmyWikiDraft = null;

mkdirSync(JOBS_DIR, { recursive: true });
mkdirSync(JIMMY_DIR, { recursive: true });
mkdirSync(SOURCE_DOCS_DIR, { recursive: true });
ensureJimmyChatLog();

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    organization TEXT,
    email TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    requester_id INTEGER,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    due_at TEXT,
    folder_path TEXT NOT NULL,
    summary TEXT,
    next_action TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (requester_id) REFERENCES people(id)
  );

  CREATE TABLE IF NOT EXISTS wiki_files (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    purpose TEXT,
    content_hash TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'normal',
    due_at TEXT,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY,
    job_id INTEGER,
    title TEXT NOT NULL,
    due_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    job_id INTEGER,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS assistant_messages (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflow_events (
    id INTEGER PRIMARY KEY,
    job_id INTEGER,
    event_type TEXT NOT NULL,
    payload_json TEXT,
    handled_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS source_documents (
    id INTEGER PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL DEFAULT 'reference',
    status TEXT NOT NULL DEFAULT 'indexed',
    content_hash TEXT,
    extracted_text TEXT,
    markdown_path TEXT,
    imported_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

ensureColumn("source_documents", "markdown_path", "TEXT");
ensureAiWorkspaceSchema();
ensureDefaultAiWorkspace();

const wikiTemplates = {
  "program.md": ({ title }) => `# Job Program

## Goal

Help complete "${title}" efficiently while preserving useful documentation for future reuse.

## Rules

- Preserve known facts exactly.
- Do not invent missing information.
- Mark unknowns as Unknown.
- Turn ambiguity into follow-up questions.
- Keep tasks actionable.
- Keep reminders specific and dated when possible.
- Suggest next actions when the job appears blocked.

## Files To Maintain

- overview.md
- intake.md
- tasks.md
- reminders.md
- notes.md
- decisions.md
- workflow.md
- research.md
- final-summary.md
`,
  "overview.md": ({ title, requesterName, organization, summary, desiredOutcome }) => `# ${title}

## Summary

${summary || "Unknown"}

## Requester

- Name: ${requesterName || "Unknown"}
- Organization/team: ${organization || "Unknown"}

## Desired Outcome

${desiredOutcome || "Unknown"}

## Status

Open
`,
  "intake.md": (input) => `# Intake

| Field | Value |
| --- | --- |
| Request title | ${input.title || "Unknown"} |
| Requester | ${input.requesterName || "Unknown"} |
| Requester type | ${input.requesterType || "Unknown"} |
| Organization/team | ${input.organization || "Unknown"} |
| Priority | ${input.priority || "normal"} |
| Due date | ${input.dueAt || "Unknown"} |
| Desired outcome | ${input.desiredOutcome || "Unknown"} |
| Known constraints | ${input.constraints || "Unknown"} |
| People involved | ${input.peopleInvolved || "Unknown"} |
| Related links | ${input.links || "Unknown"} |

## Raw Request

${input.rawRequest || input.summary || "Unknown"}

## Follow-Up Questions

- Unknown
`,
  "tasks.md": ({ nextAction }) => `# Tasks

- [ ] ${nextAction || "Clarify the request and identify the next action."}
`,
  "reminders.md": ({ reminderTitle, reminderAt }) => `# Reminders

${reminderTitle ? `- [ ] ${reminderTitle}${reminderAt ? ` - ${reminderAt}` : ""}` : "- None yet"}
`,
  "notes.md": () => "# Notes\n\n",
  "decisions.md": () => "# Decisions\n\n",
  "workflow.md": () => "# Workflow\n\n## Current Process\n\n1. Intake request\n2. Clarify missing information\n3. Track tasks and reminders\n4. Document outcome\n",
  "research.md": () => "# Research\n\n",
  "final-summary.md": () => "# Final Summary\n\n"
};

function now() {
  return new Date().toISOString();
}

function formatIsoForDashboard(value) {
  if (!value) return "No date";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return String(value);
  }
}

function localDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  if (statSync(filePath).isDirectory()) {
    throw new Error(`Expected .env to be a file, but found a directory at ${filePath}. Delete that directory and create a file named .env.`);
  }
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some(column => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

function ensureAiWorkspaceSchema() {
  db.exec(`
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
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (group_id) REFERENCES groups(id)
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
    CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_document_chunks_workspace ON document_chunks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_workspace ON chunk_embeddings(workspace_id, document_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id, created_at);
  `);

  ensureColumn("chat_messages", "workspace_id", "TEXT");
  ensureColumn("chat_messages", "thread_id", "TEXT");
  ensureColumn("chat_messages", "group_id", "TEXT");
  ensureColumn("chat_messages", "project_id", "TEXT");
  ensureColumn("chat_messages", "metadata_json", "TEXT");
  ensureColumn("assistant_messages", "workspace_id", "TEXT");
  ensureColumn("assistant_messages", "thread_id", "TEXT");
  ensureColumn("assistant_messages", "group_id", "TEXT");
  ensureColumn("assistant_messages", "metadata_json", "TEXT");
  ensureColumn("tasks", "workspace_id", "TEXT");
  ensureColumn("tasks", "group_id", "TEXT");
  ensureColumn("tasks", "project_id", "TEXT");
  ensureColumn("tasks", "assigned_to_user_id", "TEXT");
  ensureColumn("tasks", "metadata_json", "TEXT");
  ensureColumn("workflow_events", "workspace_id", "TEXT");
  ensureColumn("workflow_events", "group_id", "TEXT");
  ensureColumn("workspaces", "parent_workspace_id", "TEXT");
  ensureColumn("workspaces", "workspace_type", "TEXT NOT NULL DEFAULT 'personal'");
  ensureColumn("workspaces", "metadata_json", "TEXT");
  ensureColumn("users", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("users", "title", "TEXT");
  ensureColumn("users", "metadata_json", "TEXT");
  ensureColumn("users", "deactivated_at", "TEXT");
  ensureColumn("chat_threads", "group_id", "TEXT");
  ensureColumn("chat_threads", "project_id", "TEXT");
  ensureColumn("memories", "group_id", "TEXT");
  ensureColumn("memories", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("memories", "source", "TEXT");
  ensureColumn("events", "group_id", "TEXT");
  ensureColumn("events", "project_id", "TEXT");
  ensureColumn("events", "status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn("events", "available_at", "TEXT");
  ensureColumn("events", "completed_at", "TEXT");
  ensureColumn("events", "error_json", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_workspace_status ON events(workspace_id, status)");
  ensureColumn("agent_outputs", "group_id", "TEXT");
  ensureColumn("agent_outputs", "project_id", "TEXT");
  ensureColumn("agent_state", "group_id", "TEXT");
  ensureColumn("file_sources", "group_id", "TEXT");
  ensureColumn("file_sources", "project_id", "TEXT");
  ensureColumn("file_sources", "last_indexed_at", "TEXT");
  ensureColumn("file_sources", "last_index_error", "TEXT");
  ensureColumn("file_sources", "last_indexed_document_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("connectors", "group_id", "TEXT");
  ensureColumn("documents", "group_id", "TEXT");
  ensureColumn("documents", "project_id", "TEXT");
  ensureColumn("document_chunks", "group_id", "TEXT");
  ensureColumn("chunk_embeddings", "group_id", "TEXT");
  ensureColumn("connector_syncs", "group_id", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_threads_project ON chat_threads(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(workspace_id, project_id);
  `);
}

function ensureDefaultAiWorkspace() {
  const timestamp = now();
  db.prepare(`
    INSERT OR IGNORE INTO workspaces (id, name, workspace_type, mode, metadata_json, created_at, updated_at)
    VALUES (?, 'EOS Personal Workspace', 'personal', ?, ?, ?, ?)
  `).run(DEFAULT_WORKSPACE_ID, APP_MODE, JSON.stringify({ product: "EOS", local_first: true }), timestamp, timestamp);
  db.prepare(`
    INSERT OR IGNORE INTO users (id, workspace_id, name, role, created_at, updated_at)
    VALUES (?, ?, 'Local User', 'owner', ?, ?)
  `).run(DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID, timestamp, timestamp);
  db.prepare(`
    INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, member_type, status, joined_at, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, 'employee', 'active', ?, ?, ?, ?)
  `).run(
    `member-${DEFAULT_WORKSPACE_ID}-${DEFAULT_USER_ID}`,
    DEFAULT_WORKSPACE_ID,
    DEFAULT_USER_ID,
    timestamp,
    JSON.stringify({ system_default: true }),
    timestamp,
    timestamp
  );
  const defaultGroups = [
    { id: "group-operations", parent: null, name: "Operations", slug: "operations", type: "department", description: "Default home for general operational work." },
    { id: "group-safety", parent: "group-operations", name: "Safety", slug: "safety", type: "department", description: "Safety programs, incidents, inspections, training, and compliance." },
    { id: "group-projects", parent: "group-operations", name: "Projects", slug: "projects", type: "department", description: "Project-level requests, coordination, and field execution." },
    { id: "group-documents", parent: "group-operations", name: "Documents", slug: "documents", type: "function", description: "Source knowledge, templates, drafts, exports, and reviewed documentation." },
    { id: "group-leadership", parent: "group-operations", name: "Leadership", slug: "leadership", type: "department", description: "Escalations, approvals, priorities, and business decisions." }
  ];
  for (const group of defaultGroups) {
    db.prepare(`
      INSERT OR IGNORE INTO groups (id, workspace_id, parent_group_id, name, slug, group_type, description, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      group.id,
      DEFAULT_WORKSPACE_ID,
      group.parent,
      group.name,
      group.slug,
      group.type,
      group.description,
      JSON.stringify({ system_default: true }),
      timestamp,
      timestamp
    );
  }
  db.prepare(`
    INSERT OR IGNORE INTO group_members (workspace_id, group_id, user_id, role, created_at)
    VALUES (?, ?, ?, 'owner', ?)
  `).run(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID, DEFAULT_USER_ID, timestamp);

  const permissions = [
    ["perm.users.manage", "users", "manage", "Create, update, activate, deactivate, and assign users."],
    ["perm.roles.manage", "roles", "manage", "Create roles and control role permissions."],
    ["perm.groups.manage", "groups", "manage", "Create groups and manage group membership."],
    ["perm.requests.create", "requests", "create", "Create operational requests and discrepancies."],
    ["perm.requests.manage", "requests", "manage", "Assign, update, close, and reassign requests."],
    ["perm.documents.read", "documents", "read", "Read approved knowledge documents."],
    ["perm.documents.write", "documents", "write", "Create and edit draft knowledge documents."],
    ["perm.documents.approve", "documents", "approve", "Approve documents for reuse."],
    ["perm.projects.read", "projects", "read", "Read visible projects."],
    ["perm.projects.manage", "projects", "manage", "Create and update visible projects."],
    ["perm.tasks.manage", "tasks", "manage", "Create and update visible tasks."],
    ["perm.chat.use", "chat", "use", "Use the assistant chat."],
    ["perm.admin.all", "admin", "all", "Full workspace administration."]
  ];
  for (const permission of permissions) {
    db.prepare(`
      INSERT OR IGNORE INTO permissions (id, resource_type, action, description)
      VALUES (?, ?, ?, ?)
    `).run(...permission);
  }

  const roles = [
    ["role-boss", "Boss/Admin", "boss-admin", "Controls roles, permissions, groups, and major approvals."],
    ["role-manager", "Manager", "manager", "Assigns work, manages requests, and reviews team activity."],
    ["role-safety", "Safety", "safety", "Creates and reviews safety knowledge, inspections, incidents, and training."],
    ["role-field-user", "Field User", "field-user", "Reports issues, completes assigned work, and reads approved knowledge."],
    ["role-viewer", "Viewer", "viewer", "Reads approved knowledge and visible requests."]
  ];
  for (const role of roles) {
    db.prepare(`
      INSERT OR IGNORE INTO roles (id, workspace_id, name, slug, description, is_system, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(role[0], DEFAULT_WORKSPACE_ID, role[1], role[2], role[3], timestamp, timestamp);
  }

  const rolePermissionMap = {
    "role-boss": permissions.map(permission => permission[0]),
    "role-manager": ["perm.requests.create", "perm.requests.manage", "perm.documents.read", "perm.documents.write", "perm.projects.read", "perm.projects.manage", "perm.tasks.manage", "perm.chat.use", "perm.groups.manage"],
    "role-safety": ["perm.requests.create", "perm.requests.manage", "perm.documents.read", "perm.documents.write", "perm.documents.approve", "perm.projects.read", "perm.tasks.manage", "perm.chat.use"],
    "role-field-user": ["perm.requests.create", "perm.documents.read", "perm.projects.read", "perm.tasks.manage", "perm.chat.use"],
    "role-viewer": ["perm.documents.read", "perm.projects.read", "perm.chat.use"]
  };
  for (const [roleId, permissionIds] of Object.entries(rolePermissionMap)) {
    for (const permissionId of permissionIds) {
      db.prepare(`
        INSERT OR IGNORE INTO role_permissions (workspace_id, role_id, permission_id, granted_by, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(DEFAULT_WORKSPACE_ID, roleId, permissionId, DEFAULT_USER_ID, timestamp);
    }
  }
  db.prepare(`
    INSERT OR IGNORE INTO user_roles (workspace_id, group_id, user_id, role_id, assigned_by, created_at)
    VALUES (?, ?, ?, 'role-boss', ?, ?)
  `).run(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID, DEFAULT_USER_ID, DEFAULT_USER_ID, timestamp);

  for (const provider of ["local_files", "github", "google_drive", "slack"]) {
    db.prepare(`
      INSERT OR IGNORE INTO connectors (workspace_id, provider, enabled, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      DEFAULT_WORKSPACE_ID,
      provider,
      provider === "local_files" ? 1 : 0,
      JSON.stringify({ placeholder: provider !== "local_files" }),
      timestamp,
      timestamp
    );
  }
  syncWorkspaceMarkdownViews(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID);
}

function ensureJimmyChatLog() {
  if (existsSync(JIMMY_CHAT_LOG)) return;
  writeFileSync(JIMMY_CHAT_LOG, `# Jimmy Chat Log

This file is generated by the local Work Wiki app. It records the global Jimmy chat so conversations remain readable outside SQLite.

`);
}

function appendJimmyChatLog(role, content) {
  const label = role === "assistant" ? "Jimmy" : "User";
  appendFileSync(JIMMY_CHAT_LOG, `## ${label} - ${now()}

${content}

`);
}

function getOutlookRedirectUri(req) {
  return process.env.MICROSOFT_REDIRECT_URI || `http://${req.headers.host}/auth/outlook/callback`;
}

function buildOutlookAuthUrl(req) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) return null;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", getOutlookRedirectUri(req));
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", "offline_access User.Read Mail.Read Mail.ReadWrite Calendars.Read");
  authUrl.searchParams.set("state", randomBytes(16).toString("hex"));
  return authUrl.toString();
}

function renderOutlookSetupPage(req) {
  const redirectUri = getOutlookRedirectUri(req);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Connect Outlook</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="auth-page">
      <section class="auth-card">
        <h1>Outlook connection is not configured yet</h1>
        <p>Add your Microsoft app credentials to <code>.env</code>, restart Jimmy, then press Connect Outlook again.</p>
        <pre>MICROSOFT_CLIENT_ID=your-azure-app-client-id
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=${escapeHtml(redirectUri)}</pre>
        <p>In Azure, add this exact redirect URI to the app registration before trying to sign in.</p>
        <a href="/">Back to Jimmy</a>
      </section>
    </main>
  </body>
</html>`;
}

function renderOutlookCallbackPage(url) {
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const message = error
    ? `Microsoft returned: ${escapeHtml(error)}`
    : code
      ? "Microsoft sign-in worked. The next build step is exchanging this code for tokens and storing the connection securely."
      : "Microsoft returned without a code.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Outlook Connection</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="auth-page">
      <section class="auth-card">
        <h1>Outlook Connection</h1>
        <p>${message}</p>
        <a href="/">Back to Jimmy</a>
      </section>
    </main>
  </body>
</html>`;
}

function slugify(value) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || "untitled-job";
}

function uniqueSlug(title) {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}-${slugify(title)}`;
  let slug = base;
  let i = 2;
  const exists = db.prepare("SELECT id FROM jobs WHERE slug = ?").get(slug);
  while (existsSync(join(JOBS_DIR, slug)) || db.prepare("SELECT id FROM jobs WHERE slug = ?").get(slug)) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function html(res, status, content) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(content);
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 15_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requestWorkspace(req, body = {}) {
  return {
    workspaceId: String(req.headers["x-workspace-id"] || body.workspaceId || body.workspace_id || DEFAULT_WORKSPACE_ID),
    userId: String(req.headers["x-user-id"] || body.userId || body.user_id || DEFAULT_USER_ID),
    groupId: String(req.headers["x-group-id"] || body.groupId || body.group_id || DEFAULT_GROUP_ID)
  };
}

function userIsWorkspaceAdmin({ workspaceId, userId }) {
  const row = db.prepare(`
    SELECT role_permissions.id
    FROM user_roles
    JOIN role_permissions
      ON role_permissions.workspace_id = user_roles.workspace_id
     AND role_permissions.role_id = user_roles.role_id
    WHERE user_roles.workspace_id = ?
      AND user_roles.user_id = ?
      AND role_permissions.permission_id = 'perm.admin.all'
    LIMIT 1
  `).get(workspaceId, userId);
  return Boolean(row);
}

function userHasPermission({ workspaceId, userId, groupId = null, permissionId }) {
  if (!permissionId) return false;
  if (permissionId !== "perm.admin.all" && userIsWorkspaceAdmin({ workspaceId, userId })) return true;
  const row = db.prepare(`
    SELECT role_permissions.id
    FROM user_roles
    JOIN role_permissions
      ON role_permissions.workspace_id = user_roles.workspace_id
     AND role_permissions.role_id = user_roles.role_id
    WHERE user_roles.workspace_id = ?
      AND user_roles.user_id = ?
      AND role_permissions.permission_id IN (?, 'perm.admin.all')
      AND (user_roles.group_id = ? OR user_roles.group_id IS NULL OR ? IS NULL)
    LIMIT 1
  `).get(workspaceId, userId, permissionId, groupId, groupId);
  return Boolean(row);
}

function userCanAccessGroup({ workspaceId, userId, groupId = null }) {
  if (!groupId) return true;
  if (userIsWorkspaceAdmin({ workspaceId, userId })) return true;
  const row = db.prepare(`
    SELECT group_members.user_id
    FROM group_members
    WHERE workspace_id = ?
      AND group_id = ?
      AND user_id = ?
    UNION
    SELECT user_roles.user_id
    FROM user_roles
    WHERE workspace_id = ?
      AND group_id = ?
      AND user_id = ?
    LIMIT 1
  `).get(workspaceId, groupId, userId, workspaceId, groupId, userId);
  return Boolean(row);
}

function forbidden(res, message = "You do not have permission to access this resource.") {
  return json(res, 403, { error: message });
}

function listUserPermissions(workspaceId, userId, groupId = null) {
  return db.prepare(`
    SELECT DISTINCT permissions.*
    FROM user_roles
    JOIN role_permissions
      ON role_permissions.workspace_id = user_roles.workspace_id
     AND role_permissions.role_id = user_roles.role_id
    JOIN permissions ON permissions.id = role_permissions.permission_id
    WHERE user_roles.workspace_id = ?
      AND user_roles.user_id = ?
      AND (user_roles.group_id = ? OR user_roles.group_id IS NULL OR ? IS NULL)
    ORDER BY permissions.resource_type, permissions.action
  `).all(workspaceId, userId, groupId, groupId);
}

function createWorkspaceEvent({ workspaceId, groupId = DEFAULT_GROUP_ID, projectId = null, type, actorType = "system", actorId = null, payload = {} }) {
  const timestamp = now();
  const result = db.prepare(`
    INSERT INTO events (workspace_id, group_id, project_id, type, status, actor_type, actor_id, payload_json, available_at, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(workspaceId, groupId, projectId, type, actorType, actorId, JSON.stringify(payload), timestamp, timestamp);
  return { id: Number(result.lastInsertRowid), status: "pending", created_at: timestamp, available_at: timestamp };
}

function createAuditLog({ workspaceId, groupId = DEFAULT_GROUP_ID, actorId = null, action, resourceType = null, resourceId = null, before = null, after = null, metadata = {} }) {
  const timestamp = now();
  const id = `audit_${randomBytes(12).toString("hex")}`;
  db.prepare(`
    INSERT INTO audit_logs (id, workspace_id, group_id, actor_id, action, resource_type, resource_id, before_json, after_json, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspaceId,
    groupId,
    actorId,
    action,
    resourceType,
    resourceId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    JSON.stringify(metadata),
    timestamp
  );
  return { id, created_at: timestamp };
}

function uniqueProjectSlug(workspaceId, name, existingId = null) {
  const base = slugifyWikiTitle(name || "project");
  let slug = base;
  let suffix = 2;
  while (db.prepare("SELECT id FROM projects WHERE workspace_id = ? AND slug = ? AND id != ?").get(workspaceId, slug, existingId || "")) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function createProject({ workspaceId, groupId = DEFAULT_GROUP_ID, userId = DEFAULT_USER_ID, name, summary = null, status = "active", metadata = {} }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  const timestamp = now();
  const id = `project_${randomBytes(12).toString("hex")}`;
  const slug = uniqueProjectSlug(workspaceId, cleanName);
  db.prepare(`
    INSERT INTO projects (id, workspace_id, group_id, owner_id, name, slug, status, summary, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspaceId,
    groupId,
    userId,
    cleanName,
    slug,
    ["active", "paused", "done", "archived"].includes(status) ? status : "active",
    summary,
    JSON.stringify(metadata),
    timestamp,
    timestamp
  );
  return db.prepare("SELECT * FROM projects WHERE id = ? AND workspace_id = ?").get(id, workspaceId);
}

function buildWorkspaceSummary({ workspaceId, groupId = DEFAULT_GROUP_ID, userId = DEFAULT_USER_ID }) {
  const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId);
  if (!workspace) return null;
  const groups = db.prepare(`
    SELECT groups.*,
      (SELECT count(*) FROM group_members WHERE group_members.workspace_id = groups.workspace_id AND group_members.group_id = groups.id) AS member_count
    FROM groups
    WHERE workspace_id = ?
    ORDER BY COALESCE(parent_group_id, ''), name
  `).all(workspaceId).filter(group => userCanAccessGroup({ workspaceId, userId, groupId: group.id }));
  const visibleGroupIds = new Set(groups.map(group => group.id));
  const canReadProjects = userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.projects.read" });
  const canReadDocuments = userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.documents.read" });
  const projects = canReadProjects
    ? db.prepare(`
      SELECT projects.*,
        (SELECT count(*) FROM tasks WHERE tasks.workspace_id = projects.workspace_id AND tasks.project_id = projects.id AND tasks.status != 'done') AS open_task_count,
        (SELECT count(*) FROM documents WHERE documents.workspace_id = projects.workspace_id AND documents.project_id = projects.id) AS document_count,
        (SELECT count(*) FROM chat_threads WHERE chat_threads.workspace_id = projects.workspace_id AND chat_threads.project_id = projects.id) AS thread_count
      FROM projects
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT 25
    `).all(workspaceId).filter(project => !project.group_id || visibleGroupIds.has(project.group_id))
    : [];
  const openTasks = userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.tasks.manage" })
    ? db.prepare(`
      SELECT * FROM tasks
      WHERE workspace_id = ?
        AND status != 'done'
      ORDER BY COALESCE(due_at, updated_at) ASC
      LIMIT 25
    `).all(workspaceId).filter(task => !task.group_id || visibleGroupIds.has(task.group_id))
    : [];
  const recentEvents = db.prepare(`
    SELECT * FROM events
    WHERE workspace_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(workspaceId).filter(event => !event.group_id || visibleGroupIds.has(event.group_id)).slice(0, 20);
  const recentAgentOutputs = db.prepare(`
    SELECT * FROM agent_outputs
    WHERE workspace_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(workspaceId).filter(output => !output.group_id || visibleGroupIds.has(output.group_id)).slice(0, 20);
  const recentDocuments = canReadDocuments
    ? db.prepare(`
      SELECT * FROM documents
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT 50
    `).all(workspaceId).filter(document => !document.group_id || visibleGroupIds.has(document.group_id)).slice(0, 20)
    : [];
  return {
    workspace,
    permissions: {
      canReadProjects,
      canReadDocuments,
      canUseChat: userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.chat.use" }),
      canManageTasks: userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.tasks.manage" })
    },
    counts: {
      groups: groups.length,
      projects: projects.length,
      openTasks: openTasks.length,
      recentEvents: recentEvents.length,
      recentAgentOutputs: recentAgentOutputs.length,
      recentDocuments: recentDocuments.length
    },
    groups,
    projects,
    openTasks,
    recentEvents,
    recentAgentOutputs,
    recentDocuments
  };
}

function buildProjectSummary({ workspaceId, projectId, userId = DEFAULT_USER_ID }) {
  const project = db.prepare("SELECT * FROM projects WHERE workspace_id = ? AND id = ?").get(workspaceId, projectId);
  if (!project) return null;
  if (!userHasPermission({ workspaceId, userId, groupId: project.group_id, permissionId: "perm.projects.read" }) || !userCanAccessGroup({ workspaceId, userId, groupId: project.group_id })) {
    return { forbidden: true };
  }
  const openTasks = db.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND project_id = ? AND status != 'done' ORDER BY COALESCE(due_at, updated_at) ASC LIMIT 25").all(workspaceId, projectId);
  const completedTasks = db.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND project_id = ? AND status = 'done' ORDER BY updated_at DESC LIMIT 10").all(workspaceId, projectId);
  const documents = db.prepare("SELECT * FROM documents WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 25").all(workspaceId, projectId);
  const threads = db.prepare("SELECT * FROM chat_threads WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 25").all(workspaceId, projectId);
  const events = db.prepare("SELECT * FROM events WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 25").all(workspaceId, projectId);
  const agentOutputs = db.prepare("SELECT * FROM agent_outputs WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 25").all(workspaceId, projectId);
  const markdownFiles = db.prepare("SELECT * FROM markdown_files WHERE workspace_id = ? AND project_id = ? ORDER BY title").all(workspaceId, projectId);
  return {
    project,
    counts: {
      openTasks: openTasks.length,
      completedTasks: completedTasks.length,
      documents: documents.length,
      threads: threads.length,
      events: events.length,
      agentOutputs: agentOutputs.length,
      markdownFiles: markdownFiles.length
    },
    openTasks,
    completedTasks,
    documents,
    threads,
    events,
    agentOutputs,
    markdownFiles
  };
}

function saveAgentOutput({ workspaceId, groupId = DEFAULT_GROUP_ID, projectId = null, threadId = null, agentName, outputType = "activity", content, metadata = {} }) {
  const timestamp = now();
  const result = db.prepare(`
    INSERT INTO agent_outputs (workspace_id, group_id, project_id, thread_id, agent_name, output_type, content, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workspaceId,
    groupId,
    projectId,
    threadId,
    agentName,
    outputType,
    typeof content === "string" ? content : JSON.stringify(content),
    JSON.stringify(metadata),
    timestamp
  );
  return db.prepare("SELECT * FROM agent_outputs WHERE id = ?").get(Number(result.lastInsertRowid));
}

function completeWorkspaceEvent(eventId, result = null) {
  const timestamp = now();
  db.prepare(`
    UPDATE events
    SET status = 'completed', completed_at = ?, error_json = NULL
    WHERE id = ?
  `).run(timestamp, Number(eventId));
  return { id: Number(eventId), status: "completed", completed_at: timestamp, result };
}

function failWorkspaceEvent(eventId, error) {
  const timestamp = now();
  const payload = error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error || "Event failed") };
  db.prepare(`
    UPDATE events
    SET status = 'failed', completed_at = ?, error_json = ?
    WHERE id = ?
  `).run(timestamp, JSON.stringify(payload), Number(eventId));
  return { id: Number(eventId), status: "failed", completed_at: timestamp, error: payload };
}

function getPendingWorkspaceEvents(workspaceId, limit = 25) {
  return db.prepare(`
    SELECT * FROM events
    WHERE workspace_id = ?
      AND status = 'pending'
      AND (available_at IS NULL OR available_at <= ?)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(workspaceId, now(), Math.max(1, Math.min(Number(limit) || 25, 100)));
}

function runPendingWorkspaceEvents(workspaceId, limit = 10) {
  const events = getPendingWorkspaceEvents(workspaceId, limit);
  return events.map(event => {
    const payload = (() => {
      try {
        return event.payload_json ? JSON.parse(event.payload_json) : {};
      } catch {
        return {};
      }
    })();
    const timestamp = now();
    let result = { message: `Processed ${event.type} event with placeholder workflow runner.` };
    const eventProjectId = event.project_id || payload.project_id || payload.projectId || null;

    if (event.type === "TASK_CREATED" && payload.task_id) {
      result = { message: "Task event recorded.", task_id: payload.task_id };
    } else if (event.type === "TASK_CREATED" && payload.title) {
      const task = createWorkspaceTask({
        workspaceId: event.workspace_id,
        groupId: event.group_id || DEFAULT_GROUP_ID,
        projectId: eventProjectId,
        userId: event.actor_id || DEFAULT_USER_ID,
        title: String(payload.title),
        dueAt: payload.due_at || payload.dueAt || parseDueDateFromText(String(payload.title)),
        priority: payload.priority || priorityFromText(String(payload.title)),
        source: `event:${event.id}`,
        metadata: { source_event_id: event.id, event_type: event.type, payload }
      });
      result = {
        message: "Task created from event.",
        task_id: task?.id,
        task,
        markdown: safeSyncProjectMarkdownFiles(event.workspace_id, eventProjectId)
      };
    }

    if (event.type === "FILE_UPLOADED") {
      result = { message: "File event processed. Approved file sources indexed where available.", ...indexApprovedFileSources(event.workspace_id, event.group_id, eventProjectId) };
    }

    if (event.type === "DECISION_RECORDED" && payload.decision) {
      const memoryResult = db.prepare(`
        INSERT INTO memories (workspace_id, group_id, user_id, memory_type, content, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, 'decision', ?, ?, ?, ?)
      `).run(
        event.workspace_id,
        event.group_id || DEFAULT_GROUP_ID,
        event.actor_id || null,
        String(payload.decision),
        JSON.stringify({ source_event_id: event.id }),
        timestamp,
        timestamp
      );
      result = { message: "Decision recorded as memory.", memory_id: Number(memoryResult.lastInsertRowid) };
      if (eventProjectId) result.markdown = safeSyncProjectMarkdownFiles(event.workspace_id, eventProjectId);
    }

    saveAgentOutput({
      workspaceId: event.workspace_id,
      groupId: event.group_id || DEFAULT_GROUP_ID,
      projectId: eventProjectId,
      threadId: payload.thread_id || null,
      agentName: event.type === "TASK_CREATED" ? "task" : "workflow",
      outputType: event.type === "TASK_CREATED" ? "task_created" : "event_result",
      content: result.message || JSON.stringify(result),
      metadata: { event_id: event.id, event_type: event.type, result }
    });
    completeWorkspaceEvent(event.id, result);
    return { event_id: event.id, type: event.type, status: "completed", result };
  });
}

function createThread({ workspaceId, groupId = DEFAULT_GROUP_ID, projectId = null, userId, title = "New chat" }) {
  const timestamp = now();
  const id = `thread_${randomBytes(12).toString("hex")}`;
  db.prepare(`
    INSERT INTO chat_threads (id, workspace_id, group_id, project_id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, groupId, projectId, userId, title, timestamp, timestamp);
  return db.prepare("SELECT * FROM chat_threads WHERE id = ? AND workspace_id = ?").get(id, workspaceId);
}

function getOrCreateThread({ workspaceId, groupId, projectId = null, userId, threadId, message }) {
  if (threadId) {
    const existing = db.prepare("SELECT * FROM chat_threads WHERE id = ? AND workspace_id = ?").get(threadId, workspaceId);
    if (existing) return existing;
  }
  const title = String(message || "New chat").replace(/\s+/g, " ").trim().slice(0, 80) || "New chat";
  return createThread({ workspaceId, groupId, projectId, userId, title });
}

function plannerAgent(message) {
  const lower = String(message || "").toLowerCase();
  const agents = ["researcher"];
  if (/\b(github|drive|slack|file|folder|source|document|repo)\b/.test(lower)) agents.push("connector");
  if (/\b(index|reindex|scan)\b/.test(lower)) agents.push("fileIndexer");
  if (/\b(remember|preference|always|my name|keep in mind)\b/.test(lower)) agents.push("memory");
  if (/\b(create|add|make|assign|remind|follow up|todo|task|due)\b/.test(lower)) agents.push("task");
  return {
    agents: [...new Set(agents)],
    reason: "Selected agents from lightweight intent keywords. Replace with an LLM planner when ready."
  };
}

function parseDueDateFromText(text) {
  const lower = String(text || "").toLowerCase();
  const base = new Date();
  base.setSeconds(0, 0);
  const atNine = date => {
    date.setHours(9, 0, 0, 0);
    return date.toISOString();
  };
  if (/\btomorrow\b/.test(lower)) {
    const date = new Date(base);
    date.setDate(date.getDate() + 1);
    return atNine(date);
  }
  if (/\btoday\b/.test(lower)) {
    return atNine(new Date(base));
  }
  if (/\bnext week\b/.test(lower)) {
    const date = new Date(base);
    date.setDate(date.getDate() + 7);
    return atNine(date);
  }
  const isoDate = lower.match(/\b(20\d{2}-\d{2}-\d{2})(?:[ t](\d{1,2}:\d{2}))?\b/);
  if (isoDate) {
    const value = isoDate[2] ? `${isoDate[1]}T${isoDate[2]}` : `${isoDate[1]}T09:00`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function priorityFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(urgent|critical|high priority|asap)\b/.test(lower)) return "high";
  if (/\b(low priority|whenever|low)\b/.test(lower)) return "low";
  return "normal";
}

function cleanTaskTitle(text) {
  return String(text || "")
    .replace(/^\/?(task|todo|remind|create task|add task|follow up)\b[:\s-]*/i, "")
    .replace(/\b(today|tomorrow|next week|due\s+20\d{2}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2})?)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function shouldCreateTaskFromMessage(message) {
  return /\b(create|add|make|assign|remind me|follow up|todo|task)\b/i.test(message)
    && !/\b(list|show|what are|what is|explain)\b/i.test(message);
}

function createWorkspaceTask({ workspaceId, groupId = DEFAULT_GROUP_ID, projectId = null, userId = DEFAULT_USER_ID, title, dueAt = null, priority = "normal", source = "taskAgent", metadata = {} }) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return null;
  const timestamp = now();
  const jobId = getOrCreatePersonalTasksJobId();
  const result = db.prepare(`
    INSERT INTO tasks (workspace_id, group_id, project_id, job_id, title, status, priority, due_at, assigned_to_user_id, source, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workspaceId,
    groupId,
    projectId,
    jobId,
    cleanTitle,
    priority,
    dueAt,
    userId,
    source,
    JSON.stringify(metadata),
    timestamp,
    timestamp
  );
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(result.lastInsertRowid));
}

function retrieveWorkspaceContext(workspaceId, groupId, query, limit = 6, actorId = null, projectId = null) {
  if (actorId && !userHasPermission({ workspaceId, userId: actorId, groupId, permissionId: "perm.documents.read" })) {
    createAuditLog({
      workspaceId,
      groupId,
      actorId,
      action: "retrieval.denied",
      resourceType: "document_chunks",
      metadata: { reason: "missing perm.documents.read", project_id: projectId }
    });
    return { content: "", citations: [] };
  }
  if (actorId && !userCanAccessGroup({ workspaceId, userId: actorId, groupId })) {
    createAuditLog({
      workspaceId,
      groupId,
      actorId,
      action: "retrieval.denied",
      resourceType: "document_chunks",
      metadata: { reason: "group access denied", project_id: projectId }
    });
    return { content: "", citations: [] };
  }
  const terms = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2).slice(0, 12);
  const chunks = db.prepare(`
    SELECT
      document_chunks.*,
      documents.title,
      documents.project_id,
      documents.source_path,
      documents.file_source_id,
      documents.connector_id,
      chunk_embeddings.vector_json,
      chunk_embeddings.model AS embedding_model,
      file_sources.enabled AS file_source_enabled,
      file_sources.source_type AS file_source_type
    FROM document_chunks
    JOIN documents ON documents.id = document_chunks.document_id
    LEFT JOIN chunk_embeddings
      ON chunk_embeddings.chunk_id = document_chunks.id
     AND chunk_embeddings.workspace_id = document_chunks.workspace_id
     AND chunk_embeddings.provider = 'local'
     AND chunk_embeddings.model = 'local-hash-v1'
    LEFT JOIN file_sources
      ON file_sources.id = documents.file_source_id
     AND file_sources.workspace_id = documents.workspace_id
    WHERE document_chunks.workspace_id = ?
      AND (document_chunks.group_id = ? OR documents.group_id = ? OR document_chunks.group_id IS NULL OR documents.group_id IS NULL)
      AND (? IS NULL OR documents.project_id = ?)
      AND (documents.file_source_id IS NULL OR file_sources.enabled = 1)
    ORDER BY document_chunks.created_at DESC
    LIMIT 200
  `).all(workspaceId, groupId, groupId, projectId, projectId);
  const queryVector = localEmbedding(query);
  const scored = chunks
    .map(chunk => {
      const haystack = `${chunk.title} ${chunk.source_path || ""} ${chunk.content}`.toLowerCase();
      const keywordScore = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      const vectorScore = cosineSimilarity(queryVector, parseVectorJson(chunk.vector_json));
      const score = keywordScore + Math.max(0, vectorScore) * 2;
      return { ...chunk, keywordScore, vectorScore, score };
    })
    .filter(chunk => chunk.keywordScore > 0 || chunk.vectorScore > 0.12 || terms.length === 0)
    .sort((a, b) => b.score - a.score || a.chunk_index - b.chunk_index)
    .slice(0, limit);
  const citations = scored.map((chunk, index) => ({
    label: `S${index + 1}`,
    document_id: Number(chunk.document_id),
    chunk_id: Number(chunk.id),
    chunk_index: Number(chunk.chunk_index),
    project_id: chunk.project_id || null,
    title: chunk.title,
    source_path: chunk.source_path,
    file_source_id: chunk.file_source_id || null,
    connector_id: chunk.connector_id || null,
    score: Number(chunk.score.toFixed(4)),
    keyword_score: chunk.keywordScore,
    vector_score: Number(chunk.vectorScore.toFixed(4))
  }));
  createAuditLog({
    workspaceId,
    groupId,
    actorId,
    action: "retrieval.search",
    resourceType: "document_chunks",
    metadata: {
      query_terms: terms,
      retrieval_mode: "hybrid-keyword-local-vector",
      project_id: projectId,
      candidate_count: chunks.length,
      returned_count: scored.length,
      citations: citations.map(citation => ({
        document_id: citation.document_id,
        chunk_id: citation.chunk_id,
        project_id: citation.project_id,
        file_source_id: citation.file_source_id,
        connector_id: citation.connector_id,
        source_path: citation.source_path
      }))
    }
  });
  return {
    content: scored.map((chunk, index) => `Citation: [S${index + 1}]\nSource: ${chunk.title}\nProject ID: ${chunk.project_id || "none"}\nPath: ${chunk.source_path || "unknown"}\n\n${chunk.content}`).join("\n\n---\n\n"),
    citations
  };
}

function retrieveMemories(workspaceId, groupId, query, limit = 8) {
  const terms = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2).slice(0, 12);
  const memories = db.prepare(`
    SELECT * FROM memories
    WHERE workspace_id = ?
      AND (group_id = ? OR group_id IS NULL)
      AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT 100
  `).all(workspaceId, groupId);
  return memories
    .map(memory => {
      const haystack = `${memory.memory_type} ${memory.content}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...memory, score };
    })
    .filter(memory => memory.score > 0 || /user_preference|profile/i.test(memory.memory_type))
    .sort((a, b) => b.score - a.score || String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, limit);
}

function enabledConnectorContext(workspaceId) {
  const connectors = db.prepare("SELECT * FROM connectors WHERE workspace_id = ? AND enabled = 1 ORDER BY provider").all(workspaceId);
  return connectors.map(connector => {
    if (connector.provider === "local_files") {
      return {
        provider: "local_files",
        content: "Local files are available through approved file_sources and indexed document_chunks.",
        metadata: { implemented: true }
      };
    }
    return {
      provider: connector.provider,
      content: `${connector.provider} connector placeholder. OAuth and remote sync are not implemented yet.`,
      metadata: { implemented: false }
    };
  });
}

function connectorCapabilities(provider) {
  const capabilities = {
    local_files: {
      implemented: true,
      placeholder: false,
      requiresOAuth: false,
      supportsSync: true,
      description: "Indexes approved local file sources in APP_MODE=local."
    },
    github: {
      implemented: false,
      placeholder: true,
      requiresOAuth: true,
      supportsSync: false,
      description: "GitHub connector placeholder. Token/OAuth sync is not implemented yet."
    },
    google_drive: {
      implemented: false,
      placeholder: true,
      requiresOAuth: true,
      supportsSync: false,
      description: "Google Drive connector placeholder. OAuth and Drive sync are not implemented yet."
    },
    slack: {
      implemented: false,
      placeholder: true,
      requiresOAuth: true,
      supportsSync: false,
      description: "Slack connector placeholder. OAuth and Slack sync are not implemented yet."
    }
  };
  return capabilities[provider] || {
    implemented: false,
    placeholder: true,
    requiresOAuth: true,
    supportsSync: false,
    description: `${provider} connector placeholder.`
  };
}

function parseJsonObject(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function buildConnectorStatus(workspaceId, groupId = null) {
  const connectors = db.prepare("SELECT * FROM connectors WHERE workspace_id = ? ORDER BY provider").all(workspaceId);
  return connectors.map(connector => {
    const latestSync = db.prepare(`
      SELECT * FROM connector_syncs
      WHERE workspace_id = ? AND connector_id = ?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(workspaceId, connector.id) || null;
    const config = parseJsonObject(connector.config_json);
    const capabilities = connectorCapabilities(connector.provider);
    const configured = connector.provider === "local_files"
      ? APP_MODE === "local"
      : Boolean(config.access_token || config.oauth_connected || config.installed);
    return {
      id: connector.id,
      workspace_id: connector.workspace_id,
      group_id: connector.group_id || groupId || null,
      provider: connector.provider,
      enabled: Boolean(connector.enabled),
      configured,
      status: connector.enabled ? (configured ? "ready" : "needs_configuration") : "disabled",
      ...capabilities,
      latestSync,
      config: {
        hasConfig: Object.keys(config).length > 0,
        placeholder: Boolean(config.placeholder)
      },
      created_at: connector.created_at,
      updated_at: connector.updated_at
    };
  });
}

async function generateWorkspaceText({ message, plan, context, citations }) {
  if (!process.env.OPENAI_API_KEY) {
    const sourceLine = citations.length
      ? `\n\nIndexed sources found:\n${citations.map(source => `- [${source.label || "S?"}] ${source.title}${source.source_path ? ` (${source.source_path})` : ""}`).join("\n")}`
      : "";
    return `AI model is not configured yet. I saved your message, created an event, ran the planner, and prepared retrieved context for the writer agent.\n\nPlanner selected: ${plan.agents.join(", ")}.${sourceLine}`;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: "You are the AI Workspace OS writer agent. Answer clearly, preserve facts, cite source labels like [S1] and source paths when provided, and mark unknowns instead of inventing details."
        },
        {
          role: "user",
          content: `Plan: ${JSON.stringify(plan)}\n\nContext:\n${context || "No retrieved context."}\n\nUser message:\n${message}`
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.output_text || data.output?.flatMap(item => item.content || []).map(item => item.text || "").join("\n") || "No response text returned.";
}

function maybeStoreMemory({ workspaceId, groupId, userId, message }) {
  if (!/\b(remember|preference|always|my name|keep in mind)\b/i.test(message)) return null;
  const timestamp = now();
  const result = db.prepare(`
    INSERT INTO memories (workspace_id, group_id, user_id, memory_type, content, status, source, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, 'user_preference', ?, 'active', 'chat', ?, ?, ?)
  `).run(workspaceId, groupId, userId, message, JSON.stringify({ captured_by: "memoryAgent" }), timestamp, timestamp);
  return { id: Number(result.lastInsertRowid), created_at: timestamp };
}

async function handleWorkspaceChat(req, body) {
  const { workspaceId, userId, groupId } = requestWorkspace(req, body);
  const projectId = String(body.projectId || body.project_id || "").trim() || null;
  const message = String(body.message || "").trim();
  if (!message) return { status: 400, body: { error: "Message is required" } };
  if (!userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.chat.use" }) || !userCanAccessGroup({ workspaceId, userId, groupId })) {
    return { status: 403, body: { error: "You do not have permission to use chat in this group." } };
  }
  const project = projectId ? db.prepare("SELECT * FROM projects WHERE id = ? AND workspace_id = ?").get(projectId, workspaceId) : null;
  if (projectId && !project) return { status: 404, body: { error: "Project not found" } };
  if (project && !userCanAccessGroup({ workspaceId, userId, groupId: project.group_id || groupId })) {
    return { status: 403, body: { error: "You do not have permission to use this project." } };
  }
  const thread = getOrCreateThread({ workspaceId, groupId, projectId, userId, threadId: body.threadId || body.thread_id, message });
  const timestamp = now();
  db.prepare(`
    INSERT INTO chat_messages (workspace_id, group_id, project_id, thread_id, role, content, metadata_json, created_at)
    VALUES (?, ?, ?, ?, 'user', ?, ?, ?)
  `).run(workspaceId, groupId, projectId, thread.id, message, JSON.stringify({ source: "api.chat", project_id: projectId }), timestamp);
  createWorkspaceEvent({
    workspaceId,
    groupId,
    projectId,
    type: "MESSAGE_CREATED",
    actorType: "user",
    actorId: userId,
    payload: { thread_id: thread.id, project_id: projectId, message }
  });

  if (/^\/daily-brief\b|daily brief|daily overview|what matters today/i.test(message)) {
    const dashboard = buildDashboardPayload(workspaceId);
    const content = `${dashboard.dailyBrief.markdown}\nSaved: ${dashboard.dailyBrief.paths.latestPath}`;
    db.prepare(`
      INSERT INTO chat_messages (workspace_id, group_id, project_id, thread_id, role, content, metadata_json, created_at)
      VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?)
    `).run(workspaceId, groupId, projectId, thread.id, content, JSON.stringify({ generated_by: "dailyBrief", dailyBrief: dashboard.dailyBrief }), now());
    const agentOutputs = [
      saveAgentOutput({
        workspaceId,
        groupId,
        projectId,
        threadId: thread.id,
        agentName: "planner",
        outputType: "daily_brief",
        content: "Routed request to the daily brief generator.",
        metadata: { intent: "daily_brief" }
      }),
      saveAgentOutput({
        workspaceId,
        groupId,
        projectId,
        threadId: thread.id,
        agentName: "writer",
        outputType: "daily_brief",
        content,
        metadata: { dailyBrief: dashboard.dailyBrief }
      })
    ];
    createWorkspaceEvent({
      workspaceId,
      groupId,
      projectId,
      type: "WORKFLOW_TRIGGERED",
      actorType: "agent",
      actorId: "dailyBrief",
      payload: { thread_id: thread.id, project_id: projectId, daily_brief_date: dashboard.dailyBrief.date }
    });
    return {
      status: 200,
      body: {
        thread,
        message: { role: "assistant", content },
        content,
        plan: { intent: "daily_brief", agents: ["planner", "researcher", "writer"] },
        citations: [],
        connectorContext: [],
        agentOutputs,
        dailyBrief: dashboard.dailyBrief,
        task: null,
        markdown: null
      }
    };
  }

  const plan = plannerAgent(message);
  const agentOutputs = [];
  agentOutputs.push(saveAgentOutput({
    workspaceId,
    groupId,
    projectId,
    threadId: thread.id,
    agentName: "planner",
    outputType: "plan",
    content: `Selected agents: ${plan.agents.join(", ")}`,
    metadata: { plan, message_length: message.length }
  }));
  const research = plan.agents.includes("researcher")
    ? retrieveWorkspaceContext(workspaceId, groupId, message, 6, userId, projectId)
    : { content: "", citations: [] };
  if (plan.agents.includes("researcher")) {
    agentOutputs.push(saveAgentOutput({
      workspaceId,
      groupId,
      projectId,
      threadId: thread.id,
      agentName: "researcher",
      outputType: "retrieval",
      content: `Retrieved ${research.citations.length} cited source${research.citations.length === 1 ? "" : "s"}.`,
      metadata: { citation_count: research.citations.length, citations: research.citations }
    }));
  }
  const memories = retrieveMemories(workspaceId, groupId, message);
  const connectorContext = plan.agents.includes("connector") ? enabledConnectorContext(workspaceId) : [];
  if (plan.agents.includes("connector")) {
    agentOutputs.push(saveAgentOutput({
      workspaceId,
      groupId,
      projectId,
      threadId: thread.id,
      agentName: "connector",
      outputType: "context",
      content: `Checked ${connectorContext.length} enabled connector context item${connectorContext.length === 1 ? "" : "s"}.`,
      metadata: { connector_count: connectorContext.length, connectorContext }
    }));
  }
  let task = null;
  if (plan.agents.includes("task") && shouldCreateTaskFromMessage(message)) {
    const taskTitle = cleanTaskTitle(message) || message;
    task = createWorkspaceTask({
      workspaceId,
      groupId,
      projectId,
      userId,
      title: taskTitle,
      dueAt: parseDueDateFromText(message),
      priority: priorityFromText(message),
      source: `chat:${thread.id}`,
      metadata: {
        thread_id: thread.id,
        project_id: projectId,
        created_by: "taskAgent",
        original_message: message
      }
    });
    if (task) {
      createWorkspaceEvent({
        workspaceId,
        groupId,
        projectId,
        type: "TASK_CREATED",
        actorType: "agent",
        actorId: "task",
        payload: { task_id: task.id, title: task.title, due_at: task.due_at, priority: task.priority, thread_id: thread.id, project_id: projectId }
      });
    }
    agentOutputs.push(saveAgentOutput({
      workspaceId,
      groupId,
      projectId,
      threadId: thread.id,
      agentName: "task",
      outputType: task ? "task_created" : "task_skipped",
      content: task ? `Created task: ${task.title}` : "No task was created.",
      metadata: { task }
    }));
  }
  const memoryContext = memories.length
    ? `Relevant memories:\n${memories.map(memory => `- ${memory.content}`).join("\n")}`
    : "";
  const context = [memoryContext, research.content, ...connectorContext.map(item => item.content)].filter(Boolean).join("\n\n---\n\n");
  const content = await generateWorkspaceText({ message, plan, context, citations: research.citations });
  db.prepare(`
    INSERT INTO chat_messages (workspace_id, group_id, project_id, thread_id, role, content, metadata_json, created_at)
    VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?)
  `).run(workspaceId, groupId, projectId, thread.id, content, JSON.stringify({ citations: research.citations, plan, project_id: projectId }), now());
  agentOutputs.push(saveAgentOutput({
    workspaceId,
    groupId,
    projectId,
    threadId: thread.id,
    agentName: "writer",
    outputType: "final_response",
    content,
    metadata: { citations: research.citations, plan }
  }));
  const memory = maybeStoreMemory({ workspaceId, groupId, userId, message });
  if (plan.agents.includes("memory")) {
    agentOutputs.push(saveAgentOutput({
      workspaceId,
      groupId,
      projectId,
      threadId: thread.id,
      agentName: "memory",
      outputType: memory ? "memory_saved" : "memory_skipped",
      content: memory ? `Saved memory ${memory.id}.` : "No long-term memory was saved.",
      metadata: { memory }
    }));
  }
  createWorkspaceEvent({
    workspaceId,
    groupId,
    projectId,
    type: "WORKFLOW_TRIGGERED",
    actorType: "agent",
    actorId: "writer",
    payload: { thread_id: thread.id, project_id: projectId, citations: research.citations, memory }
  });
  const markdown = safeSyncProjectMarkdownFiles(workspaceId, projectId);
  return {
    status: 200,
    body: {
      thread,
      message: { role: "assistant", content },
      content,
      plan,
      citations: research.citations,
      connectorContext,
      agentOutputs,
      task,
      markdown
    }
  };
}

function isIndexableTextPath(path) {
  return [".txt", ".md", ".csv", ".json", ".html", ".htm", ".log"].includes(extname(path).toLowerCase());
}

function isSupportedIndexPath(path) {
  return [".txt", ".md", ".csv", ".json", ".html", ".htm", ".log", ".pdf", ".docx"].includes(extname(path).toLowerCase());
}

function normalizeExtractedText(content) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[ \u00a0]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function titleFromContent(content, fallback = "Document") {
  const cleanFallback = String(fallback || "Document").replace(/\.[^.]+$/, "").trim() || "Document";
  const markdownTitle = String(content || "").match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (markdownTitle) return markdownTitle.slice(0, 140);
  const firstLine = String(content || "")
    .split(/\n+/)
    .map(line => line.trim())
    .find(line => line && line.length <= 140 && !/^[#*\-`~\s]+$/.test(line));
  return (firstLine || cleanFallback).slice(0, 140);
}

function extractIndexableContent(filePath) {
  const extension = extname(filePath).toLowerCase();
  const stats = statSync(filePath);
  const baseMetadata = {
    extension,
    byte_size: stats.size,
    original_path: filePath
  };
  if (isIndexableTextPath(filePath)) {
    const raw = readFileSync(filePath, "utf8");
    const truncated = raw.length > 2_000_000;
    const text = normalizeExtractedText(raw.slice(0, 2_000_000));
    return {
      text,
      status: truncated ? "indexed-partial" : "indexed",
      title: titleFromContent(text, filePath.split("/").pop()),
      metadata: {
        ...baseMetadata,
        source_format: extension.replace(".", "") || "text",
        extracted_characters: text.length,
        truncated
      },
      note: truncated ? "Indexed the first 2 MB of this source file." : ""
    };
  }
  if (extension === ".pdf" || extension === ".docx") {
    return {
      text: `Text extraction for ${extension} files is not implemented yet. The file is registered as approved knowledge and ready for a future extractor.`,
      status: "registered",
      title: titleFromContent("", filePath.split("/").pop()),
      metadata: {
        ...baseMetadata,
        source_format: extension.replace(".", ""),
        extracted_characters: 0,
        extraction_pending: true
      },
      note: `Add a ${extension} text extractor to populate reference text automatically.`
    };
  }
  return { text: "", status: "unsupported", title: titleFromContent("", filePath.split("/").pop()), metadata: baseMetadata, note: "Unsupported file type." };
}

function listApprovedSourceFiles(sourcePath) {
  if (!existsSync(sourcePath)) return [];
  const stats = statSync(sourcePath);
  if (stats.isFile()) return isSupportedIndexPath(sourcePath) ? [sourcePath] : [];
  if (!stats.isDirectory()) return [];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const child = join(dir, name);
      const childStats = statSync(child);
      if (childStats.isDirectory()) {
        walk(child);
      } else if (childStats.isFile() && isSupportedIndexPath(child)) {
        files.push(child);
      }
    }
  };
  walk(sourcePath);
  return files;
}

function splitDocumentChunks(content, size = 2400, overlap = 180) {
  const cleanContent = normalizeExtractedText(content);
  if (!cleanContent) return [];
  const blocks = cleanContent.split(/\n{2,}/);
  const chunks = [];
  let current = "";
  let currentStart = 0;
  let cursor = 0;

  const pushCurrent = () => {
    const chunk = current.trim();
    if (!chunk) return;
    chunks.push({
      content: chunk,
      start: currentStart,
      end: currentStart + chunk.length
    });
  };

  for (const block of blocks) {
    const blockText = block.trim();
    if (!blockText) {
      cursor += block.length + 2;
      continue;
    }
    const separator = current ? "\n\n" : "";
    if (current && current.length + separator.length + blockText.length > size) {
      pushCurrent();
      const overlapText = current.slice(Math.max(0, current.length - overlap)).trim();
      currentStart = Math.max(0, cursor - overlapText.length);
      current = overlapText ? `${overlapText}\n\n${blockText}` : blockText;
    } else {
      if (!current) currentStart = cursor;
      current = `${current}${separator}${blockText}`;
    }
    cursor += block.length + 2;
  }
  pushCurrent();

  if (!chunks.length && cleanContent.length) {
    for (let index = 0; index < cleanContent.length; index += size - overlap) {
      chunks.push({
        content: cleanContent.slice(index, index + size),
        start: index,
        end: Math.min(cleanContent.length, index + size)
      });
    }
  }
  return chunks;
}

function embeddingTokens(content) {
  return String(content || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2 && token.length < 48)
    .slice(0, 1200);
}

function localEmbedding(content, dimensions = 64) {
  const vector = Array(dimensions).fill(0);
  for (const token of embeddingTokens(content)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest[0] % dimensions;
    const sign = digest[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
  return vector.map(value => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += Number(a[index]) * Number(b[index]);
    magnitudeA += Number(a[index]) * Number(a[index]);
    magnitudeB += Number(b[index]) * Number(b[index]);
  }
  if (!magnitudeA || !magnitudeB) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function parseVectorJson(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function upsertChunkEmbedding({ workspaceId, groupId, documentId, chunkId, content, metadata = {} }) {
  const timestamp = now();
  const vector = localEmbedding(content);
  const contentHash = hashContent(content);
  db.prepare(`
    INSERT INTO chunk_embeddings (workspace_id, group_id, document_id, chunk_id, provider, model, dimensions, vector_json, content_hash, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'local', 'local-hash-v1', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, chunk_id, provider, model)
    DO UPDATE SET group_id = excluded.group_id, document_id = excluded.document_id, dimensions = excluded.dimensions, vector_json = excluded.vector_json, content_hash = excluded.content_hash, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
  `).run(
    workspaceId,
    groupId,
    documentId,
    chunkId,
    vector.length,
    JSON.stringify(vector),
    contentHash,
    JSON.stringify(metadata),
    timestamp,
    timestamp
  );
  return { provider: "local", model: "local-hash-v1", dimensions: vector.length, content_hash: contentHash };
}

function displayPath(filePath) {
  return String(filePath || "").startsWith(`${ROOT}/`) ? String(filePath).replace(`${ROOT}/`, "") : String(filePath || "");
}

function getRuntimeConfigStatus() {
  return {
    appMode: APP_MODE,
    server: {
      host: HOST,
      port: PORT,
      localUrl: `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`
    },
    workspace: {
      defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
      defaultUserId: DEFAULT_USER_ID,
      defaultGroupId: DEFAULT_GROUP_ID
    },
    database: {
      provider: "sqlite",
      configured: true,
      path: displayPath(DB_PATH)
    },
    llm: {
      provider: "openai",
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini"
    },
    retrieval: {
      mode: "hybrid-keyword-local-vector",
      embeddingProvider: "local",
      embeddingModel: "local-hash-v1",
      embeddingDimensions: 64
    },
    connectors: {
      localFiles: {
        available: APP_MODE === "local",
        configured: APP_MODE === "local"
      },
      microsoft: {
        configured: Boolean(process.env.MICROSOFT_CLIENT_ID),
        oauthReady: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_TENANT_ID)
      },
      github: { configured: false, placeholder: true },
      googleDrive: { configured: false, placeholder: true },
      slack: { configured: false, placeholder: true }
    }
  };
}

function indexMarkdownKnowledgeFile({
  workspaceId = DEFAULT_WORKSPACE_ID,
  groupId = DEFAULT_GROUP_ID,
  projectId = null,
  title,
  sourcePath,
  content,
  fileSourceId = null,
  connectorId = null,
  metadata = {}
}) {
  const cleanContent = String(content || "");
  if (!cleanContent.trim()) return null;
  const timestamp = now();
  const cleanTitle = titleFromContent(cleanContent, title || sourcePath.split("/").pop() || "Markdown knowledge");
  const contentHash = hashContent(cleanContent);
  const storedSourcePath = displayPath(sourcePath);
  const existing = db.prepare(`
    SELECT id FROM documents
    WHERE workspace_id = ? AND source_path = ?
  `).get(workspaceId, storedSourcePath);

  let documentId = existing?.id;
  if (documentId) {
    db.prepare(`
      UPDATE documents
      SET title = ?, group_id = ?, project_id = ?, file_source_id = ?, connector_id = ?, content_hash = ?, metadata_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      cleanTitle,
      groupId,
      projectId,
      fileSourceId,
      connectorId,
      contentHash,
      JSON.stringify({ ...metadata, source_format: "markdown" }),
      timestamp,
      documentId,
      workspaceId
    );
    db.prepare("DELETE FROM chunk_embeddings WHERE document_id = ? AND workspace_id = ?").run(documentId, workspaceId);
    db.prepare("DELETE FROM document_chunks WHERE document_id = ? AND workspace_id = ?").run(documentId, workspaceId);
  } else {
    const result = db.prepare(`
      INSERT INTO documents (workspace_id, group_id, project_id, file_source_id, connector_id, title, source_path, content_hash, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      groupId,
      projectId,
      fileSourceId,
      connectorId,
      cleanTitle,
      storedSourcePath,
      contentHash,
      JSON.stringify({ ...metadata, source_format: "markdown" }),
      timestamp,
      timestamp
    );
    documentId = Number(result.lastInsertRowid);
  }

  const chunks = splitDocumentChunks(cleanContent);
  chunks.forEach((chunk, chunkIndex) => {
    const chunkResult = db.prepare(`
      INSERT INTO document_chunks (workspace_id, group_id, document_id, chunk_index, content, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      groupId,
      documentId,
      chunkIndex,
      chunk.content,
      JSON.stringify({
        ...metadata,
        source_path: storedSourcePath,
        project_id: projectId,
        source_format: "markdown",
        chunk_index: chunkIndex,
        chunk_count: chunks.length,
        char_start: chunk.start,
        char_end: chunk.end
      }),
      timestamp
    );
    upsertChunkEmbedding({
      workspaceId,
      groupId,
      documentId,
      chunkId: Number(chunkResult.lastInsertRowid),
      content: chunk.content,
      metadata: {
        source_path: storedSourcePath,
        project_id: projectId,
        chunk_index: chunkIndex,
        chunk_count: chunks.length,
        embedding_method: "local-hash-v1"
      }
    });
  });
  return db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(documentId, workspaceId);
}

function localFileMarkdownPathFor(source, sourcePath) {
  const baseName = sourcePath.split("/").pop() || source.label || "local-file";
  const sourceHash = hashContent(sourcePath).slice(0, 10);
  const safeName = slugifyWikiTitle(`${source.id}-${baseName}-${sourceHash}`);
  return join(DOCS_DIR, SOURCE_WIKI_CATEGORY, "local-files", `${safeName}.md`);
}

function writeLocalFileMarkdownMirror(source, sourcePath, extraction) {
  const timestamp = now();
  const markdownPath = localFileMarkdownPathFor(source, sourcePath);
  mkdirSync(resolve(markdownPath, ".."), { recursive: true });
  const content = extraction.text || "";
  const title = extraction.title || source.label || sourcePath.split("/").pop() || "Local file source";
  const markdown = `# ${title}

## Source Metadata

- Intake method: approved local file source
- Original path: ${sourcePath}
- File source ID: ${source.id}
- Extraction status: ${extraction.status || "indexed"}
- Indexed: ${timestamp}
- Knowledge format: Markdown wiki
${extraction.note ? `- Note: ${extraction.note}\n` : ""}

## Extracted Reference Text

${content || "No extracted text available."}
`;
  writeFileSync(markdownPath, markdown);
  return { markdownPath, markdown };
}

function workspaceMarkdownFolder(workspaceId) {
  return join(DOCS_DIR, "eos", "workspaces", slugifyWikiTitle(workspaceId));
}

function projectMarkdownFolder(workspaceId, project) {
  return join(workspaceMarkdownFolder(workspaceId), "projects", project.slug || slugifyWikiTitle(project.name || project.id));
}

function renderWorkspaceMarkdownView({ viewType, workspace, group, users, requests, memories, documents, events }) {
  const titleMap = {
    "ABOUT-ME": "About This Workspace",
    "MY-AI-STYLE": "AI Style and Preferences",
    "PROJECTS": "Projects and Requests",
    "TASKS": "Tasks and Assignments",
    "DECISIONS": "Decisions",
    "WORKFLOWS": "Workflows",
    "LESSONS-LEARNED": "Lessons Learned",
    "CONTEXT-LOG": "Context Log"
  };
  const title = titleMap[viewType] || viewType;
  const activeUsers = users.filter(user => user.status === "active").map(user => `- ${user.name}${user.title ? ` - ${user.title}` : ""}`).join("\n") || "- None yet";
  const requestLines = requests.map(request => `- [${request.status}] ${request.title}${request.priority ? ` (${request.priority})` : ""}`).join("\n") || "- None yet";
  const memoryLines = memories.map(memory => `- ${memory.content}`).join("\n") || "- None yet";
  const documentLines = documents.map(document => `- ${document.title} (${document.source_path || "no source path"})`).join("\n") || "- None yet";
  const eventLines = events.map(event => `- ${event.created_at} - ${event.type}`).join("\n") || "- None yet";

  const sections = {
    "ABOUT-ME": `## Workspace\n\n- Name: ${workspace.name}\n- Type: ${workspace.workspace_type || "personal"}\n- Mode: ${workspace.mode}\n- Group: ${group?.name || "Personal"}\n\n## Active People\n\n${activeUsers}\n`,
    "MY-AI-STYLE": `## Preferences\n\n${memoryLines}\n\n## Operating Rule\n\n- The AI should preserve facts, cite sources, and ask before destructive actions.\n`,
    "PROJECTS": `## Open Requests\n\n${requestLines}\n`,
    "TASKS": `## Current Tasks\n\n${requestLines}\n`,
    "DECISIONS": `## Decision Memory\n\n${memories.filter(memory => memory.memory_type === "decision").map(memory => `- ${memory.content}`).join("\n") || "- None yet"}\n`,
    "WORKFLOWS": `## Current Workflows\n\n- Chat messages create events.\n- Events can trigger agents.\n- Markdown views are synced from database state.\n`,
    "LESSONS-LEARNED": `## Lessons\n\n${memories.filter(memory => /lesson|learned|preference/i.test(memory.memory_type)).map(memory => `- ${memory.content}`).join("\n") || "- None yet"}\n`,
    "CONTEXT-LOG": `## Recent Events\n\n${eventLines}\n\n## Indexed Knowledge\n\n${documentLines}\n`
  };

  return `# ${title}

## Source

- Product: EOS
- Generated from: database source of truth
- Workspace ID: ${workspace.id}
- Group ID: ${group?.id || "none"}
- Synced: ${now()}

${sections[viewType] || ""}
`;
}

function syncWorkspaceMarkdownViews(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
  const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const group = db.prepare("SELECT * FROM groups WHERE workspace_id = ? AND id = ?").get(workspaceId, groupId);
  const users = db.prepare("SELECT * FROM users WHERE workspace_id = ? ORDER BY name").all(workspaceId);
  const requests = db.prepare("SELECT * FROM requests WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 50").all(workspaceId, groupId);
  const memories = db.prepare("SELECT * FROM memories WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 50").all(workspaceId, groupId);
  const documents = db.prepare("SELECT * FROM documents WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 50").all(workspaceId, groupId);
  const events = db.prepare("SELECT * FROM events WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY created_at DESC LIMIT 50").all(workspaceId, groupId);
  const folder = workspaceMarkdownFolder(workspaceId);
  mkdirSync(folder, { recursive: true });
  const viewTypes = ["ABOUT-ME", "MY-AI-STYLE", "PROJECTS", "TASKS", "DECISIONS", "WORKFLOWS", "LESSONS-LEARNED", "CONTEXT-LOG"];
  const synced = [];
  for (const viewType of viewTypes) {
    const content = renderWorkspaceMarkdownView({ viewType, workspace, group, users, requests, memories, documents, events });
    const filePath = join(folder, `${viewType}.md`);
    writeFileSync(filePath, content);
    const contentHash = hashContent(content);
    const timestamp = now();
    db.prepare(`
      INSERT INTO markdown_views (workspace_id, group_id, view_type, title, file_path, content_hash, last_synced_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, group_id, view_type)
      DO UPDATE SET title = excluded.title, file_path = excluded.file_path, content_hash = excluded.content_hash, last_synced_at = excluded.last_synced_at, metadata_json = excluded.metadata_json
    `).run(
      workspaceId,
      groupId,
      viewType,
      viewType,
      displayPath(filePath),
      contentHash,
      timestamp,
      JSON.stringify({ generated_by: "eos.markdown_sync" })
    );
    indexMarkdownKnowledgeFile({
      workspaceId,
      groupId,
      title: viewType,
      sourcePath: filePath,
      content,
      metadata: {
        intake_method: "markdown_sync",
        view_type: viewType
      }
    });
    synced.push({ viewType, path: displayPath(filePath) });
  }
  return { workspaceId, groupId, synced };
}

function renderProjectMarkdownView({ viewType, workspace, group, project, tasks, memories, documents, events, threads, agentOutputs }) {
  const titleMap = {
    "PROJECT-OVERVIEW": "Project Overview",
    "PROJECT-TASKS": "Project Tasks",
    "PROJECT-DECISIONS": "Project Decisions",
    "PROJECT-CONTEXT-LOG": "Project Context Log",
    "PROJECT-SOURCES": "Project Sources"
  };
  const taskLines = tasks.map(task => `- [${task.status}] ${task.title}${task.priority ? ` (${task.priority})` : ""}${task.due_at ? ` - due ${task.due_at}` : ""}`).join("\n") || "- None yet";
  const decisionLines = memories
    .filter(memory => memory.memory_type === "decision")
    .map(memory => `- ${memory.content}`)
    .join("\n") || "- None yet";
  const documentLines = documents.map(document => `- ${document.title} (${document.source_path || "no source path"})`).join("\n") || "- None yet";
  const eventLines = events.map(event => `- ${event.created_at} - ${event.type} [${event.status}]`).join("\n") || "- None yet";
  const threadLines = threads.map(thread => `- ${thread.title} (${thread.id})`).join("\n") || "- None yet";
  const agentLines = agentOutputs.map(output => `- ${output.created_at} - ${output.agent_name}: ${output.output_type}`).join("\n") || "- None yet";
  const sections = {
    "PROJECT-OVERVIEW": `## Project\n\n- Name: ${project.name}\n- Status: ${project.status}\n- Workspace: ${workspace.name}\n- Group: ${group?.name || "None"}\n- Owner ID: ${project.owner_id || "None"}\n\n## Summary\n\n${project.summary || "No summary yet."}\n\n## Active Threads\n\n${threadLines}\n`,
    "PROJECT-TASKS": `## Tasks\n\n${taskLines}\n`,
    "PROJECT-DECISIONS": `## Decisions\n\n${decisionLines}\n`,
    "PROJECT-CONTEXT-LOG": `## Recent Events\n\n${eventLines}\n\n## Agent Activity\n\n${agentLines}\n`,
    "PROJECT-SOURCES": `## Indexed Sources\n\n${documentLines}\n`
  };
  return `# ${titleMap[viewType] || viewType}

## Source

- Product: EOS
- Generated from: database source of truth
- Workspace ID: ${workspace.id}
- Group ID: ${group?.id || "none"}
- Project ID: ${project.id}
- Synced: ${now()}

${sections[viewType] || ""}
`;
}

function syncProjectMarkdownFiles(workspaceId = DEFAULT_WORKSPACE_ID, projectId) {
  if (!projectId) throw new Error("Project is required");
  const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const project = db.prepare("SELECT * FROM projects WHERE workspace_id = ? AND id = ?").get(workspaceId, projectId);
  if (!project) throw new Error("Project not found");
  const group = project.group_id ? db.prepare("SELECT * FROM groups WHERE workspace_id = ? AND id = ?").get(workspaceId, project.group_id) : null;
  const tasks = db.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND project_id = ? ORDER BY status = 'done' ASC, COALESCE(due_at, updated_at) ASC LIMIT 100").all(workspaceId, projectId);
  const memories = db.prepare("SELECT * FROM memories WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 100").all(workspaceId, project.group_id || null);
  const documents = db.prepare("SELECT * FROM documents WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 100").all(workspaceId, projectId);
  const events = db.prepare("SELECT * FROM events WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 100").all(workspaceId, projectId);
  const threads = db.prepare("SELECT * FROM chat_threads WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 50").all(workspaceId, projectId);
  const agentOutputs = db.prepare("SELECT * FROM agent_outputs WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50").all(workspaceId, projectId);
  const folder = projectMarkdownFolder(workspaceId, project);
  mkdirSync(folder, { recursive: true });
  const viewTypes = ["PROJECT-OVERVIEW", "PROJECT-TASKS", "PROJECT-DECISIONS", "PROJECT-CONTEXT-LOG", "PROJECT-SOURCES"];
  const synced = [];
  for (const viewType of viewTypes) {
    const content = renderProjectMarkdownView({ viewType, workspace, group, project, tasks, memories, documents, events, threads, agentOutputs });
    const filePath = join(folder, `${viewType}.md`);
    writeFileSync(filePath, content);
    const contentHash = hashContent(content);
    const timestamp = now();
    const id = `markdown_${hashContent(`${workspaceId}:${projectId}:${viewType}`).slice(0, 20)}`;
    db.prepare(`
      INSERT INTO markdown_files (id, workspace_id, group_id, project_id, title, file_path, source_type, content_hash, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?)
      ON CONFLICT(workspace_id, file_path)
      DO UPDATE SET title = excluded.title, group_id = excluded.group_id, project_id = excluded.project_id, content_hash = excluded.content_hash, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(
      id,
      workspaceId,
      project.group_id || null,
      projectId,
      viewType,
      displayPath(filePath),
      contentHash,
      JSON.stringify({ generated_by: "eos.project_markdown_sync", view_type: viewType }),
      timestamp,
      timestamp
    );
    indexMarkdownKnowledgeFile({
      workspaceId,
      groupId: project.group_id || DEFAULT_GROUP_ID,
      projectId,
      title: viewType,
      sourcePath: filePath,
      content,
      metadata: {
        intake_method: "project_markdown_sync",
        view_type: viewType,
        project_id: projectId
      }
    });
    synced.push({ viewType, path: displayPath(filePath) });
  }
  return { workspaceId, groupId: project.group_id || null, projectId, synced };
}

function safeSyncProjectMarkdownFiles(workspaceId, projectId) {
  if (!projectId) return null;
  try {
    return syncProjectMarkdownFiles(workspaceId, projectId);
  } catch (error) {
    return {
      projectId,
      error: error instanceof Error ? error.message : String(error || "Project markdown sync failed")
    };
  }
}

function indexApprovedFileSources(workspaceId, groupId = null, projectId = null) {
  if (APP_MODE !== "local") {
    return { indexed: 0, skipped: "Local file indexing is only available in APP_MODE=local." };
  }
  const sources = projectId
    ? db.prepare(`
      SELECT * FROM file_sources
      WHERE workspace_id = ? AND enabled = 1 AND source_type = 'local' AND project_id = ?
      ORDER BY updated_at DESC
    `).all(workspaceId, projectId)
    : groupId
    ? db.prepare(`
      SELECT * FROM file_sources
      WHERE workspace_id = ? AND enabled = 1 AND source_type = 'local' AND (group_id = ? OR group_id IS NULL)
      ORDER BY updated_at DESC
    `).all(workspaceId, groupId)
    : db.prepare(`
      SELECT * FROM file_sources
      WHERE workspace_id = ? AND enabled = 1 AND source_type = 'local'
      ORDER BY updated_at DESC
    `).all(workspaceId);
  let indexed = 0;
  let skipped = 0;
  const sourcesIndexed = [];
  const errors = [];
  for (const source of sources) {
    const timestamp = now();
    let indexedForSource = 0;
    try {
      const sourcePath = resolve(String(source.path || ""));
      const filePaths = listApprovedSourceFiles(sourcePath);
      if (!filePaths.length) skipped += 1;
      for (const filePath of filePaths) {
        const extraction = extractIndexableContent(filePath);
        if (!extraction.text) {
          skipped += 1;
          continue;
        }
        const { markdownPath, markdown } = writeLocalFileMarkdownMirror(
          { ...source, label: source.label || filePath.split("/").pop() },
          filePath,
          extraction
        );
        indexMarkdownKnowledgeFile({
          workspaceId,
          groupId: source.group_id || groupId || DEFAULT_GROUP_ID,
          projectId: source.project_id || projectId || null,
          title: extraction.title || source.label || filePath.split("/").pop(),
          sourcePath: markdownPath,
          content: markdown,
          fileSourceId: source.id,
          metadata: {
            intake_method: "approved_local_file",
            project_id: source.project_id || projectId || null,
            extraction_status: extraction.status,
            original_path: filePath,
            approved_root: sourcePath,
            markdown_path: displayPath(markdownPath),
            original_content_hash: hashContent(extraction.text),
            ...extraction.metadata
          }
        });
        indexed += 1;
        indexedForSource += 1;
      }
      db.prepare(`
        UPDATE file_sources
        SET last_indexed_at = ?, last_index_error = NULL, last_indexed_document_count = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(timestamp, indexedForSource, timestamp, source.id, workspaceId);
      sourcesIndexed.push({ id: source.id, label: source.label, indexed: indexedForSource });
    } catch (error) {
      skipped += 1;
      errors.push({ id: source.id, label: source.label, error: error.message });
      db.prepare(`
        UPDATE file_sources
        SET last_indexed_at = ?, last_index_error = ?, last_indexed_document_count = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(timestamp, error.message, indexedForSource, timestamp, source.id, workspaceId);
    }
  }
  const markdown = projectId ? safeSyncProjectMarkdownFiles(workspaceId, projectId) : null;
  return { indexed, skipped, sources: sourcesIndexed, errors, method: "markdown_mirrors", folder: "docs/source-knowledge/local-files", projectId, markdown };
}

function getJob(id) {
  return db.prepare(`
    SELECT jobs.*, people.name AS requester_name, people.organization AS requester_organization
    FROM jobs
    LEFT JOIN people ON people.id = jobs.requester_id
    WHERE jobs.id = ?
  `).get(id);
}

function listWikiFiles(jobId) {
  return db.prepare("SELECT * FROM wiki_files WHERE job_id = ? ORDER BY file_name").all(jobId);
}

function createJob(input) {
  const timestamp = now();
  const title = input.title?.trim() || "Untitled request";
  const slug = uniqueSlug(title);
  const folderPath = join(JOBS_DIR, slug);
  mkdirSync(join(folderPath, "attachments"), { recursive: true });

  let requesterId = null;
  if (input.requesterName?.trim()) {
    const existing = db.prepare("SELECT id FROM people WHERE lower(name) = lower(?) AND COALESCE(organization, '') = COALESCE(?, '')")
      .get(input.requesterName.trim(), input.organization?.trim() || null);
    requesterId = existing?.id;
    if (!requesterId) {
      const result = db.prepare(`
        INSERT INTO people (name, role, organization, email, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.requesterName.trim(),
        input.requesterType || null,
        input.organization || null,
        input.email || null,
        null,
        timestamp
      );
      requesterId = Number(result.lastInsertRowid);
    }
  }

  const result = db.prepare(`
    INSERT INTO jobs (title, slug, requester_id, status, priority, due_at, folder_path, summary, next_action, created_at, updated_at)
    VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    slug,
    requesterId,
    input.priority || "normal",
    input.dueAt || null,
    folderPath,
    input.summary || input.rawRequest || null,
    input.nextAction || null,
    timestamp,
    timestamp
  );
  const jobId = Number(result.lastInsertRowid);

  for (const [fileName, render] of Object.entries(wikiTemplates)) {
    const content = render({ ...input, title });
    const filePath = join(folderPath, fileName);
    writeFileSync(filePath, content);
    db.prepare(`
      INSERT INTO wiki_files (job_id, file_name, file_path, purpose, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jobId, fileName, filePath, fileName.replace(".md", ""), hashContent(content), timestamp);
  }

  if (input.nextAction?.trim()) {
    db.prepare(`
      INSERT INTO tasks (job_id, title, status, priority, source, created_at, updated_at)
      VALUES (?, ?, 'todo', ?, 'intake', ?, ?)
    `).run(jobId, input.nextAction.trim(), input.priority || "normal", timestamp, timestamp);
  }

  if (input.reminderTitle?.trim() && input.reminderAt) {
    db.prepare(`
      INSERT INTO reminders (job_id, title, due_at, status, notes, created_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(jobId, input.reminderTitle.trim(), input.reminderAt, input.reminderNotes || null, timestamp);
  }

  db.prepare(`
    INSERT INTO workflow_events (job_id, event_type, payload_json, created_at)
    VALUES (?, 'job.created', ?, ?)
  `).run(jobId, JSON.stringify({ slug }), timestamp);

  return getJob(jobId);
}

function getOrCreatePersonalTasksJobId() {
  const existing = db.prepare("SELECT id FROM jobs WHERE slug = 'personal-tasks'").get();
  if (existing) return existing.id;
  const timestamp = now();
  const folderPath = join(JOBS_DIR, "personal-tasks");
  mkdirSync(join(folderPath, "attachments"), { recursive: true });
  const result = db.prepare(`
    INSERT INTO jobs (title, slug, requester_id, status, priority, due_at, folder_path, summary, next_action, created_at, updated_at)
    VALUES ('Personal Tasks', 'personal-tasks', NULL, 'open', 'normal', NULL, ?, 'System workspace for standalone tasks.', NULL, ?, ?)
  `).run(folderPath, timestamp, timestamp);
  const jobId = Number(result.lastInsertRowid);
  for (const [fileName, render] of Object.entries(wikiTemplates)) {
    const content = render({ title: "Personal Tasks", summary: "System workspace for standalone tasks." });
    const filePath = join(folderPath, fileName);
    writeFileSync(filePath, content);
    db.prepare(`
      INSERT INTO wiki_files (job_id, file_name, file_path, purpose, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jobId, fileName, filePath, fileName.replace(".md", ""), hashContent(content), timestamp);
  }
  return jobId;
}

function assembleJobContext(job) {
  const files = listWikiFiles(job.id);
  const chunks = files.map(file => {
    const content = readFileSync(file.file_path, "utf8");
    return `# File: ${file.file_name}\n\n${content}`;
  });
  return chunks.join("\n\n---\n\n").slice(0, 80_000);
}

function findSimilarJobs(jobId, queryText) {
  const terms = queryText.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 3).slice(0, 12);
  if (!terms.length) return [];
  const jobs = db.prepare("SELECT id, title, summary, folder_path FROM jobs WHERE id != ? ORDER BY updated_at DESC LIMIT 100").all(jobId);
  return jobs
    .map(job => {
      let text = `${job.title} ${job.summary || ""}`;
      try {
        for (const fileName of ["overview.md", "final-summary.md", "workflow.md", "tasks.md"]) {
          const path = join(job.folder_path, fileName);
          if (existsSync(path)) text += ` ${readFileSync(path, "utf8")}`;
        }
      } catch {
        // Ignore unreadable past-job files for lightweight retrieval.
      }
      const score = terms.reduce((total, term) => total + (text.toLowerCase().includes(term) ? 1 : 0), 0);
      return { ...job, score };
    })
    .filter(job => job.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function listRecentJobs(limit = 12) {
  return db.prepare(`
    SELECT jobs.id, jobs.title, jobs.status, jobs.priority, jobs.summary, jobs.next_action, people.name AS requester_name
    FROM jobs
    LEFT JOIN people ON people.id = jobs.requester_id
    ORDER BY jobs.updated_at DESC
    LIMIT ?
  `).all(limit);
}

function listWikiDocs() {
  if (!existsSync(DOCS_DIR)) return [];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const filePath = join(dir, name);
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        walk(filePath);
      } else if (name.endsWith(".md")) {
        files.push(filePath);
      }
    }
  };
  walk(DOCS_DIR);
  return files
    .map(filePath => filePath.replace(`${DOCS_DIR}/`, ""))
    .sort((a, b) => a.localeCompare(b))
    .map(fileName => {
      const filePath = join(DOCS_DIR, fileName);
      const content = readFileSync(filePath, "utf8");
      const title = content.match(/^#\s+(.+)$/m)?.[1] || fileName.replace(/\.md$/, "");
      return {
        id: fileName,
        title,
        path: `docs/${fileName}`,
        summary: content.split(/\r?\n/).find(line => line.trim() && !line.startsWith("#")) || ""
      };
    });
}

function readWikiDoc(id) {
  const resolved = wikiPathForId(id);
  if (!resolved || !existsSync(resolved.filePath)) return null;
  const { safeId, filePath } = resolved;
  if (!safeId.endsWith(".md")) return null;
  const content = readFileSync(filePath, "utf8");
  return {
    id: safeId,
    title: content.match(/^#\s+(.+)$/m)?.[1] || safeId.replace(/\.md$/, ""),
    path: `docs/${safeId}`,
    content
  };
}

function slugifyWikiTitle(title) {
  return String(title || "untitled-wiki")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled-wiki";
}

function wikiPathForId(id) {
  const safeId = String(id || "")
    .split("/")
    .map(part => part.replace(/[^a-zA-Z0-9._-]/g, ""))
    .filter(Boolean)
    .join("/");
  if (!safeId.endsWith(".md")) return null;
  const filePath = resolve(DOCS_DIR, safeId);
  if (!filePath.startsWith(resolve(DOCS_DIR))) return null;
  return { safeId, filePath };
}

function safeWikiCategory(category) {
  return String(category || "")
    .split("/")
    .map(part => slugifyWikiTitle(part))
    .filter(Boolean)
    .join("/");
}

function ensureUniqueWikiId(title, category = "") {
  const base = slugifyWikiTitle(title);
  const safeCategory = safeWikiCategory(category);
  let candidate = safeCategory ? `${safeCategory}/${base}.md` : `${base}.md`;
  let counter = 2;
  while (existsSync(join(DOCS_DIR, candidate))) {
    candidate = safeCategory ? `${safeCategory}/${base}-${counter}.md` : `${base}-${counter}.md`;
    counter += 1;
  }
  return candidate;
}

function writeWikiDoc({ title, content, id = null, category = "" }) {
  const cleanTitle = String(title || "").trim();
  const cleanContent = String(content || "").trim();
  if (!cleanTitle) throw new Error("Wiki title is required");
  if (!cleanContent) throw new Error("Wiki content is required");
  mkdirSync(DOCS_DIR, { recursive: true });
  const docId = id ? `${safeWikiCategory(id.replace(/\.md$/i, ""))}.md` : ensureUniqueWikiId(cleanTitle, category);
  const resolved = wikiPathForId(docId);
  if (!resolved) throw new Error("Invalid wiki filename");
  mkdirSync(resolve(resolved.filePath, ".."), { recursive: true });
  const contentWithTitle = cleanContent.match(/^#\s+/m) ? cleanContent : `# ${cleanTitle}\n\n${cleanContent}`;
  const markdown = `${contentWithTitle.trim()}\n`;
  writeFileSync(resolved.filePath, markdown);
  indexMarkdownKnowledgeFile({
    workspaceId: DEFAULT_WORKSPACE_ID,
    title: cleanTitle,
    sourcePath: resolved.filePath,
    content: markdown,
    metadata: {
      intake_method: "wiki_save",
      wiki_id: resolved.safeId
    }
  });
  return readWikiDoc(resolved.safeId);
}

function safeSourceFileName(fileName) {
  const clean = String(fileName || "source-document.txt")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .trim()
    .slice(0, 140);
  return clean || "source-document.txt";
}

function isTextSource(fileName) {
  return [".txt", ".md", ".csv", ".json", ".html", ".htm", ".log"].includes(extname(fileName).toLowerCase());
}

function listSourceFiles(dir = SOURCE_DOCS_DIR) {
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    const filePath = join(dir, name);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      entries.push(...listSourceFiles(filePath));
    } else {
      entries.push(filePath);
    }
  }
  return entries;
}

function relativeSourcePath(filePath) {
  return filePath.replace(`${SOURCE_DOCS_DIR}/`, "");
}

function sourceMarkdownPathFor(id, fileName) {
  const parsedName = fileName.replace(/\.[^.]+$/, "");
  const safeName = slugifyWikiTitle(parsedName.split("/").pop() || parsedName || "source-document");
  return join(DOCS_DIR, SOURCE_WIKI_CATEGORY, `${id}-${safeName}.md`);
}

function renderSourceMarkdown({ fileName, sourceType, status, importedAt, updatedAt, extraction }) {
  const sourceText = normalizeExtractedText(extraction.text) || "Text extraction is not available for this file type yet. The original file is stored as source material.";
  const title = extraction.title || titleFromContent(sourceText, fileName);
  return `# ${fileName}

## Source Metadata

- Title: ${title}
- Original file: ${fileName}
- Source type: ${sourceType}
- Status: ${status}
- Imported: ${importedAt}
- Updated: ${updatedAt}
- Knowledge format: Markdown wiki
- Extracted characters: ${sourceText.length}
${extraction.note ? `- Note: ${extraction.note}\n` : ""}
## Extracted Reference Text

${sourceText}
`;
}

function writeSourceMarkdownMirror(id, { workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID, projectId = null, fileName, sourceType, status, importedAt, updatedAt, extraction }) {
  mkdirSync(join(DOCS_DIR, SOURCE_WIKI_CATEGORY), { recursive: true });
  const markdownPath = sourceMarkdownPathFor(id, fileName);
  const markdown = renderSourceMarkdown({ fileName, sourceType, status, importedAt, updatedAt, extraction });
  writeFileSync(markdownPath, markdown);
  indexMarkdownKnowledgeFile({
    workspaceId,
    groupId,
    projectId,
    title: extraction.title || fileName,
    sourcePath: markdownPath,
    content: markdown,
    metadata: {
      intake_method: "jimmy_source_upload",
      source_document_id: id,
      project_id: projectId,
      source_type: sourceType,
      status,
      extraction_status: extraction.status,
      extracted_characters: normalizeExtractedText(extraction.text).length,
      original_content_hash: extraction.text ? hashContent(normalizeExtractedText(extraction.text)) : null
    }
  });
  return markdownPath;
}

function extractionFromUploadedContent({ fileName, content, encoding }) {
  if (encoding === "base64" || !isTextSource(fileName)) {
    return {
      text: "",
      status: "stored-as-markdown",
      note: "The original upload was not stored. Add text extraction support for this file type to populate reference text automatically."
    };
  }
  return {
    text: normalizeExtractedText(content),
    status: "indexed",
    title: titleFromContent(content, fileName),
    note: "Converted uploaded content directly into a markdown wiki."
  };
}

function createSourceKnowledgeFromUpload({ workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID, projectId = null, fileName, content, sourceType = "reference", encoding = "utf8" }) {
  const timestamp = now();
  const cleanFileName = safeSourceFileName(fileName);
  const extraction = extractionFromUploadedContent({ fileName: cleanFileName, content, encoding });
  const contentForHash = extraction.text || `${cleanFileName}:${sourceType}:${encoding}`;
  const contentHash = hashContent(contentForHash);
  const duplicate = db.prepare(`
    SELECT * FROM source_documents
    WHERE content_hash = ? AND file_name = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(contentHash, cleanFileName);
  if (duplicate) {
    if (duplicate.markdown_path && existsSync(duplicate.markdown_path)) {
      const markdown = readFileSync(duplicate.markdown_path, "utf8");
      indexMarkdownKnowledgeFile({
        workspaceId,
        groupId,
        projectId,
        title: extraction.title || cleanFileName,
        sourcePath: duplicate.markdown_path,
        content: markdown,
        metadata: {
          intake_method: "jimmy_source_upload",
          source_document_id: duplicate.id,
          project_id: projectId,
          source_type: duplicate.source_type || sourceType,
          status: duplicate.status,
          extraction_status: extraction.status,
          extracted_characters: normalizeExtractedText(extraction.text).length,
          original_content_hash: extraction.text ? hashContent(normalizeExtractedText(extraction.text)) : null,
          duplicate_upload: true
        }
      });
    }
    return duplicate;
  }
  const result = db.prepare(`
    INSERT INTO source_documents (file_name, file_path, source_type, status, content_hash, extracted_text, imported_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cleanFileName, `wiki:${cleanFileName}:${timestamp}`, sourceType, extraction.status, contentHash, extraction.text, timestamp, timestamp);
  const id = Number(result.lastInsertRowid);
  const markdownPath = writeSourceMarkdownMirror(id, {
    workspaceId,
    groupId,
    projectId,
    fileName: cleanFileName,
    sourceType,
    status: extraction.status,
    importedAt: timestamp,
    updatedAt: timestamp,
    extraction
  });
  db.prepare("UPDATE source_documents SET file_path = ?, markdown_path = ? WHERE id = ?").run(markdownPath, markdownPath, id);
  return db.prepare("SELECT * FROM source_documents WHERE id = ?").get(id);
}

function readSourceMarkdown(doc, maxLength = 5000) {
  if (doc.markdown_path && existsSync(doc.markdown_path)) {
    return readFileSync(doc.markdown_path, "utf8").slice(0, maxLength);
  }
  return (doc.extracted_text || "").slice(0, maxLength);
}

function extractSourceText(filePath) {
  const fileName = filePath.split("/").pop() || filePath;
  if (!isTextSource(fileName)) {
    return {
      text: "",
      status: "stored",
      title: titleFromContent("", fileName),
      note: "Stored as a source file. Text extraction for this file type is not implemented yet."
    };
  }
  const stats = statSync(filePath);
  if (stats.size > 2_000_000) {
    return {
      text: normalizeExtractedText(readFileSync(filePath, "utf8").slice(0, 2_000_000)),
      status: "indexed",
      title: titleFromContent(readFileSync(filePath, "utf8").slice(0, 2_000_000), fileName),
      note: "Indexed the first 2 MB of this source file."
    };
  }
  const text = normalizeExtractedText(readFileSync(filePath, "utf8"));
  return {
    text,
    status: "indexed",
    title: titleFromContent(text, fileName),
    note: ""
  };
}

function upsertSourceDocument(filePath, sourceType = "reference") {
  const timestamp = now();
  const fileName = relativeSourcePath(filePath);
  const extraction = extractSourceText(filePath);
  const contentForHash = extraction.text || `${fileName}:${statSync(filePath).mtimeMs}`;
  const contentHash = hashContent(contentForHash);
  const existing = db.prepare("SELECT * FROM source_documents WHERE file_path = ?").get(filePath);
  if (existing) {
    const markdownPath = writeSourceMarkdownMirror(existing.id, {
      fileName,
      sourceType,
      status: extraction.status,
      importedAt: existing.imported_at,
      updatedAt: timestamp,
      extraction
    });
    db.prepare(`
      UPDATE source_documents
      SET file_name = ?, source_type = ?, status = ?, content_hash = ?, extracted_text = ?, markdown_path = ?, updated_at = ?
      WHERE id = ?
    `).run(fileName, sourceType, extraction.status, contentHash, extraction.text, markdownPath, timestamp, existing.id);
    return db.prepare("SELECT * FROM source_documents WHERE id = ?").get(existing.id);
  }
  const result = db.prepare(`
    INSERT INTO source_documents (file_name, file_path, source_type, status, content_hash, extracted_text, imported_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fileName, filePath, sourceType, extraction.status, contentHash, extraction.text, timestamp, timestamp);
  const id = Number(result.lastInsertRowid);
  const markdownPath = writeSourceMarkdownMirror(id, {
    fileName,
    sourceType,
    status: extraction.status,
    importedAt: timestamp,
    updatedAt: timestamp,
    extraction
  });
  db.prepare("UPDATE source_documents SET markdown_path = ? WHERE id = ?").run(markdownPath, id);
  return db.prepare("SELECT * FROM source_documents WHERE id = ?").get(id);
}

function syncSourceDocuments() {
  mkdirSync(SOURCE_DOCS_DIR, { recursive: true });
  const filePaths = listSourceFiles();
  const seen = new Set(filePaths);
  const existing = db.prepare("SELECT id, file_path, markdown_path FROM source_documents").all();
  for (const doc of existing) {
    if (String(doc.file_path || "").startsWith("wiki:") || String(doc.file_path || "").startsWith(DOCS_DIR)) {
      if (doc.markdown_path && !existsSync(doc.markdown_path)) {
        db.prepare("DELETE FROM source_documents WHERE id = ?").run(doc.id);
      }
      continue;
    }
    if (!seen.has(doc.file_path)) {
      if (doc.markdown_path && existsSync(doc.markdown_path)) unlinkSync(doc.markdown_path);
      db.prepare("DELETE FROM source_documents WHERE id = ?").run(doc.id);
    }
  }
  return filePaths.map(filePath => upsertSourceDocument(filePath));
}

function listSourceDocuments() {
  syncSourceDocuments();
  return db.prepare(`
    SELECT id, file_name, source_type, status, markdown_path, imported_at, updated_at,
           CASE WHEN extracted_text IS NULL THEN 0 ELSE length(extracted_text) END AS text_length
    FROM source_documents
    ORDER BY updated_at DESC
  `).all();
}

function searchSourceDocuments(query, limit = 5) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2);
  if (!terms.length) return [];
  syncSourceDocuments();
  return db.prepare("SELECT * FROM source_documents WHERE COALESCE(extracted_text, '') != '' ORDER BY updated_at DESC LIMIT 100").all()
    .map(doc => {
      const haystack = `${doc.file_name} ${doc.source_type} ${readSourceMarkdown(doc, 25_000)}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...doc, score };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.file_name.localeCompare(b.file_name))
    .slice(0, limit);
}

function getSourceDocument(id) {
  syncSourceDocuments();
  return db.prepare("SELECT * FROM source_documents WHERE id = ?").get(Number(id));
}

function draftWikiFromSourceDocument(doc) {
  const title = doc.file_name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  return `# ${title}

## Source

- File: ${doc.file_name}
- Source type: ${doc.source_type}
- Imported: ${doc.imported_at}
- Status: Draft pending review

## Summary

Add a plain-language summary of the source document.

## Key Requirements

- Add important requirements, limits, dates, responsibilities, and procedures.

## Procedure

1. Add repeatable steps from the source material.

## Reference Notes

${doc.extracted_text || "Text extraction is not available for this source file yet."}

## Open Questions

- Confirm whether this should be treated as OSHA guidance, company policy, manufacturer documentation, or internal notes.
`;
}

function shouldAutoCaptureMessage(message) {
  const trimmed = String(message || "").trim();
  if (!trimmed || trimmed.startsWith("/")) return false;
  if (/^(save wiki|save the wiki|save this wiki)$/i.test(trimmed)) return false;
  if (trimmed.length >= 300) return true;
  if (trimmed.split(/\r?\n/).filter(Boolean).length >= 4) return true;
  return /\b(documentation|policy|procedure|manual|notes|specs|requirements|checklist|SDS|OSHA|incident|inspection|toolbox talk|product brief)\b/i.test(trimmed)
    && trimmed.length >= 120;
}

function autoCaptureUserInput(message) {
  if (!shouldAutoCaptureMessage(message)) return null;
  const timestamp = now();
  const title = String(message).trim().split(/\r?\n/).find(Boolean)?.slice(0, 80) || "Chat intake";
  return createSourceKnowledgeFromUpload({
    fileName: `chat-intake-${slugifyWikiTitle(title)}.md`,
    sourceType: "chat-intake",
    encoding: "utf8",
    content: `# Chat Intake - ${timestamp}

## Source

- Origin: Jimmy chat
- Captured: ${timestamp}
- Status: Auto-captured markdown wiki

## User Provided Material

${message.trim()}
`
  });
}

function parseMarkdownSections(content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = {
        level: heading[1].length,
        heading: heading[2].trim(),
        content: line
      };
    } else if (current) {
      current.content += `\n${line}`;
    }
  }
  if (current) sections.push(current);
  return sections;
}

function searchWikiDocs(query, limit = 5) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2);
  const docs = listWikiDocs();
  return docs
    .map(doc => {
      const full = readWikiDoc(doc.id);
      const sections = full ? parseMarkdownSections(full.content) : [];
      const scoredSections = sections
        .map(section => {
          const sectionHaystack = `${section.heading} ${section.content}`.toLowerCase();
          const score = terms.length
            ? terms.reduce((total, term) => total + (sectionHaystack.includes(term) ? 1 : 0), 0)
            : 0;
          return { ...section, score };
        })
        .filter(section => section.score > 0)
        .sort((a, b) => b.score - a.score || a.level - b.level);
      const bestSection = scoredSections[0] || null;
      const haystack = `${doc.title} ${doc.summary} ${full?.content || ""}`.toLowerCase();
      const score = terms.length
        ? terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
        : 1;
      return {
        ...doc,
        content: bestSection?.content || full?.content || "",
        section: bestSection?.heading || "",
        score: score + (bestSection?.score || 0)
      };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function findSimilarJobsForGlobalChat(queryText) {
  const terms = queryText.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 3).slice(0, 12);
  if (!terms.length) return [];
  return listRecentJobs(100)
    .map(job => {
      let text = `${job.title} ${job.summary || ""} ${job.next_action || ""}`;
      const fullJob = getJob(job.id);
      if (fullJob) {
        try {
          for (const fileName of ["overview.md", "final-summary.md", "workflow.md", "tasks.md", "notes.md"]) {
            const path = join(fullJob.folder_path, fileName);
            if (existsSync(path)) text += ` ${readFileSync(path, "utf8")}`;
          }
        } catch {
          // Keep global chat responsive even if one job file is unreadable.
        }
      }
      const score = terms.reduce((total, term) => total + (text.toLowerCase().includes(term) ? 1 : 0), 0);
      return { ...job, score };
    })
    .filter(job => job.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function extractWikiCreationRequest(message) {
  const trimmed = message.trim();
  const command = trimmed.match(/^\/(?:create-wiki|document)\s+([^\n]+)?\n?([\s\S]*)$/i);
  if (command) {
    return {
      title: (command[1] || "New wiki").trim(),
      source: (command[2] || "").trim()
    };
  }
  if (/\b(turn|make|create|save|convert)\b[\s\S]{0,80}\b(?:wiki|documentation|markdown)\b/i.test(trimmed)) {
    const titleMatch = trimmed.match(/\b(?:called|titled|named|as)\s+["']?([^"'\n.]+)["']?/i);
    return {
      title: titleMatch?.[1]?.trim() || "New wiki",
      source: trimmed
    };
  }
  return null;
}

function extractSourceWikiRequest(message) {
  const trimmed = message.trim();
  const command = trimmed.match(/^\/wiki-from-doc(?:\s+(.+))?$/i);
  if (command) {
    return { query: (command[1] || "").trim() };
  }
  if (/\b(turn|make|create|convert)\b[\s\S]{0,120}\b(source|document|file|upload|reference)\b[\s\S]{0,80}\bwiki\b/i.test(trimmed)) {
    return { query: trimmed };
  }
  return null;
}

function inferWikiQuery(message) {
  const trimmed = message.trim();
  if (/^\/wiki\b/i.test(trimmed)) return trimmed.replace(/^\/wiki\s*/i, "");
  if (/\bwiki\b/i.test(trimmed)) return trimmed;
  if (/\b(use|look in|reference|from|according to|what does)\b[\s\S]{0,120}\b(say|wiki|documentation|docs)\b/i.test(trimmed)) return trimmed;
  return "";
}

function draftWikiMarkdown(title, source) {
  const cleanTitle = title || "New wiki";
  const cleanSource = source || "";
  return `# ${cleanTitle}

## Summary

Summarize the purpose and key idea of this wiki here.

## Key Details

- Add important facts, terms, constraints, and decisions.

## Process

1. Add repeatable steps or workflow notes.

## Reference

${cleanSource || "Add source notes here."}

## Open Questions

- Add anything that needs follow-up.
`;
}

function ensureDraftStatus(content, sourceLabel = "Jimmy generated draft") {
  const markdown = String(content || "").trim();
  if (/\n## Draft Status\b/i.test(markdown)) return `${markdown}\n`;
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines[0]?.match(/^#\s+/) ? lines.shift() : null;
  const statusBlock = `## Draft Status

- Status: Draft pending human review
- Source: ${sourceLabel}
- Generated: ${now()}
`;
  return `${titleLine ? `${titleLine}\n\n` : ""}${statusBlock}\n${lines.join("\n").trim()}\n`;
}

function preparePendingDraft({ title, content, sourceLabel, category = "reference-items/general" }) {
  const finalContent = ensureDraftStatus(content, sourceLabel);
  pendingJimmyWikiDraft = {
    title,
    content: finalContent,
    category
  };
  return pendingJimmyWikiDraft;
}

function categoryForGeneratedDocument(type) {
  return {
    "product-brief": "reference-items/product-briefs",
    "toolbox-talk": "reference-items/toolbox-talks",
    "inspection-report": "reference-items/inspection-reports",
    "incident-summary": "reference-items/incident-summaries",
    "osha-reference": "reference-items/osha-references"
  }[type] || "reference-items/general";
}

function extractGeneratedDocumentRequest(message) {
  const trimmed = message.trim();
  const command = trimmed.match(/^\/(product-brief|toolbox-talk|inspection-report|incident-summary|osha-reference)(?:\s+([\s\S]+))?$/i);
  if (command) {
    return {
      type: command[1].toLowerCase(),
      topic: (command[2] || command[1]).trim()
    };
  }

  const patterns = [
    { type: "product-brief", regex: /\b(create|make|draft|generate|write)\b[\s\S]{0,80}\bproduct brief\b/i },
    { type: "toolbox-talk", regex: /\b(create|make|draft|generate|write)\b[\s\S]{0,80}\btoolbox talk\b/i },
    { type: "inspection-report", regex: /\b(create|make|draft|generate|write|turn)\b[\s\S]{0,100}\binspection report\b/i },
    { type: "incident-summary", regex: /\b(create|make|draft|generate|write|summarize)\b[\s\S]{0,100}\bincident\b/i },
    { type: "osha-reference", regex: /\b(create|make|draft|generate|write)\b[\s\S]{0,100}\bOSHA\b[\s\S]{0,80}\breference\b/i }
  ];

  const match = patterns.find(pattern => pattern.regex.test(trimmed));
  if (!match) return null;
  return { type: match.type, topic: trimmed };
}

function titleForGeneratedDocument(type, topic) {
  const label = {
    "product-brief": "Product Brief",
    "toolbox-talk": "Toolbox Talk",
    "inspection-report": "Inspection Report",
    "incident-summary": "Incident Summary",
    "osha-reference": "OSHA Reference"
  }[type] || "Generated Document";
  const cleanedTopic = String(topic || "")
    .replace(/^\/[a-z-]+\s*/i, "")
    .replace(/\b(create|make|draft|generate|write|turn|summarize)\b/ig, "")
    .replace(/\b(product brief|toolbox talk|inspection report|incident summary|osha reference)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleanedTopic ? `${label}: ${cleanedTopic.slice(0, 80)}` : label;
}

function fallbackGeneratedDocumentMarkdown(type, title, message, sourceMatches) {
  const sourceNotes = sourceMatches.length
    ? sourceMatches.map(doc => `- ${doc.file_name} (${doc.source_type}, ${doc.status})`).join("\n")
    : "- No matching indexed source documents found.";
  return `# ${title}

## Purpose

Draft this ${type.replace(/-/g, " ")} for review.

## Request

${message}

## Key Points

- Add the main points, requirements, and recommendations here.
- Preserve source facts exactly.
- Mark unknowns clearly.

## Sources Used

${sourceNotes}

## Open Questions

- Confirm audience, date, jobsite, trade, and final review owner.
`;
}

async function createGeneratedDocumentWithAi(type, title, message, sourceMatches) {
  const sourceContext = sourceMatches.length
    ? sourceMatches.map(doc => `# Source: ${doc.file_name}\nType: ${doc.source_type}\nStatus: ${doc.status}\nMarkdown mirror: ${doc.markdown_path || "None"}\n\n${readSourceMarkdown(doc, 5000)}`).join("\n\n---\n\n")
    : "No matching indexed source documents found.";

  if (!process.env.OPENAI_API_KEY) {
    return fallbackGeneratedDocumentMarkdown(type, title, message, sourceMatches);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: "Create concise markdown drafts for a construction safety manager. Preserve source facts, do not invent OSHA requirements, cite source filenames in a Sources Used section, mark unknowns, and return only markdown."
        },
        {
          role: "user",
          content: `Document type: ${type}\nTitle: ${title}\nUser request: ${message}\n\nIndexed source context:\n${sourceContext}`
        }
      ]
    })
  });

  if (!response.ok) return fallbackGeneratedDocumentMarkdown(type, title, message, sourceMatches);
  const data = await response.json();
  return data.output_text || data.output?.flatMap(item => item.content || []).map(item => item.text || "").join("\n") || fallbackGeneratedDocumentMarkdown(type, title, message, sourceMatches);
}

async function createWikiDraftWithAi(title, source) {
  if (!process.env.OPENAI_API_KEY) {
    return draftWikiMarkdown(title, source);
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: "Turn user-provided documentation into clean markdown for a personal wiki. Use clear headings, preserve facts, avoid inventing details, and include open questions when information is missing. Return only markdown."
        },
        {
          role: "user",
          content: `Title: ${title}\n\nSource documentation:\n${source || "No source notes provided."}`
        }
      ]
    })
  });
  if (!response.ok) return draftWikiMarkdown(title, source);
  const data = await response.json();
  return data.output_text || data.output?.flatMap(item => item.content || []).map(item => item.text || "").join("\n") || draftWikiMarkdown(title, source);
}

async function searchLocations(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Location search failed with ${response.status}`);
  }
  const data = await response.json();
  return (data.results || []).map(location => {
    const region = [location.admin1, location.country].filter(Boolean).join(", ");
    return {
      name: [location.name, location.admin1 || location.country_code].filter(Boolean).join(", "),
      region,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone || "auto"
    };
  });
}

async function getWeatherForLocation(location) {
  const timezone = location.timezone && location.timezone !== "auto" ? location.timezone : "auto";
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=${encodeURIComponent(timezone)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather request failed with ${response.status}`);
  }
  const data = await response.json();
  return {
    location: location.name,
    temperature: Math.round(data.current?.temperature_2m),
    unit: "F",
    weatherCode: data.current?.weather_code,
    observedAt: data.current?.time
  };
}

async function getRaleighWeather() {
  return getWeatherForLocation({
    name: "Raleigh, NC",
    latitude: 35.7796,
    longitude: -78.6382,
    timezone: "America/New_York"
  });
}

async function handleAiChat(jobId, message) {
  const job = getJob(jobId);
  if (!job) return { status: 404, body: { error: "Job not found" } };

  const timestamp = now();
  db.prepare("INSERT INTO chat_messages (job_id, role, content, created_at) VALUES (?, 'user', ?, ?)")
    .run(jobId, message, timestamp);

  if (!process.env.OPENAI_API_KEY) {
    const content = "OpenAI is not configured yet. Set OPENAI_API_KEY in your terminal, restart the server, and I will answer using this job wiki plus similar past jobs.";
    db.prepare("INSERT INTO chat_messages (job_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)")
      .run(jobId, content, now());
    return { status: 200, body: { content } };
  }

  const context = assembleJobContext(job);
  const similarJobs = findSimilarJobs(jobId, `${job.title} ${job.summary || ""} ${message}`)
    .map(similar => `- ${similar.title}: ${similar.summary || "No summary"}`)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: "You are a local personal work wiki assistant. Answer from the provided markdown context. Preserve facts, identify assumptions, suggest concrete next actions, and do not invent missing details."
        },
        {
          role: "user",
          content: `Current job:\n${JSON.stringify(job, null, 2)}\n\nSimilar past jobs:\n${similarJobs || "None found"}\n\nWiki context:\n${context}\n\nUser question:\n${message}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.output_text || data.output?.flatMap(item => item.content || []).map(item => item.text || "").join("\n") || "No response text returned.";
  db.prepare("INSERT INTO chat_messages (job_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)")
    .run(jobId, content, now());
  return { status: 200, body: { content } };
}

async function handleJimmyChat(message, activeJobId = null) {
  const timestamp = now();
  db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('user', ?, ?)")
    .run(message, timestamp);
  appendJimmyChatLog("user", message);
  const autoCapturedSource = autoCaptureUserInput(message);

  if (/^\/sources$/i.test(message.trim())) {
    const docs = listSourceDocuments();
    const content = docs.length
      ? `Source knowledge markdown wikis:\n\n${docs.map(doc => `- #${doc.id} ${doc.file_name} (${doc.status}, ${doc.text_length} chars indexed)\n  Wiki: ${doc.markdown_path ? doc.markdown_path.replace(`${ROOT}/`, "") : "Not generated yet"}`).join("\n")}`
      : "No source knowledge wikis yet. Upload a text-like file with the + button, paste substantial material into chat, or add files to work-wiki-data/source-documents for conversion.";
    db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
      .run(content, now());
    appendJimmyChatLog("assistant", content);
    return { status: 200, body: { content } };
  }

  if (/^(save wiki|save the wiki|save this wiki|yes save it|save as reference|save this as reference|final draft|this is final)$/i.test(message.trim())) {
    if (!pendingJimmyWikiDraft) {
      const content = "I do not have a final draft waiting to save yet. Ask me to generate the document first, then tell me when it is the final draft to save as a reference.";
      db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
        .run(content, now());
      appendJimmyChatLog("assistant", content);
      return { status: 200, body: { content } };
    }
    const doc = writeWikiDoc(pendingJimmyWikiDraft);
    pendingJimmyWikiDraft = null;
    const content = `Saved wiki: ${doc.title}\nPath: ${doc.path}\n\nIt is now available in the Wiki tab and through /wiki ${doc.title}.`;
    db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
      .run(content, now());
    appendJimmyChatLog("assistant", content);
    return { status: 200, body: { content, savedWiki: doc } };
  }

  const wikiCreation = extractWikiCreationRequest(message);
  if (wikiCreation) {
    const markdown = await createWikiDraftWithAi(wikiCreation.title, wikiCreation.source || message);
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] || wikiCreation.title || "New wiki";
    const draft = preparePendingDraft({
      title,
      content: markdown,
      sourceLabel: autoCapturedSource ? `Auto-captured chat source: ${autoCapturedSource.file_name}` : "Pasted chat documentation",
      category: "reference-items/wiki-drafts"
    });
    const content = `I drafted a wiki for "${draft.title}". Review it below.\n\nIf this is the final draft you want saved as a reference for me to reuse, reply: "save as reference".\n\n${draft.content}`;
    db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
      .run(content, now());
    appendJimmyChatLog("assistant", content);
    return { status: 200, body: { content, draftWiki: draft } };
  }

  const sourceWikiRequest = extractSourceWikiRequest(message);
  if (sourceWikiRequest) {
    const docs = sourceWikiRequest.query
      ? searchSourceDocuments(sourceWikiRequest.query, 3)
      : listSourceDocuments().slice(0, 3);
    if (!docs.length) {
      const content = "I do not see any indexed source knowledge wikis yet. Upload a text-like file with the + button, paste substantial material into chat, or add files to work-wiki-data/source-documents for conversion.";
      db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
        .run(content, now());
      appendJimmyChatLog("assistant", content);
      return { status: 200, body: { content } };
    }
    const doc = docs[0];
    const markdown = process.env.OPENAI_API_KEY
      ? await createWikiDraftWithAi(doc.file_name.replace(/\.[^.]+$/, ""), `Source document: ${doc.file_name}\nSource type: ${doc.source_type}\nMarkdown mirror: ${doc.markdown_path || "None"}\n\n${readSourceMarkdown(doc, 80_000) || "No extracted text available."}`)
      : draftWikiFromSourceDocument(doc);
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] || doc.file_name.replace(/\.[^.]+$/, "");
    const draft = preparePendingDraft({
      title,
      content: markdown,
      sourceLabel: `Source document: ${doc.file_name}`,
      category: "reference-items/source-wikis"
    });
    const content = `I drafted a wiki from source document #${doc.id}: ${doc.file_name}. Review it below.\n\nIf this is the final draft you want saved as a reference for me to reuse, reply: "save as reference".\n\n${draft.content}`;
    db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
      .run(content, now());
    appendJimmyChatLog("assistant", content);
    return { status: 200, body: { content, draftWiki: draft } };
  }

  const activeJob = activeJobId ? getJob(Number(activeJobId)) : null;
  const activeJobContext = activeJob ? assembleJobContext(activeJob) : "";
  const wikiQuery = inferWikiQuery(message);
  const wikiMatches = wikiQuery ? searchWikiDocs(wikiQuery, 5) : [];
  const sourceMatches = searchSourceDocuments(message, 5);

  const generatedDocumentRequest = extractGeneratedDocumentRequest(message);
  if (generatedDocumentRequest) {
    const title = titleForGeneratedDocument(generatedDocumentRequest.type, generatedDocumentRequest.topic);
    const markdown = await createGeneratedDocumentWithAi(generatedDocumentRequest.type, title, message, sourceMatches);
    const draft = preparePendingDraft({
      title: markdown.match(/^#\s+(.+)$/m)?.[1] || title,
      content: markdown,
      sourceLabel: autoCapturedSource ? `Generated from Jimmy chat request and ${autoCapturedSource.file_name}` : "Generated from Jimmy chat request",
      category: categoryForGeneratedDocument(generatedDocumentRequest.type)
    });
    const content = `I created a draft. Review it below.\n\nIf this is the final draft you want saved as a reference for me to reuse, reply: "save as reference".\n\n${draft.content}`;
    db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
      .run(content, now());
    appendJimmyChatLog("assistant", content);
    return { status: 200, body: { content, draftWiki: draft } };
  }

  const recentJobs = listRecentJobs(12);
  const matchingJobs = findSimilarJobsForGlobalChat(message);
  const pendingReminders = db.prepare(`
    SELECT reminders.title, reminders.due_at, jobs.title AS job_title
    FROM reminders
    LEFT JOIN jobs ON jobs.id = reminders.job_id
    WHERE reminders.status != 'done'
    ORDER BY reminders.due_at ASC
    LIMIT 12
  `).all();

  if (!process.env.OPENAI_API_KEY) {
    const content = "Jimmy is ready, but OpenAI is not configured yet. Add OPENAI_API_KEY to your .env file, restart the server, and I can chat across your jobs, reminders, and wiki files.";
    db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
      .run(content, now());
    appendJimmyChatLog("assistant", content);
    return { status: 200, body: { content } };
  }

  const commandHint = message.trim().startsWith("/")
    ? "The user entered a slash command. Explain what it means if recognized, or suggest a useful command shape if not implemented yet."
    : "The user entered a normal chat message.";
  const explainHint = /^\/explain\b/i.test(message.trim()) || /\b(how does|how do|how is|explain|walk me through|what happens when|what is the process)\b/i.test(message)
    ? "The user is asking for a process explanation. Answer with a concise, plain-language walkthrough: 1-5 numbered steps, what Jimmy does, what the user does, what gets saved or changed, and what requires approval. Avoid unnecessary technical detail unless asked."
    : "";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: "You are Jimmy, the single local personal operations assistant and work wiki assistant. You support both slash commands and plain-language requests for the same workflows: requests, job wikis, reminders, documentation, safety-manager documents, email drafts, process explanations, next actions, and follow-through. The user no longer uses a separate wiki chatbot. Be concise, practical, and action-oriented. When the user asks how something works, explain it in clear numbered steps, plain language, and only enough detail to help them act. Include what Jimmy does, what the user does, what gets saved or changed, and what requires approval. Use wiki reference matches when the user mentions a wiki, documentation, safety topic, OSHA topic, or a topic likely stored in docs. Cite the wiki title and section when useful. If multiple wiki matches are plausible, ask a brief clarification question. Preserve facts, call out assumptions, and suggest concrete next steps. Treat safety and compliance outputs as drafts that need human review."
        },
        {
          role: "user",
          content: `${commandHint}
${explainHint}

Active job:
${activeJob ? JSON.stringify(activeJob, null, 2) : "None selected"}

Active job wiki context:
${activeJobContext || "None selected"}

Wiki reference matches:
${wikiMatches.length ? wikiMatches.map(doc => `# ${doc.title}${doc.section ? `\nSection: ${doc.section}` : ""}\nPath: ${doc.path}\n\n${doc.content.slice(0, 4000)}`).join("\n\n---\n\n") : "None selected"}

Source document matches:
${sourceMatches.length ? sourceMatches.map(doc => `# Source: ${doc.file_name}\nType: ${doc.source_type}\nStatus: ${doc.status}\nMarkdown mirror: ${doc.markdown_path || "None"}\n\n${readSourceMarkdown(doc, 4000)}`).join("\n\n---\n\n") : "None selected"}

Recent jobs:
${JSON.stringify(recentJobs, null, 2)}

Relevant jobs:
${JSON.stringify(matchingJobs, null, 2)}

Pending reminders:
${JSON.stringify(pendingReminders, null, 2)}

User message:
${message}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.output_text || data.output?.flatMap(item => item.content || []).map(item => item.text || "").join("\n") || "No response text returned.";
  db.prepare("INSERT INTO assistant_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
    .run(content, now());
  appendJimmyChatLog("assistant", content);
  return { status: 200, body: { content } };
}

function buildDailyBrief(dashboardData) {
  const today = new Date().toDateString();
  const reminders = dashboardData.reminders || [];
  const weeklyTasks = dashboardData.weeklyTasks || [];
  const waitingItems = dashboardData.waitingItems || [];
  const safetyWatch = dashboardData.safetyWatch || [];
  const draftResponses = dashboardData.draftResponses || [];
  const sourceKnowledge = dashboardData.sourceKnowledge || [];
  const pickup = dashboardData.pickup || [];
  const dueToday = reminders.filter(item => item.due_at && new Date(item.due_at).toDateString() === today);
  const overdue = [
    ...reminders.filter(item => item.due_at && new Date(item.due_at) < new Date()),
    ...weeklyTasks.filter(item => item.due_at && new Date(item.due_at) < new Date())
  ];
  const priorityItems = [
    ...overdue.map(item => ({ title: item.title, meta: `Overdue${item.due_at ? ` - ${formatIsoForDashboard(item.due_at)}` : ""}` })),
    ...dueToday.map(item => ({ title: item.title, meta: `Today${item.due_at ? ` - ${formatIsoForDashboard(item.due_at)}` : ""}` })),
    ...weeklyTasks.slice(0, 5).map(item => ({ title: item.title, meta: `${item.status || "todo"}${item.due_at ? ` - ${formatIsoForDashboard(item.due_at)}` : ""}` }))
  ].slice(0, 7);
  const focus = overdue.length
    ? `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"} need attention first.`
    : dueToday.length
      ? `${dueToday.length} scheduled item${dueToday.length === 1 ? "" : "s"} due today.`
      : weeklyTasks.length
        ? `${weeklyTasks.length} open action${weeklyTasks.length === 1 ? "" : "s"} available to move forward.`
        : "No urgent local items. Use chat to capture new work or connect sources.";
  const sections = {
    priorities: priorityItems,
    followUps: waitingItems.slice(0, 5),
    knowledge: [...safetyWatch, ...sourceKnowledge].slice(0, 5),
    resume: pickup.slice(0, 3),
    drafts: draftResponses.slice(0, 4)
  };
  const dateKey = localDateKey();
  const lines = [
    `# Daily Brief - ${dateKey}`,
    "",
    `Generated: ${dashboardData.now}`,
    "",
    "## Focus",
    "",
    focus,
    "",
    "## Priorities",
    "",
    ...(sections.priorities.length ? sections.priorities.map(item => `- ${item.title}${item.meta ? ` (${item.meta})` : ""}`) : ["- Nothing urgent right now."]),
    "",
    "## Follow Ups",
    "",
    ...(sections.followUps.length ? sections.followUps.map(item => `- ${item.title}${item.meta ? ` (${item.meta})` : ""}`) : ["- No follow-ups waiting."]),
    "",
    "## Knowledge Updates",
    "",
    ...(sections.knowledge.length ? sections.knowledge.map(item => `- ${item.title}${item.meta ? ` (${item.meta})` : ""}`) : ["- No source or safety updates to scan."]),
    "",
    "## Resume Work",
    "",
    ...(sections.resume.length ? sections.resume.map(item => `- ${item.title}${item.next_action ? ` - ${item.next_action}` : item.summary ? ` - ${item.summary}` : ""}`) : ["- Nothing to pick up yet."]),
    "",
    "## Suggested Next Actions",
    "",
    "- Ask EOS to create tasks for anything missing from this brief.",
    "- Review overdue and due-today items before starting new work.",
    "- Capture decisions in chat so they remain searchable later.",
    ""
  ];
  return {
    date: dateKey,
    generatedAt: dashboardData.now,
    focus,
    counts: {
      dueToday: dueToday.length,
      overdue: overdue.length,
      openTasks: weeklyTasks.length,
      waiting: waitingItems.length,
      knowledge: sourceKnowledge.length
    },
    sections,
    markdown: lines.join("\n")
  };
}

function writeDailyBriefMarkdown(dailyBrief, workspaceId = DEFAULT_WORKSPACE_ID) {
  const folder = join(DOCS_DIR, "eos", "workspaces", workspaceId, "daily");
  mkdirSync(folder, { recursive: true });
  const datedPath = join(folder, `${dailyBrief.date}-DAILY-BRIEF.md`);
  const latestPath = join(DOCS_DIR, "eos", "workspaces", workspaceId, "DAILY-BRIEF.md");
  mkdirSync(resolve(latestPath, ".."), { recursive: true });
  writeFileSync(datedPath, dailyBrief.markdown);
  writeFileSync(latestPath, dailyBrief.markdown);
  return { datedPath: displayPath(datedPath), latestPath: displayPath(latestPath) };
}

function buildDashboardPayload(workspaceId = DEFAULT_WORKSPACE_ID) {
  const nowIso = now();
  const reminders = db.prepare(`
    SELECT reminders.*, jobs.title AS job_title
    FROM reminders
    LEFT JOIN jobs ON jobs.id = reminders.job_id
    WHERE reminders.status != 'done'
    ORDER BY reminders.due_at ASC
    LIMIT 20
  `).all();
  const weeklyTasks = db.prepare(`
    SELECT tasks.*, jobs.title AS job_title
    FROM tasks
    LEFT JOIN jobs ON jobs.id = tasks.job_id
    WHERE tasks.status != 'done'
    ORDER BY COALESCE(tasks.due_at, tasks.updated_at) ASC
    LIMIT 20
  `).all();
  const pickup = db.prepare(`
    SELECT jobs.id, jobs.title, jobs.status, jobs.priority, jobs.summary, jobs.next_action, jobs.updated_at, people.name AS requester_name
    FROM jobs
    LEFT JOIN people ON people.id = jobs.requester_id
    WHERE jobs.status != 'done' AND jobs.status != 'archived'
    ORDER BY jobs.updated_at DESC
    LIMIT 5
  `).all();
  const recentActivity = db.prepare(`
    SELECT 'chat' AS type, content AS title, created_at, NULL AS job_title
    FROM assistant_messages
    UNION ALL
    SELECT workflow_events.event_type AS type, COALESCE(jobs.title, workflow_events.event_type) AS title, workflow_events.created_at, jobs.title AS job_title
    FROM workflow_events
    LEFT JOIN jobs ON jobs.id = workflow_events.job_id
    ORDER BY created_at DESC
    LIMIT 12
  `).all();
  const sourceKnowledge = listWikiDocs()
    .filter(doc => doc.id.startsWith("source-knowledge/") || doc.id.startsWith("reference-items/"))
    .slice(0, 6)
    .map(doc => ({ title: doc.title, meta: doc.path }));
  const waitingItems = [
    ...weeklyTasks.filter(task => /\b(waiting|follow up|follow-up|pending|approval|response)\b/i.test(`${task.title} ${task.job_title || ""}`)),
    ...pickup.filter(job => /\b(waiting|follow up|follow-up|pending|approval|response)\b/i.test(`${job.title} ${job.summary || ""} ${job.next_action || ""}`))
  ].slice(0, 6).map(item => ({
    title: item.title,
    meta: item.job_title || item.next_action || item.summary || "Waiting on outside input"
  }));
  const safetyWatch = [
    ...weeklyTasks.filter(task => /\b(inspection|incident|corrective|training|osha|safety|audit|hazard|toolbox)\b/i.test(`${task.title} ${task.job_title || ""}`)),
    ...reminders.filter(reminder => /\b(inspection|incident|corrective|training|osha|safety|audit|hazard|toolbox)\b/i.test(`${reminder.title} ${reminder.job_title || ""}`))
  ].slice(0, 6).map(item => ({
    title: item.title,
    meta: `${item.due_at ? formatIsoForDashboard(item.due_at) : "No date"}${item.job_title ? ` · ${item.job_title}` : ""}`
  }));
  const draftResponses = recentActivity
    .filter(item => /\b(draft|reply|email|response|outlook)\b/i.test(item.title || ""))
    .slice(0, 5)
    .map(item => ({
      title: String(item.title || "Draft response").slice(0, 120),
      meta: `${item.type} · ${formatIsoForDashboard(item.created_at)}`
    }));
  const payload = {
    now: nowIso,
    reminders,
    weeklyTasks,
    pickup,
    recentActivity,
    sourceKnowledge,
    waitingItems,
    safetyWatch,
    draftResponses,
    calendarItems: []
  };
  const dailyBrief = buildDailyBrief(payload);
  payload.dailyBrief = { ...dailyBrief, paths: writeDailyBriefMarkdown(dailyBrief, workspaceId) };
  return payload;
}

async function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    const workspaces = db.prepare("SELECT * FROM workspaces ORDER BY updated_at DESC").all();
    return json(res, 200, { appMode: APP_MODE, workspaces });
  }

  if (req.method === "POST" && url.pathname === "/api/workspaces") {
    const body = await readJson(req);
    const timestamp = now();
    const id = String(body.id || `workspace_${randomBytes(8).toString("hex")}`);
    const name = String(body.name || "New Workspace").trim() || "New Workspace";
    db.prepare(`
      INSERT INTO workspaces (id, name, mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, APP_MODE, timestamp, timestamp);
    return json(res, 201, { workspace: db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) });
  }

  if (req.method === "GET" && url.pathname === "/api/workspace-summary") {
    const { workspaceId, groupId, userId } = requestWorkspace(req);
    const summary = buildWorkspaceSummary({ workspaceId, groupId, userId });
    if (!summary) return json(res, 404, { error: "Workspace not found" });
    return json(res, 200, summary);
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    const { workspaceId, groupId, userId } = requestWorkspace(req);
    if (!userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.projects.read" })) {
      return forbidden(res, "You do not have permission to read projects.");
    }
    const requestedGroupId = url.searchParams.get("groupId") || url.searchParams.get("group_id") || groupId;
    const projects = db.prepare(`
      SELECT projects.*,
        (SELECT count(*) FROM tasks WHERE tasks.workspace_id = projects.workspace_id AND tasks.project_id = projects.id) AS task_count,
        (SELECT count(*) FROM documents WHERE documents.workspace_id = projects.workspace_id AND documents.project_id = projects.id) AS document_count,
        (SELECT count(*) FROM chat_threads WHERE chat_threads.workspace_id = projects.workspace_id AND chat_threads.project_id = projects.id) AS thread_count
      FROM projects
      WHERE workspace_id = ?
        AND (group_id = ? OR group_id IS NULL OR ? IS NULL)
      ORDER BY updated_at DESC, name ASC
    `).all(workspaceId, requestedGroupId, requestedGroupId)
      .filter(project => userCanAccessGroup({ workspaceId, userId, groupId: project.group_id }));
    return json(res, 200, { projects });
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson(req);
    const { workspaceId, groupId, userId } = requestWorkspace(req, body);
    if (!userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.projects.manage" })) {
      return forbidden(res, "You do not have permission to create projects.");
    }
    const project = createProject({
      workspaceId,
      groupId,
      userId,
      name: body.name,
      summary: body.summary || null,
      status: body.status || "active",
      metadata: body.metadata || {}
    });
    if (!project) return json(res, 400, { error: "Project name is required" });
    createWorkspaceEvent({
      workspaceId,
      groupId,
      projectId: project.id,
      type: "PROJECT_CREATED",
      actorType: "user",
      actorId: userId,
      payload: { project_id: project.id, name: project.name }
    });
    const markdown = syncProjectMarkdownFiles(workspaceId, project.id);
    return json(res, 201, { project, markdown });
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  const projectSummaryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/summary$/);
  if (projectSummaryMatch && req.method === "GET") {
    const { workspaceId, userId } = requestWorkspace(req);
    const projectId = decodeURIComponent(projectSummaryMatch[1]);
    const summary = buildProjectSummary({ workspaceId, projectId, userId });
    if (!summary) return json(res, 404, { error: "Project not found" });
    if (summary.forbidden) return forbidden(res, "You do not have permission to read this project.");
    return json(res, 200, summary);
  }

  if (projectMatch && req.method === "GET") {
    const { workspaceId, userId } = requestWorkspace(req);
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = db.prepare("SELECT * FROM projects WHERE id = ? AND workspace_id = ?").get(projectId, workspaceId);
    if (!project) return json(res, 404, { error: "Project not found" });
    if (!userHasPermission({ workspaceId, userId, groupId: project.group_id, permissionId: "perm.projects.read" }) || !userCanAccessGroup({ workspaceId, userId, groupId: project.group_id })) {
      return forbidden(res, "You do not have permission to read this project.");
    }
    const tasks = db.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 100").all(workspaceId, projectId);
    const documents = db.prepare("SELECT * FROM documents WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 100").all(workspaceId, projectId);
    const threads = db.prepare("SELECT * FROM chat_threads WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 100").all(workspaceId, projectId);
    const events = db.prepare("SELECT * FROM events WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 100").all(workspaceId, projectId);
    const agentOutputs = db.prepare("SELECT * FROM agent_outputs WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 100").all(workspaceId, projectId);
    const markdownFiles = db.prepare("SELECT * FROM markdown_files WHERE workspace_id = ? AND project_id = ? ORDER BY title").all(workspaceId, projectId);
    return json(res, 200, { project, tasks, documents, threads, events, agentOutputs, markdownFiles });
  }

  if (projectMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const { workspaceId, groupId, userId } = requestWorkspace(req, body);
    const projectId = decodeURIComponent(projectMatch[1]);
    const existing = db.prepare("SELECT * FROM projects WHERE id = ? AND workspace_id = ?").get(projectId, workspaceId);
    if (!existing) return json(res, 404, { error: "Project not found" });
    if (!userHasPermission({ workspaceId, userId, groupId: existing.group_id || groupId, permissionId: "perm.projects.manage" }) || !userCanAccessGroup({ workspaceId, userId, groupId: existing.group_id || groupId })) {
      return forbidden(res, "You do not have permission to update this project.");
    }
    const name = body.name === undefined ? existing.name : String(body.name || "").trim();
    if (!name) return json(res, 400, { error: "Project name is required" });
    const status = ["active", "paused", "done", "archived"].includes(body.status) ? body.status : existing.status;
    const summary = body.summary === undefined ? existing.summary : body.summary || null;
    const metadata = body.metadata === undefined ? existing.metadata_json : JSON.stringify(body.metadata || {});
    const slug = name === existing.name ? existing.slug : uniqueProjectSlug(workspaceId, name, projectId);
    const timestamp = now();
    db.prepare(`
      UPDATE projects
      SET name = ?, slug = ?, status = ?, summary = ?, metadata_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(name, slug, status, summary, metadata, timestamp, projectId, workspaceId);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      projectId,
      type: "PROJECT_UPDATED",
      actorType: "user",
      actorId: userId,
      payload: { project_id: projectId, status }
    });
    const markdown = syncProjectMarkdownFiles(workspaceId, projectId);
    return json(res, 200, { project: db.prepare("SELECT * FROM projects WHERE id = ? AND workspace_id = ?").get(projectId, workspaceId), markdown });
  }

  if (req.method === "GET" && url.pathname === "/api/groups") {
    const { workspaceId } = requestWorkspace(req);
    const groups = db.prepare(`
      SELECT groups.*,
        (SELECT count(*) FROM group_members WHERE group_members.workspace_id = groups.workspace_id AND group_members.group_id = groups.id) AS member_count
      FROM groups
      WHERE workspace_id = ?
      ORDER BY COALESCE(parent_group_id, ''), name
    `).all(workspaceId);
    return json(res, 200, { groups });
  }

  if (req.method === "POST" && url.pathname === "/api/groups") {
    const body = await readJson(req);
    const { workspaceId } = requestWorkspace(req, body);
    const name = String(body.name || "").trim();
    if (!name) return json(res, 400, { error: "Group name is required" });
    const slug = String(body.slug || slugifyWikiTitle(name)).trim();
    const id = String(body.id || `group-${slug}-${randomBytes(4).toString("hex")}`);
    const timestamp = now();
    db.prepare(`
      INSERT INTO groups (id, workspace_id, parent_group_id, name, slug, group_type, description, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      body.parentGroupId || body.parent_group_id || null,
      name,
      slug,
      body.groupType || body.group_type || "team",
      body.description || null,
      JSON.stringify(body.metadata || {}),
      timestamp,
      timestamp
    );
    return json(res, 201, { group: db.prepare("SELECT * FROM groups WHERE id = ? AND workspace_id = ?").get(id, workspaceId) });
  }

  if (req.method === "POST" && url.pathname === "/api/groups/members") {
    const body = await readJson(req);
    const { workspaceId } = requestWorkspace(req, body);
    const groupId = String(body.groupId || body.group_id || "").trim();
    const userId = String(body.userId || body.user_id || "").trim();
    if (!groupId || !userId) return json(res, 400, { error: "groupId and userId are required" });
    const timestamp = now();
    db.prepare(`
      INSERT INTO group_members (workspace_id, group_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, group_id, user_id)
      DO UPDATE SET role = excluded.role
    `).run(workspaceId, groupId, userId, body.role || "member", timestamp);
    return json(res, 200, {
      member: db.prepare("SELECT * FROM group_members WHERE workspace_id = ? AND group_id = ? AND user_id = ?").get(workspaceId, groupId, userId)
    });
  }

  if (req.method === "GET" && url.pathname === "/api/roles") {
    const { workspaceId } = requestWorkspace(req);
    const roles = db.prepare("SELECT * FROM roles WHERE workspace_id = ? ORDER BY name").all(workspaceId);
    const permissions = db.prepare("SELECT * FROM permissions ORDER BY resource_type, action").all();
    const rolePermissions = db.prepare(`
      SELECT role_permissions.*, permissions.resource_type, permissions.action
      FROM role_permissions
      JOIN permissions ON permissions.id = role_permissions.permission_id
      WHERE role_permissions.workspace_id = ?
      ORDER BY role_permissions.role_id, permissions.resource_type, permissions.action
    `).all(workspaceId);
    return json(res, 200, { roles, permissions, rolePermissions });
  }

  if (req.method === "POST" && url.pathname === "/api/roles") {
    const body = await readJson(req);
    const { workspaceId, userId } = requestWorkspace(req, body);
    if (!userHasPermission({ workspaceId, userId, permissionId: "perm.roles.manage" })) {
      return json(res, 403, { error: "You do not have permission to manage roles." });
    }
    const name = String(body.name || "").trim();
    if (!name) return json(res, 400, { error: "Role name is required" });
    const slug = String(body.slug || slugifyWikiTitle(name));
    const id = String(body.id || `role-${slug}-${randomBytes(4).toString("hex")}`);
    const timestamp = now();
    db.prepare(`
      INSERT INTO roles (id, workspace_id, name, slug, description, is_system, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, workspaceId, name, slug, body.description || null, timestamp, timestamp);
    for (const permissionId of body.permissionIds || body.permission_ids || []) {
      db.prepare(`
        INSERT OR IGNORE INTO role_permissions (workspace_id, role_id, permission_id, granted_by, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(workspaceId, id, permissionId, userId, timestamp);
    }
    return json(res, 201, { role: db.prepare("SELECT * FROM roles WHERE workspace_id = ? AND id = ?").get(workspaceId, id) });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    const { workspaceId } = requestWorkspace(req);
    const users = db.prepare("SELECT * FROM users WHERE workspace_id = ? ORDER BY status = 'active' DESC, name").all(workspaceId);
    return json(res, 200, { users });
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const body = await readJson(req);
    const { workspaceId, userId: actorId } = requestWorkspace(req, body);
    if (!userHasPermission({ workspaceId, userId: actorId, permissionId: "perm.users.manage" })) {
      return json(res, 403, { error: "You do not have permission to manage users." });
    }
    const timestamp = now();
    const id = String(body.id || `user_${randomBytes(8).toString("hex")}`);
    const name = String(body.name || "Workspace User").trim() || "Workspace User";
    db.prepare(`
      INSERT INTO users (id, workspace_id, name, email, role, status, title, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(id, workspaceId, name, body.email || null, body.role || "member", body.title || null, JSON.stringify(body.metadata || {}), timestamp, timestamp);
    const groupId = body.groupId || body.group_id || DEFAULT_GROUP_ID;
    const roleId = body.roleId || body.role_id || "role-field-user";
    db.prepare(`
      INSERT OR IGNORE INTO group_members (workspace_id, group_id, user_id, role, created_at)
      VALUES (?, ?, ?, 'member', ?)
    `).run(workspaceId, groupId, id, timestamp);
    db.prepare(`
      INSERT OR IGNORE INTO user_roles (workspace_id, group_id, user_id, role_id, assigned_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(workspaceId, groupId, id, roleId, actorId, timestamp);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "user.created",
      actorType: "user",
      actorId,
      payload: { user_id: id, role_id: roleId }
    });
    return json(res, 201, { user: db.prepare("SELECT * FROM users WHERE id = ? AND workspace_id = ?").get(id, workspaceId) });
  }

  const userStatusMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/status$/);
  if (req.method === "PATCH" && userStatusMatch) {
    const body = await readJson(req);
    const { workspaceId, userId: actorId, groupId } = requestWorkspace(req, body);
    if (!userHasPermission({ workspaceId, userId: actorId, permissionId: "perm.users.manage" })) {
      return json(res, 403, { error: "You do not have permission to manage users." });
    }
    const targetUserId = decodeURIComponent(userStatusMatch[1]);
    const status = ["active", "inactive", "retired"].includes(body.status) ? body.status : "inactive";
    const timestamp = now();
    db.prepare(`
      UPDATE users
      SET status = ?, deactivated_at = CASE WHEN ? = 'active' THEN NULL ELSE ? END, updated_at = ?
      WHERE workspace_id = ? AND id = ?
    `).run(status, status, timestamp, timestamp, workspaceId, targetUserId);
    db.prepare(`
      INSERT INTO user_transitions (workspace_id, user_id, transition_type, notes, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(workspaceId, targetUserId, status === "retired" ? "retired" : status === "active" ? "reactivated" : "deactivated", body.notes || null, actorId, timestamp);
    if (body.reassignToUserId || body.reassign_to_user_id) {
      const nextOwner = body.reassignToUserId || body.reassign_to_user_id;
      db.prepare(`
        UPDATE requests SET owner_id = ?, updated_at = ?
        WHERE workspace_id = ? AND owner_id = ? AND status NOT IN ('closed', 'done', 'archived')
      `).run(nextOwner, timestamp, workspaceId, targetUserId);
      db.prepare(`
        UPDATE work_assignments SET assigned_to_user_id = ?, updated_at = ?
        WHERE workspace_id = ? AND assigned_to_user_id = ? AND status = 'active'
      `).run(nextOwner, timestamp, workspaceId, targetUserId);
    }
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "user.status_changed",
      actorType: "user",
      actorId,
      payload: { user_id: targetUserId, status }
    });
    return json(res, 200, { user: db.prepare("SELECT * FROM users WHERE workspace_id = ? AND id = ?").get(workspaceId, targetUserId) });
  }

  if (req.method === "POST" && url.pathname === "/api/user-roles") {
    const body = await readJson(req);
    const { workspaceId, userId: actorId, groupId } = requestWorkspace(req, body);
    if (!userHasPermission({ workspaceId, userId: actorId, permissionId: "perm.users.manage" })) {
      return json(res, 403, { error: "You do not have permission to assign roles." });
    }
    const targetUserId = String(body.userId || body.user_id || "").trim();
    const roleId = String(body.roleId || body.role_id || "").trim();
    const targetGroupId = String(body.groupId || body.group_id || groupId);
    if (!targetUserId || !roleId) return json(res, 400, { error: "userId and roleId are required" });
    const timestamp = now();
    db.prepare(`
      INSERT OR IGNORE INTO user_roles (workspace_id, group_id, user_id, role_id, assigned_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(workspaceId, targetGroupId, targetUserId, roleId, actorId, timestamp);
    db.prepare(`
      INSERT OR IGNORE INTO group_members (workspace_id, group_id, user_id, role, created_at)
      VALUES (?, ?, ?, 'member', ?)
    `).run(workspaceId, targetGroupId, targetUserId, timestamp);
    return json(res, 200, {
      userRoles: db.prepare("SELECT * FROM user_roles WHERE workspace_id = ? AND user_id = ?").all(workspaceId, targetUserId)
    });
  }

  if (req.method === "GET" && url.pathname === "/api/me/permissions") {
    const { workspaceId, userId, groupId } = requestWorkspace(req);
    return json(res, 200, { permissions: listUserPermissions(workspaceId, userId, groupId) });
  }

  if (req.method === "GET" && url.pathname === "/api/requests") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const includeAll = url.searchParams.get("all") === "true";
    const requests = includeAll
      ? db.prepare("SELECT * FROM requests WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100").all(workspaceId)
      : db.prepare("SELECT * FROM requests WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 100").all(workspaceId, groupId);
    return json(res, 200, { requests });
  }

  if (req.method === "POST" && url.pathname === "/api/requests") {
    const body = await readJson(req);
    const { workspaceId, userId, groupId } = requestWorkspace(req, body);
    const title = String(body.title || "").trim();
    if (!title) return json(res, 400, { error: "Request title is required" });
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO requests (workspace_id, group_id, requester_id, owner_id, title, request_type, status, priority, summary, due_at, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      groupId,
      userId,
      body.ownerId || body.owner_id || null,
      title,
      body.requestType || body.request_type || "general",
      body.status || "open",
      body.priority || "normal",
      body.summary || null,
      body.dueAt || body.due_at || null,
      JSON.stringify(body.metadata || {}),
      timestamp,
      timestamp
    );
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "request.created",
      actorType: "user",
      actorId: userId,
      payload: { request_id: Number(result.lastInsertRowid), title }
    });
    return json(res, 201, { request: db.prepare("SELECT * FROM requests WHERE id = ?").get(Number(result.lastInsertRowid)) });
  }

  if (req.method === "GET" && url.pathname === "/api/markdown-sync") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const views = db.prepare(`
      SELECT * FROM markdown_views
      WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL)
      ORDER BY view_type
    `).all(workspaceId, groupId);
    return json(res, 200, { views });
  }

  if (req.method === "POST" && url.pathname === "/api/markdown-sync") {
    const body = await readJson(req);
    const { workspaceId, groupId } = requestWorkspace(req, body);
    const projectId = body.projectId || body.project_id || null;
    if (projectId) {
      const project = db.prepare("SELECT * FROM projects WHERE workspace_id = ? AND id = ?").get(workspaceId, projectId);
      if (!project) return json(res, 404, { error: "Project not found" });
      const result = syncProjectMarkdownFiles(workspaceId, projectId);
      createWorkspaceEvent({
        workspaceId,
        groupId: project.group_id || groupId,
        projectId,
        type: "MARKDOWN_SYNCED",
        actorType: "system",
        actorId: "markdown-sync",
        payload: result
      });
      return json(res, 200, result);
    }
    const result = syncWorkspaceMarkdownViews(workspaceId, groupId);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "MARKDOWN_SYNCED",
      actorType: "system",
      actorId: "markdown-sync",
      payload: result
    });
    return json(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJson(req);
    const result = await handleWorkspaceChat(req, body);
    return json(res, result.status, result.body);
  }

  if (req.method === "GET" && url.pathname === "/api/chat") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const threadId = url.searchParams.get("threadId") || url.searchParams.get("thread_id");
    const projectId = url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const thread = threadId
      ? db.prepare("SELECT * FROM chat_threads WHERE workspace_id = ? AND id = ?").get(workspaceId, threadId)
      : projectId
        ? db.prepare("SELECT * FROM chat_threads WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 1").get(workspaceId, projectId)
      : db.prepare("SELECT * FROM chat_threads WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 1").get(workspaceId, groupId);
    if (!thread) return json(res, 200, { thread: null, messages: [] });
    const messages = db.prepare(`
      SELECT id, workspace_id, group_id, project_id, thread_id, role, content, metadata_json, created_at
      FROM chat_messages
      WHERE workspace_id = ? AND thread_id = ?
      ORDER BY created_at ASC
      LIMIT 200
    `).all(workspaceId, thread.id);
    return json(res, 200, { thread, messages });
  }

  if (req.method === "DELETE" && url.pathname === "/api/chat") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const threadId = url.searchParams.get("threadId") || url.searchParams.get("thread_id");
    if (threadId) {
      db.prepare("DELETE FROM chat_messages WHERE workspace_id = ? AND thread_id = ?").run(workspaceId, threadId);
      db.prepare("DELETE FROM chat_threads WHERE workspace_id = ? AND id = ?").run(workspaceId, threadId);
    } else {
      db.prepare("DELETE FROM chat_messages WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL)").run(workspaceId, groupId);
      db.prepare("DELETE FROM chat_threads WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL)").run(workspaceId, groupId);
    }
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "WORKFLOW_TRIGGERED",
      actorType: "user",
      actorId: DEFAULT_USER_ID,
      payload: { thread_id: threadId || null }
    });
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const { workspaceId } = requestWorkspace(req);
    const status = url.searchParams.get("status");
    const projectId = url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const events = projectId
      ? db.prepare("SELECT * FROM events WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 100").all(workspaceId, projectId)
      : status
        ? db.prepare("SELECT * FROM events WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100").all(workspaceId, status)
        : db.prepare("SELECT * FROM events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100").all(workspaceId);
    return json(res, 200, { events });
  }

  if (req.method === "POST" && url.pathname === "/api/events") {
    const body = await readJson(req);
    const { workspaceId, userId, groupId } = requestWorkspace(req, body);
    const event = createWorkspaceEvent({
      workspaceId,
      groupId,
      projectId: body.projectId || body.project_id || null,
      type: String(body.type || "custom.event"),
      actorType: body.actorType || body.actor_type || "user",
      actorId: body.actorId || body.actor_id || userId,
      payload: body.payload || {}
    });
    return json(res, 201, { event });
  }

  if (req.method === "GET" && url.pathname === "/api/events/pending") {
    const { workspaceId } = requestWorkspace(req);
    return json(res, 200, { events: getPendingWorkspaceEvents(workspaceId, Number(url.searchParams.get("limit") || 25)) });
  }

  const completeEventMatch = url.pathname.match(/^\/api\/events\/(\d+)\/complete$/);
  if (req.method === "POST" && completeEventMatch) {
    const body = await readJson(req);
    return json(res, 200, { event: completeWorkspaceEvent(Number(completeEventMatch[1]), body.result || null) });
  }

  const failEventMatch = url.pathname.match(/^\/api\/events\/(\d+)\/fail$/);
  if (req.method === "POST" && failEventMatch) {
    const body = await readJson(req);
    return json(res, 200, { event: failWorkspaceEvent(Number(failEventMatch[1]), body.error || "Event failed") });
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/run") {
    const body = await readJson(req);
    const { workspaceId } = requestWorkspace(req, body);
    const results = runPendingWorkspaceEvents(workspaceId, body.limit || 10);
    return json(res, 200, { results });
  }

  if (req.method === "GET" && url.pathname === "/api/memory") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const memories = includeArchived
      ? db.prepare("SELECT * FROM memories WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 100").all(workspaceId, groupId)
      : db.prepare("SELECT * FROM memories WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) AND status = 'active' ORDER BY updated_at DESC LIMIT 100").all(workspaceId, groupId);
    return json(res, 200, { memories });
  }

  if (req.method === "POST" && url.pathname === "/api/memory") {
    const body = await readJson(req);
    const { workspaceId, userId, groupId } = requestWorkspace(req, body);
    const content = String(body.content || "").trim();
    if (!content) return json(res, 400, { error: "Memory content is required" });
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO memories (workspace_id, group_id, user_id, memory_type, content, status, source, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(workspaceId, groupId, userId, body.memoryType || body.memory_type || "note", content, body.source || "manual", JSON.stringify(body.metadata || {}), timestamp, timestamp);
    const memory = db.prepare("SELECT * FROM memories WHERE id = ?").get(Number(result.lastInsertRowid));
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "MEMORY_UPDATED",
      actorType: "user",
      actorId: userId,
      payload: { memory_id: memory.id }
    });
    return json(res, 201, { memory });
  }

  const memoryMatch = url.pathname.match(/^\/api\/memory\/(\d+)$/);
  if (memoryMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const { workspaceId, groupId, userId } = requestWorkspace(req, body);
    const memoryId = Number(memoryMatch[1]);
    const existing = db.prepare(`
      SELECT * FROM memories
      WHERE id = ? AND workspace_id = ? AND (group_id = ? OR group_id IS NULL)
    `).get(memoryId, workspaceId, groupId);
    if (!existing) return json(res, 404, { error: "Memory not found" });
    const content = body.content === undefined ? existing.content : String(body.content || "").trim();
    if (!content) return json(res, 400, { error: "Memory content is required" });
    const allowedStatus = ["active", "archived"].includes(body.status) ? body.status : existing.status || "active";
    const memoryType = body.memoryType || body.memory_type || existing.memory_type || "note";
    const source = body.source === undefined ? existing.source : String(body.source || "manual");
    const metadata = body.metadata === undefined ? existing.metadata_json : JSON.stringify(body.metadata || {});
    const timestamp = now();
    db.prepare(`
      UPDATE memories
      SET memory_type = ?, content = ?, status = ?, source = ?, metadata_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(memoryType, content, allowedStatus, source, metadata, timestamp, memoryId, workspaceId);
    const memory = db.prepare("SELECT * FROM memories WHERE id = ? AND workspace_id = ?").get(memoryId, workspaceId);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "MEMORY_UPDATED",
      actorType: "user",
      actorId: userId,
      payload: { memory_id: memoryId, action: "updated" }
    });
    return json(res, 200, { memory });
  }

  if (memoryMatch && req.method === "DELETE") {
    const { workspaceId, groupId, userId } = requestWorkspace(req);
    const memoryId = Number(memoryMatch[1]);
    const existing = db.prepare(`
      SELECT * FROM memories
      WHERE id = ? AND workspace_id = ? AND (group_id = ? OR group_id IS NULL)
    `).get(memoryId, workspaceId, groupId);
    if (!existing) return json(res, 404, { error: "Memory not found" });
    db.prepare("DELETE FROM memories WHERE id = ? AND workspace_id = ?").run(memoryId, workspaceId);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "MEMORY_UPDATED",
      actorType: "user",
      actorId: userId,
      payload: { memory_id: memoryId, action: "deleted" }
    });
    return json(res, 200, { deleted: true, memoryId });
  }

  if (req.method === "GET" && url.pathname === "/api/files") {
    const { workspaceId, groupId, userId } = requestWorkspace(req);
    if (!userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.documents.read" }) || !userCanAccessGroup({ workspaceId, userId, groupId })) {
      return forbidden(res, "You do not have permission to read files.");
    }
    const projectId = url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const documents = projectId
      ? db.prepare("SELECT * FROM documents WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 100").all(workspaceId, projectId)
      : db.prepare("SELECT * FROM documents WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC LIMIT 100").all(workspaceId, groupId);
    return json(res, 200, { documents });
  }

  if (req.method === "GET" && url.pathname === "/api/file-sources") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const projectId = url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const fileSources = projectId
      ? db.prepare("SELECT * FROM file_sources WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC").all(workspaceId, projectId)
      : db.prepare("SELECT * FROM file_sources WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL) ORDER BY updated_at DESC").all(workspaceId, groupId);
    return json(res, 200, { appMode: APP_MODE, fileSources });
  }

  if (req.method === "POST" && url.pathname === "/api/file-sources") {
    const body = await readJson(req);
    const { workspaceId, groupId } = requestWorkspace(req, body);
    const projectId = body.projectId || body.project_id || null;
    if (projectId && !db.prepare("SELECT id FROM projects WHERE workspace_id = ? AND id = ?").get(workspaceId, projectId)) {
      return json(res, 404, { error: "Project not found" });
    }
    if (APP_MODE !== "local" && (body.sourceType || body.source_type || "local") === "local") {
      return json(res, 400, { error: "Local file sources are only available in APP_MODE=local" });
    }
    const path = String(body.path || "").trim();
    if (!path) return json(res, 400, { error: "File source path is required" });
    const sourceType = body.sourceType || body.source_type || "local";
    const existing = db.prepare(`
      SELECT * FROM file_sources
      WHERE workspace_id = ? AND source_type = ? AND path = ? AND COALESCE(project_id, '') = COALESCE(?, '') AND (group_id = ? OR group_id IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(workspaceId, sourceType, path, projectId, groupId);
    if (existing) return json(res, 200, { fileSource: existing, existing: true });
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO file_sources (workspace_id, group_id, project_id, label, source_type, path, enabled, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      groupId,
      projectId,
      String(body.label || path.split("/").pop() || "File source"),
      sourceType,
      path,
      body.enabled === false ? 0 : 1,
      JSON.stringify(body.metadata || {}),
      timestamp,
      timestamp
    );
    return json(res, 201, { fileSource: db.prepare("SELECT * FROM file_sources WHERE id = ?").get(Number(result.lastInsertRowid)) });
  }

  const fileSourceMatch = url.pathname.match(/^\/api\/file-sources\/(\d+)$/);
  if (fileSourceMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const { workspaceId, groupId } = requestWorkspace(req, body);
    const sourceId = Number(fileSourceMatch[1]);
    const existing = db.prepare(`
      SELECT * FROM file_sources
      WHERE id = ? AND workspace_id = ? AND (group_id = ? OR group_id IS NULL)
    `).get(sourceId, workspaceId, groupId);
    if (!existing) return json(res, 404, { error: "File source not found" });
    const timestamp = now();
    const nextLabel = body.label === undefined ? existing.label : String(body.label || existing.label);
    const nextEnabled = body.enabled === undefined ? existing.enabled : body.enabled ? 1 : 0;
    const nextMetadata = body.metadata === undefined ? existing.metadata_json : JSON.stringify(body.metadata || {});
    db.prepare(`
      UPDATE file_sources
      SET label = ?, enabled = ?, metadata_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(nextLabel, nextEnabled, nextMetadata, timestamp, sourceId, workspaceId);
    return json(res, 200, {
      fileSource: db.prepare("SELECT * FROM file_sources WHERE id = ? AND workspace_id = ?").get(sourceId, workspaceId)
    });
  }

  if (fileSourceMatch && req.method === "DELETE") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const sourceId = Number(fileSourceMatch[1]);
    const existing = db.prepare(`
      SELECT * FROM file_sources
      WHERE id = ? AND workspace_id = ? AND (group_id = ? OR group_id IS NULL)
    `).get(sourceId, workspaceId, groupId);
    if (!existing) return json(res, 404, { error: "File source not found" });
    const documents = db.prepare("SELECT id FROM documents WHERE workspace_id = ? AND file_source_id = ?").all(workspaceId, sourceId);
    for (const document of documents) {
      db.prepare("DELETE FROM chunk_embeddings WHERE workspace_id = ? AND document_id = ?").run(workspaceId, document.id);
      db.prepare("DELETE FROM document_chunks WHERE workspace_id = ? AND document_id = ?").run(workspaceId, document.id);
    }
    db.prepare("DELETE FROM documents WHERE workspace_id = ? AND file_source_id = ?").run(workspaceId, sourceId);
    db.prepare("DELETE FROM file_sources WHERE id = ? AND workspace_id = ?").run(sourceId, workspaceId);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "FILE_UPLOADED",
      actorType: "system",
      actorId: "fileSources",
      payload: { action: "deleted", file_source_id: sourceId }
    });
    return json(res, 200, { deleted: true, fileSourceId: sourceId, removedDocuments: documents.length });
  }

  if (req.method === "POST" && url.pathname === "/api/index-files") {
    const body = await readJson(req);
    const { workspaceId, groupId } = requestWorkspace(req, body);
    const projectId = body.projectId || body.project_id || null;
    const result = indexApprovedFileSources(workspaceId, groupId, projectId);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      projectId,
      type: "FILE_UPLOADED",
      actorType: "agent",
      actorId: "fileIndexer",
      payload: result
    });
    return json(res, 200, result);
  }

  if (req.method === "GET" && url.pathname === "/api/connectors") {
    const { workspaceId, groupId } = requestWorkspace(req);
    const connectors = db.prepare("SELECT * FROM connectors WHERE workspace_id = ? ORDER BY provider").all(workspaceId);
    return json(res, 200, { connectors, statuses: buildConnectorStatus(workspaceId, groupId) });
  }

  if (req.method === "GET" && url.pathname === "/api/connectors/status") {
    const { workspaceId, groupId } = requestWorkspace(req);
    return json(res, 200, { statuses: buildConnectorStatus(workspaceId, groupId) });
  }

  if (req.method === "POST" && url.pathname === "/api/connectors") {
    const body = await readJson(req);
    const { workspaceId, groupId } = requestWorkspace(req, body);
    const provider = String(body.provider || "").trim();
    if (!["local_files", "github", "google_drive", "slack"].includes(provider)) {
      return json(res, 400, { error: "Unsupported connector provider" });
    }
    const timestamp = now();
    db.prepare(`
      INSERT INTO connectors (workspace_id, group_id, provider, enabled, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, provider)
      DO UPDATE SET group_id = excluded.group_id, enabled = excluded.enabled, config_json = excluded.config_json, updated_at = excluded.updated_at
    `).run(workspaceId, groupId, provider, body.enabled === false ? 0 : 1, JSON.stringify(body.config || {}), timestamp, timestamp);
    const connector = db.prepare("SELECT * FROM connectors WHERE workspace_id = ? AND provider = ?").get(workspaceId, provider);
    return json(res, 200, { connector, statuses: buildConnectorStatus(workspaceId, groupId) });
  }

  if (req.method === "POST" && url.pathname === "/api/connectors/sync") {
    const body = await readJson(req);
    const { workspaceId, groupId } = requestWorkspace(req, body);
    const provider = String(body.provider || "local_files");
    const connector = db.prepare("SELECT * FROM connectors WHERE workspace_id = ? AND provider = ? AND enabled = 1").get(workspaceId, provider);
    if (!connector) return json(res, 404, { error: "Enabled connector not found" });
    const startedAt = now();
    const projectId = body.projectId || body.project_id || null;
    const message = provider === "local_files"
      ? JSON.stringify(indexApprovedFileSources(workspaceId, groupId, projectId))
      : `${provider} sync placeholder. OAuth is not implemented yet.`;
    const result = db.prepare(`
      INSERT INTO connector_syncs (workspace_id, group_id, connector_id, status, message, started_at, finished_at, metadata_json)
      VALUES (?, ?, ?, 'completed', ?, ?, ?, ?)
    `).run(workspaceId, groupId, connector.id, message, startedAt, now(), JSON.stringify({ provider, project_id: projectId }));
    const sync = db.prepare("SELECT * FROM connector_syncs WHERE id = ?").get(Number(result.lastInsertRowid));
    createWorkspaceEvent({
      workspaceId,
      groupId,
      type: "CONNECTOR_SYNCED",
      actorType: "connector",
      actorId: provider,
      payload: { connector_id: connector.id, sync_id: sync.id, provider, project_id: projectId }
    });
    return json(res, 200, { sync, statuses: buildConnectorStatus(workspaceId, groupId) });
  }

  if (req.method === "GET" && url.pathname === "/api/agent") {
    const { workspaceId, groupId, userId } = requestWorkspace(req);
    if (!userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.chat.use" }) || !userCanAccessGroup({ workspaceId, userId, groupId })) {
      return forbidden(res, "You do not have permission to view agent activity.");
    }
    const threadId = url.searchParams.get("threadId") || url.searchParams.get("thread_id");
    const projectId = url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const limit = Math.min(Number(url.searchParams.get("limit") || 25), 100);
    const outputs = threadId
      ? db.prepare(`
        SELECT * FROM agent_outputs
        WHERE workspace_id = ? AND thread_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(workspaceId, threadId, limit)
      : projectId
        ? db.prepare(`
          SELECT * FROM agent_outputs
          WHERE workspace_id = ? AND project_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(workspaceId, projectId, limit)
      : db.prepare(`
        SELECT * FROM agent_outputs
        WHERE workspace_id = ? AND (group_id = ? OR group_id IS NULL)
        ORDER BY created_at DESC
        LIMIT ?
      `).all(workspaceId, groupId, limit);
    return json(res, 200, { outputs });
  }

  if (req.method === "POST" && url.pathname === "/api/agent") {
    const body = await readJson(req);
    const { workspaceId, groupId } = requestWorkspace(req, body);
    const projectId = body.projectId || body.project_id || null;
    const plan = plannerAgent(String(body.message || ""));
    const output = saveAgentOutput({
      workspaceId,
      groupId,
      projectId,
      agentName: "planner",
      outputType: "plan_preview",
      content: `Selected agents: ${plan.agents.join(", ")}`,
      metadata: { plan, preview: true }
    });
    return json(res, 200, { plan, output });
  }

  if (req.method === "GET" && url.pathname === "/api/jobs") {
    const jobs = db.prepare(`
      SELECT jobs.*, people.name AS requester_name
      FROM jobs
      LEFT JOIN people ON people.id = jobs.requester_id
      ORDER BY jobs.updated_at DESC
    `).all();
    return json(res, 200, { jobs });
  }

  if (req.method === "GET" && url.pathname === "/api/assistant/messages") {
    const messages = db.prepare("SELECT * FROM assistant_messages ORDER BY created_at ASC LIMIT 200").all();
    return json(res, 200, { messages });
  }

  if (req.method === "DELETE" && url.pathname === "/api/assistant/messages") {
    db.prepare("DELETE FROM assistant_messages").run();
    writeFileSync(JIMMY_CHAT_LOG, `# Jimmy Chat Log

This file is generated by the local Work Wiki app. It records the global Jimmy chat so conversations remain readable outside SQLite.

`);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/assistant/chat") {
    const body = await readJson(req);
    const result = await handleJimmyChat(String(body.message || ""), body.activeJobId || null);
    return json(res, result.status, result.body);
  }

  if (req.method === "GET" && url.pathname === "/api/source-documents") {
    return json(res, 200, {
      folder: "docs/source-knowledge",
      documents: listSourceDocuments()
    });
  }

  if (req.method === "POST" && url.pathname === "/api/source-documents/sync") {
    const documents = syncSourceDocuments();
    return json(res, 200, { documents });
  }

  if (req.method === "POST" && url.pathname === "/api/source-documents") {
    const body = await readJson(req);
    const { workspaceId, userId, groupId } = requestWorkspace(req, body);
    const projectId = body.projectId || body.project_id || null;
    if (projectId && !db.prepare("SELECT id FROM projects WHERE workspace_id = ? AND id = ?").get(workspaceId, projectId)) {
      return json(res, 404, { error: "Project not found" });
    }
    const fileName = safeSourceFileName(body.fileName);
    const sourceType = String(body.sourceType || "reference").trim() || "reference";
    const encoding = body.encoding === "base64" ? "base64" : "utf8";
    const content = String(body.content || "");
    if (!content) return json(res, 400, { error: "File content is required" });
    const document = createSourceKnowledgeFromUpload({ workspaceId, groupId, projectId, fileName, content, sourceType, encoding });
    const markdown = safeSyncProjectMarkdownFiles(workspaceId, projectId);
    createWorkspaceEvent({
      workspaceId,
      groupId,
      projectId,
      type: "FILE_UPLOADED",
      actorType: "user",
      actorId: userId,
      payload: { source_document_id: document.id, file_name: document.file_name, project_id: projectId }
    });
    return json(res, 201, { document, markdown });
  }

  const sourceDocMatch = url.pathname.match(/^\/api\/source-documents\/(\d+)$/);
  if (req.method === "GET" && sourceDocMatch) {
    const document = getSourceDocument(Number(sourceDocMatch[1]));
    if (!document) return json(res, 404, { error: "Source document not found" });
    return json(res, 200, { document });
  }

  if (req.method === "GET" && url.pathname === "/api/wiki") {
    return json(res, 200, { docs: listWikiDocs() });
  }

  if (req.method === "POST" && url.pathname === "/api/wiki") {
    const body = await readJson(req);
    try {
      const doc = writeWikiDoc({ title: body.title, content: body.content });
      return json(res, 201, { doc });
    } catch (error) {
      return json(res, 400, { error: error.message || "Could not create wiki" });
    }
  }

  const wikiDocMatch = url.pathname.match(/^\/api\/wiki\/([^/]+)$/);
  if (req.method === "GET" && wikiDocMatch) {
    const doc = readWikiDoc(decodeURIComponent(wikiDocMatch[1]));
    if (!doc) return json(res, 404, { error: "Wiki page not found" });
    return json(res, 200, { doc });
  }

  if (req.method === "PUT" && wikiDocMatch) {
    const body = await readJson(req);
    const existing = readWikiDoc(decodeURIComponent(wikiDocMatch[1]));
    if (!existing) return json(res, 404, { error: "Wiki page not found" });
    try {
      const doc = writeWikiDoc({
        id: existing.id,
        title: body.title || existing.title,
        content: body.content
      });
      return json(res, 200, { doc });
    } catch (error) {
      return json(res, 400, { error: error.message || "Could not update wiki" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/jobs") {
    const body = await readJson(req);
    return json(res, 201, { job: createJob(body) });
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/(\d+)$/);
  if (req.method === "GET" && jobMatch) {
    const job = getJob(Number(jobMatch[1]));
    if (!job) return json(res, 404, { error: "Job not found" });
    const files = listWikiFiles(job.id);
    const tasks = db.prepare("SELECT * FROM tasks WHERE job_id = ? ORDER BY created_at DESC").all(job.id);
    const reminders = db.prepare("SELECT * FROM reminders WHERE job_id = ? ORDER BY due_at ASC").all(job.id);
    const messages = db.prepare("SELECT * FROM chat_messages WHERE job_id = ? ORDER BY created_at ASC").all(job.id);
    return json(res, 200, { job, files, tasks, reminders, messages });
  }

  const fileMatch = url.pathname.match(/^\/api\/jobs\/(\d+)\/files\/([^/]+)$/);
  if (req.method === "GET" && fileMatch) {
    const file = db.prepare("SELECT * FROM wiki_files WHERE job_id = ? AND file_name = ?").get(Number(fileMatch[1]), decodeURIComponent(fileMatch[2]));
    if (!file) return json(res, 404, { error: "File not found" });
    return json(res, 200, { file, content: readFileSync(file.file_path, "utf8") });
  }

  if (req.method === "PUT" && fileMatch) {
    const body = await readJson(req);
    const file = db.prepare("SELECT * FROM wiki_files WHERE job_id = ? AND file_name = ?").get(Number(fileMatch[1]), decodeURIComponent(fileMatch[2]));
    if (!file) return json(res, 404, { error: "File not found" });
    const content = String(body.content || "");
    writeFileSync(file.file_path, content);
    db.prepare("UPDATE wiki_files SET content_hash = ?, updated_at = ? WHERE id = ?")
      .run(hashContent(content), now(), file.id);
    db.prepare("UPDATE jobs SET updated_at = ? WHERE id = ?").run(now(), Number(fileMatch[1]));
    return json(res, 200, { ok: true });
  }

  const chatMatch = url.pathname.match(/^\/api\/jobs\/(\d+)\/chat$/);
  if (req.method === "POST" && chatMatch) {
    const body = await readJson(req);
    const result = await handleAiChat(Number(chatMatch[1]), String(body.message || ""));
    return json(res, result.status, result.body);
  }

  if (req.method === "GET" && url.pathname === "/api/reminders") {
    const reminders = db.prepare(`
      SELECT reminders.*, jobs.title AS job_title
      FROM reminders
      LEFT JOIN jobs ON jobs.id = reminders.job_id
      WHERE reminders.status != 'done'
      ORDER BY reminders.due_at ASC
    `).all();
    return json(res, 200, { reminders });
  }

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    const { workspaceId, groupId, userId } = requestWorkspace(req);
    if (!userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.tasks.manage" }) || !userCanAccessGroup({ workspaceId, userId, groupId })) {
      return forbidden(res, "You do not have permission to view tasks.");
    }
    const projectId = url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const tasks = projectId
      ? db.prepare(`
        SELECT tasks.*, jobs.title AS job_title
        FROM tasks
        LEFT JOIN jobs ON jobs.id = tasks.job_id
        WHERE (tasks.workspace_id = ? OR tasks.workspace_id IS NULL)
          AND tasks.project_id = ?
        ORDER BY tasks.status = 'done' ASC, COALESCE(tasks.due_at, tasks.updated_at) ASC
      `).all(workspaceId, projectId)
      : db.prepare(`
        SELECT tasks.*, jobs.title AS job_title
        FROM tasks
        LEFT JOIN jobs ON jobs.id = tasks.job_id
        WHERE (tasks.workspace_id = ? OR tasks.workspace_id IS NULL)
          AND (tasks.group_id = ? OR tasks.group_id IS NULL)
        ORDER BY tasks.status = 'done' ASC, COALESCE(tasks.due_at, tasks.updated_at) ASC
      `).all(workspaceId, groupId);
    return json(res, 200, { tasks });
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJson(req);
    const { workspaceId, userId, groupId } = requestWorkspace(req, body);
    const projectId = body.projectId || body.project_id || null;
    if (!userHasPermission({ workspaceId, userId, groupId, permissionId: "perm.tasks.manage" }) || !userCanAccessGroup({ workspaceId, userId, groupId })) {
      return forbidden(res, "You do not have permission to create tasks.");
    }
    const title = String(body.title || "").trim();
    if (!title) return json(res, 400, { error: "Task title is required" });
    const dueAt = body.dueAt ? new Date(body.dueAt).toISOString() : null;
    const task = createWorkspaceTask({
      workspaceId,
      groupId,
      projectId,
      userId,
      title,
      dueAt,
      priority: body.priority || "normal",
      source: "manual",
      metadata: { created_from: "api.tasks" }
    });
    createWorkspaceEvent({
      workspaceId,
      groupId,
      projectId,
      type: "TASK_CREATED",
      actorType: "user",
      actorId: userId,
      payload: { task_id: task.id, title: task.title, project_id: projectId }
    });
    return json(res, 201, { task, markdown: safeSyncProjectMarkdownFiles(workspaceId, projectId) });
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (req.method === "PATCH" && taskMatch) {
    const body = await readJson(req);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(taskMatch[1]));
    if (!existing) return json(res, 404, { error: "Task not found" });
    const status = body.status ? (body.status === "done" ? "done" : "todo") : existing.status;
    const title = body.title !== undefined ? String(body.title || "").trim() : existing.title;
    if (!title) return json(res, 400, { error: "Task title is required" });
    const dueAt = body.dueAt !== undefined
      ? (body.dueAt ? new Date(body.dueAt).toISOString() : null)
      : existing.due_at;
    const priority = body.priority || existing.priority || "normal";
    db.prepare("UPDATE tasks SET title = ?, status = ?, priority = ?, due_at = ?, updated_at = ? WHERE id = ?")
      .run(title, status, priority, dueAt, now(), Number(taskMatch[1]));
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(taskMatch[1]));
    if (!task) return json(res, 404, { error: "Task not found" });
    return json(res, 200, { task, markdown: safeSyncProjectMarkdownFiles(task.workspace_id || DEFAULT_WORKSPACE_ID, task.project_id || null) });
  }

  if (req.method === "DELETE" && taskMatch) {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(taskMatch[1]));
    db.prepare("DELETE FROM tasks WHERE id = ?").run(Number(taskMatch[1]));
    return json(res, 200, {
      ok: true,
      markdown: safeSyncProjectMarkdownFiles(existing?.workspace_id || DEFAULT_WORKSPACE_ID, existing?.project_id || null)
    });
  }

  if (req.method === "GET" && url.pathname === "/api/daily-brief") {
    const { workspaceId } = requestWorkspace(req);
    const dashboard = buildDashboardPayload(workspaceId);
    createWorkspaceEvent({
      workspaceId,
      groupId: DEFAULT_GROUP_ID,
      type: "WORKFLOW_TRIGGERED",
      actorType: "agent",
      actorId: "dailyBrief",
      payload: { daily_brief_date: dashboard.dailyBrief.date, paths: dashboard.dailyBrief.paths }
    });
    return json(res, 200, { dailyBrief: dashboard.dailyBrief });
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    const { workspaceId } = requestWorkspace(req);
    return json(res, 200, buildDashboardPayload(workspaceId));
    const nowIso = now();
    const reminders = db.prepare(`
      SELECT reminders.*, jobs.title AS job_title
      FROM reminders
      LEFT JOIN jobs ON jobs.id = reminders.job_id
      WHERE reminders.status != 'done'
      ORDER BY reminders.due_at ASC
      LIMIT 20
    `).all();
    const weeklyTasks = db.prepare(`
      SELECT tasks.*, jobs.title AS job_title
      FROM tasks
      LEFT JOIN jobs ON jobs.id = tasks.job_id
      WHERE tasks.status != 'done'
      ORDER BY COALESCE(tasks.due_at, tasks.updated_at) ASC
      LIMIT 20
    `).all();
    const pickup = db.prepare(`
      SELECT jobs.id, jobs.title, jobs.status, jobs.priority, jobs.summary, jobs.next_action, jobs.updated_at, people.name AS requester_name
      FROM jobs
      LEFT JOIN people ON people.id = jobs.requester_id
      WHERE jobs.status != 'done' AND jobs.status != 'archived'
      ORDER BY jobs.updated_at DESC
      LIMIT 5
    `).all();
    const recentActivity = db.prepare(`
      SELECT 'chat' AS type, content AS title, created_at, NULL AS job_title
      FROM assistant_messages
      UNION ALL
      SELECT workflow_events.event_type AS type, COALESCE(jobs.title, workflow_events.event_type) AS title, workflow_events.created_at, jobs.title AS job_title
      FROM workflow_events
      LEFT JOIN jobs ON jobs.id = workflow_events.job_id
      ORDER BY created_at DESC
      LIMIT 12
    `).all();
    const sourceKnowledge = listWikiDocs()
      .filter(doc => doc.id.startsWith("source-knowledge/") || doc.id.startsWith("reference-items/"))
      .slice(0, 6)
      .map(doc => ({
        title: doc.title,
        meta: doc.path
      }));
    const waitingItems = [
      ...weeklyTasks.filter(task => /\b(waiting|follow up|follow-up|pending|approval|response)\b/i.test(`${task.title} ${task.job_title || ""}`)),
      ...pickup.filter(job => /\b(waiting|follow up|follow-up|pending|approval|response)\b/i.test(`${job.title} ${job.summary || ""} ${job.next_action || ""}`))
    ].slice(0, 6).map(item => ({
      title: item.title,
      meta: item.job_title || item.next_action || item.summary || "Waiting on outside input"
    }));
    const safetyWatch = [
      ...weeklyTasks.filter(task => /\b(inspection|incident|corrective|training|osha|safety|audit|hazard|toolbox)\b/i.test(`${task.title} ${task.job_title || ""}`)),
      ...reminders.filter(reminder => /\b(inspection|incident|corrective|training|osha|safety|audit|hazard|toolbox)\b/i.test(`${reminder.title} ${reminder.job_title || ""}`))
    ].slice(0, 6).map(item => ({
      title: item.title,
      meta: `${item.due_at ? formatIsoForDashboard(item.due_at) : "No date"}${item.job_title ? ` · ${item.job_title}` : ""}`
    }));
    const draftResponses = recentActivity
      .filter(item => /\b(draft|reply|email|response|outlook)\b/i.test(item.title || ""))
      .slice(0, 5)
      .map(item => ({
        title: String(item.title || "Draft response").slice(0, 120),
        meta: `${item.type} · ${formatIsoForDashboard(item.created_at)}`
      }));
    return json(res, 200, {
      now: nowIso,
      reminders,
      weeklyTasks,
      pickup,
      recentActivity,
      sourceKnowledge,
      waitingItems,
      safetyWatch,
      draftResponses,
      calendarItems: []
    });
  }

  if (req.method === "GET" && url.pathname === "/api/weather/raleigh") {
    try {
      return json(res, 200, { weather: await getRaleighWeather() });
    } catch (error) {
      return json(res, 200, {
        weather: {
          location: "Raleigh, NC",
          temperature: null,
          unit: "F",
          status: "Weather unavailable"
        }
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/locations") {
    const query = (url.searchParams.get("q") || "").trim();
    if (!query) return json(res, 400, { error: "Search query is required" });
    try {
      return json(res, 200, { locations: await searchLocations(query) });
    } catch (error) {
      return json(res, 200, { locations: [] });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/weather") {
    const latitude = Number(url.searchParams.get("latitude"));
    const longitude = Number(url.searchParams.get("longitude"));
    const location = url.searchParams.get("location") || "Selected city";
    const timezone = url.searchParams.get("timezone") || "auto";
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json(res, 400, { error: "Latitude and longitude are required" });
    }
    try {
      return json(res, 200, {
        weather: await getWeatherForLocation({ name: location, latitude, longitude, timezone })
      });
    } catch (error) {
      return json(res, 200, {
        weather: {
          location,
          temperature: null,
          unit: "F",
          status: "Weather unavailable"
        }
      });
    }
  }

  return json(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(PUBLIC_DIR, `.${requested}`);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const contentType = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json"
  }[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  res.end(readFileSync(filePath));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, getRuntimeConfigStatus());
    }
    if (req.method === "GET" && url.pathname === "/auth/outlook/start") {
      const outlookAuthUrl = buildOutlookAuthUrl(req);
      if (!outlookAuthUrl) {
        html(res, 200, renderOutlookSetupPage(req));
        return;
      }
      redirect(res, outlookAuthUrl);
      return;
    }
    if (req.method === "GET" && url.pathname === "/auth/outlook/callback") {
      html(res, 200, renderOutlookCallbackPage(url));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message });
  }
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Another copy of JB's Kitchen is probably running at http://localhost:${PORT}.`);
    console.error(`Stop it with: lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Work Wiki Assistant running at http://localhost:${PORT}`);
  console.log(`Data folder: ${DATA_DIR}`);
});
