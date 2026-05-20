const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

async function request(path, options = {}) {
  const { expectedStatus, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "content-type": "application/json", ...(fetchOptions.headers || {}) },
    ...fetchOptions
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (expectedStatus && response.status === expectedStatus) return data;
  if (!response.ok) {
    throw new Error(`${fetchOptions.method || "GET"} ${path} failed: ${response.status} ${data.error || text}`);
  }
  return data;
}

const checks = [
  async () => {
    const data = await request("/api/config");
    if (!["local", "hybrid", "cloud"].includes(data.appMode)) {
      throw new Error("Expected valid config app mode");
    }
    if (data.database?.provider !== "sqlite") {
      throw new Error("Expected SQLite local database config");
    }
    if (data.llm?.provider !== "openai" || typeof data.llm.configured !== "boolean") {
      throw new Error("Expected OpenAI LLM config status");
    }
    if (data.retrieval?.mode !== "hybrid-keyword-local-vector") {
      throw new Error("Expected hybrid retrieval config");
    }
    return "runtime config";
  },
  async () => {
    const data = await request("/api/workspaces");
    if (!Array.isArray(data.workspaces) || !data.workspaces.length) {
      throw new Error("Expected at least one workspace");
    }
    if (!["local", "hybrid", "cloud"].includes(data.appMode)) {
      throw new Error("Expected valid EOS app mode");
    }
    return "workspace bootstrap";
  },
  async () => {
    const data = await request("/api/connectors");
    const providers = data.connectors.map((connector) => connector.provider);
    for (const provider of ["local_files", "github", "google_drive", "slack"]) {
      if (!providers.includes(provider)) throw new Error(`Missing connector ${provider}`);
    }
    if (!Array.isArray(data.statuses) || !data.statuses.some((status) => status.provider === "local_files" && status.implemented && status.status === "ready")) {
      throw new Error("Expected ready local files connector status");
    }
    const statusData = await request("/api/connectors/status");
    const github = statusData.statuses.find((status) => status.provider === "github");
    if (!github?.placeholder || github.implemented) {
      throw new Error("Expected GitHub connector to be a placeholder status");
    }
    return "connector placeholders";
  },
  async () => {
    const data = await request("/api/groups");
    const slugs = data.groups.map((group) => group.slug);
    for (const slug of ["operations", "safety", "projects", "documents", "leadership"]) {
      if (!slugs.includes(slug)) throw new Error(`Missing default group ${slug}`);
    }
    return "organization groups";
  },
  async () => {
    const marker = `Smoke Project ${Date.now()}`;
    const created = await request("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        groupId: "group-projects",
        name: marker,
        summary: "Smoke test project workspace."
      })
    });
    if (!created.project?.id || created.project.group_id !== "group-projects") {
      throw new Error("Expected project workspace to be created in Projects group");
    }
    const chat = await request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        groupId: "group-projects",
        projectId: created.project.id,
        message: `Create task ${marker} follow-up tomorrow`
      })
    });
    if (chat.thread?.project_id !== created.project.id || chat.task?.project_id !== created.project.id) {
      throw new Error("Expected chat thread and task to be linked to the project");
    }
    if (!chat.markdown?.synced?.some((item) => item.viewType === "PROJECT-TASKS")) {
      throw new Error("Expected project chat to auto-sync project markdown");
    }
    const detail = await request(`/api/projects/${encodeURIComponent(created.project.id)}`);
    if (!detail.tasks.some((task) => task.id === chat.task.id) || !detail.threads.some((thread) => thread.id === chat.thread.id)) {
      throw new Error("Expected project detail to include linked tasks and threads");
    }
    const sync = await request("/api/markdown-sync", {
      method: "POST",
      body: JSON.stringify({ projectId: created.project.id })
    });
    const viewTypes = sync.synced.map((item) => item.viewType);
    for (const viewType of ["PROJECT-OVERVIEW", "PROJECT-TASKS", "PROJECT-DECISIONS", "PROJECT-CONTEXT-LOG", "PROJECT-SOURCES"]) {
      if (!viewTypes.includes(viewType)) throw new Error(`Missing project markdown view ${viewType}`);
    }
    const syncedDetail = await request(`/api/projects/${encodeURIComponent(created.project.id)}`);
    if (!syncedDetail.markdownFiles.some((file) => file.project_id === created.project.id && file.title === "PROJECT-TASKS")) {
      throw new Error("Expected project markdown files to be stored in the database");
    }
    const manualTask = await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        groupId: "group-projects",
        projectId: created.project.id,
        title: `${marker} manual task`
      })
    });
    if (!manualTask.markdown?.synced?.some((item) => item.viewType === "PROJECT-TASKS")) {
      throw new Error("Expected manual project task to auto-sync project markdown");
    }
    const workspaceSummary = await request("/api/workspace-summary", {
      headers: { "x-group-id": "group-projects" }
    });
    if (!workspaceSummary.counts || !Array.isArray(workspaceSummary.projects)) {
      throw new Error("Expected workspace summary counts and projects");
    }
    const projectSummary = await request(`/api/projects/${encodeURIComponent(created.project.id)}/summary`, {
      headers: { "x-group-id": "group-projects" }
    });
    if (projectSummary.project?.id !== created.project.id || !projectSummary.counts || !Array.isArray(projectSummary.openTasks)) {
      throw new Error("Expected project summary with counts and open tasks");
    }
    return "project workspaces";
  },
  async () => {
    const data = await request("/api/roles");
    const slugs = data.roles.map((role) => role.slug);
    for (const slug of ["boss-admin", "manager", "safety", "field-user", "viewer"]) {
      if (!slugs.includes(slug)) throw new Error(`Missing default role ${slug}`);
    }
    const me = await request("/api/me/permissions");
    if (!me.permissions.some((permission) => permission.id === "perm.admin.all")) {
      throw new Error("Expected default user to have admin permission");
    }
    return "roles and permissions";
  },
  async () => {
    const id = `user_smoke_${Date.now()}`;
    const user = await request("/api/users", {
      method: "POST",
      body: JSON.stringify({
        id,
        name: "Smoke Test Field User",
        email: `${id}@example.com`,
        groupId: "group-safety",
        roleId: "role-field-user"
      })
    });
    if (user.user?.status !== "active") throw new Error("Expected created user to be active");
    const status = await request(`/api/users/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "retired", notes: "Smoke test retirement" })
    });
    if (status.user?.status !== "retired") throw new Error("Expected user to be retired");
    return "user lifecycle";
  },
  async () => {
    const id = `user_restricted_${Date.now()}`;
    await request("/api/users", {
      method: "POST",
      body: JSON.stringify({
        id,
        name: "Smoke Restricted Viewer",
        email: `${id}@example.com`,
        groupId: "group-safety",
        roleId: "role-viewer"
      })
    });
    const denied = await request("/api/projects", {
      expectedStatus: 403,
      headers: {
        "x-user-id": id,
        "x-group-id": "group-projects"
      }
    });
    if (!denied.error) throw new Error("Expected permission denial message");
    return "permission-aware access";
  },
  async () => {
    const data = await request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "remember smoke tests prefer concise answers" })
    });
    if (!data.content || !data.plan?.agents?.includes("memory")) {
      throw new Error("Expected chat content and memory agent plan");
    }
    if (!Array.isArray(data.agentOutputs) || !data.agentOutputs.some((output) => output.agent_name === "planner")) {
      throw new Error("Expected chat to return agent activity outputs");
    }
    return "chat workflow";
  },
  async () => {
    const data = await request("/api/agent");
    const names = data.outputs.map((output) => output.agent_name);
    for (const name of ["planner", "researcher", "writer"]) {
      if (!names.includes(name)) throw new Error(`Expected recent ${name} agent output`);
    }
    return "agent activity records";
  },
  async () => {
    const marker = `Smoke chat task ${Date.now()}`;
    const data = await request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: `Create task ${marker} tomorrow high priority` })
    });
    if (!data.task?.id || data.task.priority !== "high" || !data.task.due_at) {
      throw new Error("Expected chat task automation to create a high-priority due task");
    }
    const tasks = await request("/api/tasks");
    if (!tasks.tasks.some((task) => task.id === data.task.id && task.title.includes(marker))) {
      throw new Error("Expected automated task to appear in task list");
    }
    return "chat task automation";
  },
  async () => {
    const data = await request("/api/requests", {
      method: "POST",
      body: JSON.stringify({
        groupId: "group-safety",
        title: "Smoke discrepancy follow-up",
        requestType: "discrepancy",
        summary: "Verify group-scoped operational requests can be created."
      })
    });
    if (data.request?.group_id !== "group-safety") {
      throw new Error("Expected request to be scoped to the Safety group");
    }
    return "group-scoped requests";
  },
  async () => {
    const event = await request("/api/events", {
      method: "POST",
      body: JSON.stringify({
        type: "TASK_CREATED",
        groupId: "group-operations",
        payload: { title: "Smoke workflow task", priority: "high", dueAt: "2026-06-01T09:00:00.000Z" }
      })
    });
    if (!event.event?.id) throw new Error("Expected event id");
    const workflow = await request("/api/workflow/run", {
      method: "POST",
      body: JSON.stringify({ limit: 100 })
    });
    if (!workflow.results.some((result) => result.event_id === event.event.id && result.status === "completed")) {
      throw new Error("Expected workflow runner to complete created event");
    }
    const created = workflow.results.find((result) => result.event_id === event.event.id)?.result?.task;
    if (!created?.id || created.priority !== "high" || !created.due_at) {
      throw new Error("Expected workflow task automation to preserve priority and due date");
    }
    return "event workflow runner";
  },
  async () => {
    const data = await request("/api/memory");
    if (!data.memories.some((memory) => memory.content.includes("smoke tests prefer concise answers"))) {
      throw new Error("Expected memory created by chat workflow");
    }
    return "memory persistence";
  },
  async () => {
    const marker = `memory controls smoke ${Date.now()}`;
    const created = await request("/api/memory", {
      method: "POST",
      body: JSON.stringify({ content: marker, memoryType: "note", source: "smoke" })
    });
    if (!created.memory?.id) throw new Error("Expected created memory id");
    const updated = await request(`/api/memory/${created.memory.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content: `${marker} updated`, memoryType: "decision", source: "smoke" })
    });
    if (updated.memory?.memory_type !== "decision" || !updated.memory.content.includes("updated")) {
      throw new Error("Expected memory update");
    }
    const archived = await request(`/api/memory/${created.memory.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content: updated.memory.content, memoryType: "decision", source: "smoke", status: "archived" })
    });
    if (archived.memory?.status !== "archived") throw new Error("Expected memory archive");
    const deleted = await request(`/api/memory/${created.memory.id}`, { method: "DELETE" });
    if (!deleted.deleted) throw new Error("Expected memory delete");
    return "memory controls";
  },
  async () => {
    const data = await request("/api/file-sources");
    if (!Array.isArray(data.fileSources)) throw new Error("Expected fileSources array");
    return "file source guard";
  },
  async () => {
    const marker = `markdown filing smoke ${Date.now()}`;
    const upload = await request("/api/source-documents", {
      method: "POST",
      body: JSON.stringify({
        fileName: "markdown-filing-smoke.md",
        sourceType: "reference",
        content: `# Markdown Filing Smoke\n\n${marker}`
      })
    });
    if (!upload.document?.markdown_path) throw new Error("Expected source upload to create a markdown path");
    const files = await request("/api/files");
    const indexed = files.documents.some((document) => {
      const metadata = JSON.parse(document.metadata_json || "{}");
      return metadata.source_document_id === upload.document.id
        && document.source_path.includes("docs/source-knowledge/")
        && metadata.original_content_hash
        && Number(metadata.extracted_characters) > 0;
    });
    if (!indexed) throw new Error("Expected source upload markdown to be indexed with extraction metadata");
    return "markdown source filing";
  },
  async () => {
    const marker = `project source smoke ${Date.now()}`;
    const project = await request("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        groupId: "group-projects",
        name: marker,
        summary: "Project-aware source ingestion smoke test."
      })
    });
    const upload = await request("/api/source-documents", {
      method: "POST",
      body: JSON.stringify({
        groupId: "group-projects",
        projectId: project.project.id,
        fileName: "project-source-smoke.md",
        sourceType: "reference",
        content: `# Project Source Smoke\n\n${marker}`
      })
    });
    if (!upload.markdown?.synced?.some((item) => item.viewType === "PROJECT-SOURCES")) {
      throw new Error("Expected project source upload to auto-sync project source markdown");
    }
    const files = await request(`/api/files?projectId=${encodeURIComponent(project.project.id)}`, {
      headers: { "x-group-id": "group-projects" }
    });
    const indexed = files.documents.some((document) => {
      const metadata = JSON.parse(document.metadata_json || "{}");
      return document.project_id === project.project.id
        && metadata.source_document_id === upload.document.id
        && metadata.project_id === project.project.id;
    });
    if (!indexed) throw new Error("Expected uploaded source to be indexed inside the project");
    const chat = await request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        groupId: "group-projects",
        projectId: project.project.id,
        message: `What does the project source say about ${marker}?`
      })
    });
    if (!chat.citations.some((citation) => citation.project_id === project.project.id && citation.label && citation.source_path)) {
      throw new Error("Expected project chat retrieval to return labeled project-scoped citations");
    }
    return "project source ingestion";
  },
  async () => {
    const sync = await request("/api/markdown-sync", { method: "POST", body: JSON.stringify({ groupId: "group-operations" }) });
    const viewTypes = sync.synced.map((item) => item.viewType);
    for (const viewType of ["ABOUT-ME", "MY-AI-STYLE", "PROJECTS", "TASKS", "DECISIONS", "WORKFLOWS", "LESSONS-LEARNED", "CONTEXT-LOG"]) {
      if (!viewTypes.includes(viewType)) throw new Error(`Missing markdown view ${viewType}`);
    }
    return "markdown operational views";
  }
];

for (const check of checks) {
  const label = await check();
  console.log(`ok - ${label}`);
}
