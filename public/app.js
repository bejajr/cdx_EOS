const state = {
  jobs: [],
  activeJobId: null,
  activeFileName: null,
  activeFileContent: "",
  jimmyMessages: [],
  activity: {
    plan: null,
    citations: [],
    connectorContext: [],
    agentOutputs: [],
    events: [],
    tasks: []
  },
  reminders: [],
  dashboardLastLoadedDate: null,
  workspaceSummary: null,
  editingTaskId: null,
  activeWikiId: null,
  userName: "Jake",
  userAvatar: "default",
  userLocation: {
    name: "Raleigh, NC",
    latitude: 35.7796,
    longitude: -78.6382,
    timezone: "America/New_York"
  }
};

let citySearchTimer = null;
let citySearchRequestId = 0;

const jimmyCommandCatalog = [
  {
    command: "/product-brief",
    label: "Product brief",
    description: "Auto-save a draft product brief.",
    keywords: ["product", "brief", "boss", "present", "presentation", "spec", "summary"]
  },
  {
    command: "/toolbox-talk",
    label: "Toolbox talk",
    description: "Auto-save a draft toolbox talk.",
    keywords: ["toolbox", "talk", "training", "meeting", "crew", "safety topic"]
  },
  {
    command: "/inspection-report",
    label: "Inspection report",
    description: "Auto-save a draft inspection report.",
    keywords: ["inspection", "report", "walkthrough", "audit", "jobsite", "finding"]
  },
  {
    command: "/incident-summary",
    label: "Incident summary",
    description: "Auto-save a draft incident summary.",
    keywords: ["incident", "accident", "injury", "near miss", "corrective action"]
  },
  {
    command: "/osha-reference",
    label: "OSHA reference",
    description: "Auto-save a draft OSHA reference page.",
    keywords: ["osha", "regulation", "standard", "requirement", "compliance", "reference"]
  },
  {
    command: "/create-pdf",
    label: "Export PDF",
    description: "Export a reviewed markdown document as a PDF.",
    keywords: ["pdf", "export", "send", "print", "report", "brief"]
  },
  {
    command: "/create-excel",
    label: "Export Excel",
    description: "Export tables, checklists, trackers, or logs as Excel.",
    keywords: ["excel", "xlsx", "spreadsheet", "checklist", "tracker", "matrix", "log"]
  },
  {
    command: "/create-word",
    label: "Export Word",
    description: "Export formal docs, policies, procedures, or briefs as Word.",
    keywords: ["word", "docx", "policy", "procedure", "formal", "document"]
  },
  {
    command: "/create-powerpoint",
    label: "Export PowerPoint",
    description: "Export briefings, training, or toolbox talks as slides.",
    keywords: ["powerpoint", "pptx", "slides", "presentation", "training", "briefing"]
  },
  {
    command: "/create-email-draft",
    label: "Email draft",
    description: "Create an Outlook-ready email draft for approval.",
    keywords: ["email", "outlook", "draft", "reply", "send", "follow up"]
  },
  {
    command: "/export-csv",
    label: "Export CSV",
    description: "Export simple logs, lists, or table data as CSV.",
    keywords: ["csv", "data", "table", "log", "list", "export"]
  },
  {
    command: "/export-html",
    label: "Export HTML",
    description: "Export a web-viewable or printable HTML document.",
    keywords: ["html", "web", "printable", "page", "export"]
  },
  {
    command: "/export-json",
    label: "Export JSON",
    description: "Export structured data for integrations or automations.",
    keywords: ["json", "structured", "data", "integration", "automation"]
  },
  {
    command: "/create-calendar-file",
    label: "Calendar file",
    description: "Create an ICS calendar file for inspections or reminders.",
    keywords: ["ics", "calendar", "schedule", "inspection", "training", "reminder"]
  },
  {
    command: "/export-package",
    label: "Export package",
    description: "Bundle documents, references, and attachments into a ZIP package.",
    keywords: ["zip", "package", "bundle", "attachments", "export"]
  },
  {
    command: "/create-qr-sheet",
    label: "QR code sheet",
    description: "Create a QR code sheet for links to forms, talks, or references.",
    keywords: ["qr", "code", "sheet", "link", "crew", "form"]
  },
  {
    command: "/dashboard-snapshot",
    label: "Dashboard snapshot",
    description: "Export a daily or weekly dashboard summary.",
    keywords: ["dashboard", "snapshot", "summary", "daily", "weekly", "status"]
  },
  {
    command: "/wiki-from-doc",
    label: "Page from source",
    description: "Draft from source knowledge pages.",
    keywords: ["wiki", "document", "documentation", "source", "upload", "reference"]
  },
  {
    command: "/create-wiki",
    label: "Create page",
    description: "Auto-save pasted notes as a knowledge page.",
    keywords: ["create wiki", "make wiki", "save notes", "documentation", "markdown"]
  },
  {
    command: "/sources",
    label: "Sources",
    description: "List source knowledge pages.",
    keywords: ["sources", "uploaded", "documents", "references", "files"]
  },
  {
    command: "/wiki",
    label: "Knowledge search",
    description: "List pages or search knowledge references.",
    keywords: ["wiki", "knowledge", "reference", "docs", "search"]
  },
  {
    command: "/reminders",
    label: "Reminders",
    description: "List pending reminders.",
    keywords: ["reminder", "follow up", "due", "deadline"]
  },
  {
    command: "/jobs",
    label: "Jobs",
    description: "List current jobs.",
    keywords: ["jobs", "requests", "work", "open"]
  },
  {
    command: "/help",
    label: "Help",
    description: "Show available commands.",
    keywords: ["help", "commands", "what can you do"]
  },
  {
    command: "/explain",
    label: "Explain process",
    description: "Explain how something works in simple steps.",
    keywords: ["explain", "how does", "how do", "how is", "process", "walkthrough", "what happens"]
  }
];

const els = {
  appShell: document.querySelector("#appShell"),
  pageTitle: document.querySelector("#pageTitle"),
  statusPill: document.querySelector("#statusPill"),
  jobList: document.querySelector("#jobList"),
  reminderList: document.querySelector("#reminderList"),
  jimmyView: document.querySelector("#jimmyView"),
  dashboardView: document.querySelector("#dashboardView"),
  tasksView: document.querySelector("#tasksView"),
  wikiView: document.querySelector("#wikiView"),
  intakeView: document.querySelector("#intakeView"),
  jobView: document.querySelector("#jobView"),
  chatTab: document.querySelector("#chatTab"),
  dashboardTab: document.querySelector("#dashboardTab"),
  wikiTab: document.querySelector("#wikiTab"),
  dashboardSideButton: document.querySelector("#dashboardSideButton"),
  wikiSideButton: document.querySelector("#wikiSideButton"),
  contextMode: document.querySelector("#contextMode"),
  contextWorkspaceName: document.querySelector("#contextWorkspaceName"),
  contextScopeText: document.querySelector("#contextScopeText"),
  contextAccessText: document.querySelector("#contextAccessText"),
  contextCountsText: document.querySelector("#contextCountsText"),
  dashboardDate: document.querySelector("#dashboardDate"),
  dashboardGreeting: document.querySelector("#dashboardGreeting"),
  dashboardFocusText: document.querySelector("#dashboardFocusText"),
  todayCount: document.querySelector("#todayCount"),
  overdueCount: document.querySelector("#overdueCount"),
  waitingCount: document.querySelector("#waitingCount"),
  draftCount: document.querySelector("#draftCount"),
  knowledgeCount: document.querySelector("#knowledgeCount"),
  weatherLocation: document.querySelector("#weatherLocation"),
  weatherTemp: document.querySelector("#weatherTemp"),
  weatherStatus: document.querySelector("#weatherStatus"),
  dashboardPriorityCount: document.querySelector("#dashboardPriorityCount"),
  waitingPanelCount: document.querySelector("#waitingPanelCount"),
  safetyWatchCount: document.querySelector("#safetyWatchCount"),
  dashboardPriorityList: document.querySelector("#dashboardPriorityList"),
  dashboardFollowupList: document.querySelector("#dashboardFollowupList"),
  dashboardKnowledgeList: document.querySelector("#dashboardKnowledgeList"),
  pickupList: document.querySelector("#pickupList"),
  jimmyHomeButton: document.querySelector("#jimmyHomeButton"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  tasksButton: document.querySelector("#tasksButton"),
  addTaskButton: document.querySelector("#addTaskButton"),
  taskModal: document.querySelector("#taskModal"),
  taskModalTitle: document.querySelector("#taskModalTitle"),
  taskModalSubmitButton: document.querySelector("#taskModalSubmitButton"),
  addTaskForm: document.querySelector("#addTaskForm"),
  newTaskTitle: document.querySelector("#newTaskTitle"),
  newTaskDueAt: document.querySelector("#newTaskDueAt"),
  cancelAddTaskButton: document.querySelector("#cancelAddTaskButton"),
  secondaryCancelAddTaskButton: document.querySelector("#secondaryCancelAddTaskButton"),
  todoToggle: document.querySelector("#todoToggle"),
  completedToggle: document.querySelector("#completedToggle"),
  todoTasks: document.querySelector("#todoTasks"),
  completedTasks: document.querySelector("#completedTasks"),
  todoCount: document.querySelector("#todoCount"),
  completedCount: document.querySelector("#completedCount"),
  refreshWikiButton: document.querySelector("#refreshWikiButton"),
  newWikiButton: document.querySelector("#newWikiButton"),
  wikiList: document.querySelector("#wikiList"),
  wikiTitleInput: document.querySelector("#wikiTitleInput"),
  wikiEditor: document.querySelector("#wikiEditor"),
  saveWikiButton: document.querySelector("#saveWikiButton"),
  wikiSaveStatus: document.querySelector("#wikiSaveStatus"),
  cancelIntakeButton: document.querySelector("#cancelIntakeButton"),
  intakeForm: document.querySelector("#intakeForm"),
  fileList: document.querySelector("#fileList"),
  taskList: document.querySelector("#taskList"),
  jobReminderList: document.querySelector("#jobReminderList"),
  activeFileName: document.querySelector("#activeFileName"),
  markdownEditor: document.querySelector("#markdownEditor"),
  saveFileButton: document.querySelector("#saveFileButton"),
  askJimmyButton: document.querySelector("#askJimmyButton"),
  jimmyMessages: document.querySelector("#jimmyMessages"),
  activityPanel: document.querySelector("#activityPanel"),
  jimmyForm: document.querySelector("#jimmyForm"),
  jimmyInput: document.querySelector("#jimmyInput"),
  commandSuggestions: document.querySelector("#commandSuggestions"),
  importDocButton: document.querySelector("#importDocButton"),
  sourceFileInput: document.querySelector("#sourceFileInput"),
  clearJimmyButton: document.querySelector("#clearJimmyButton"),
  welcomePanel: document.querySelector("#welcomePanel"),
  profileButton: document.querySelector("#profileButton"),
  settingsPopover: document.querySelector("#settingsPopover"),
  settingsPopoverTitle: document.querySelector("#settingsPopoverTitle"),
  profilePopoverHeader: document.querySelector("#profilePopoverHeader"),
  closeSettingsPopover: document.querySelector("#closeSettingsPopover"),
  settingsPageButton: document.querySelector("#settingsPageButton"),
  settingsPage: document.querySelector("#settingsPage"),
  closeSettingsPage: document.querySelector("#closeSettingsPage"),
  userNameInput: document.querySelector("#userNameInput"),
  saveUserNameButton: document.querySelector("#saveUserNameButton"),
  nameSaveStatus: document.querySelector("#nameSaveStatus"),
  avatarSettingsButton: document.querySelector("#avatarSettingsButton"),
  avatarModal: document.querySelector("#avatarModal"),
  closeAvatarModal: document.querySelector("#closeAvatarModal"),
  timezoneSelect: document.querySelector("#timezoneSelect"),
  citySearchInput: document.querySelector("#citySearchInput"),
  citySearchButton: document.querySelector("#citySearchButton"),
  selectedCityLabel: document.querySelector("#selectedCityLabel"),
  citySearchResults: document.querySelector("#citySearchResults"),
  personalSettingsPanel: document.querySelector("#personalSettingsPanel"),
  integrationsSettingsPanel: document.querySelector("#integrationsSettingsPanel"),
  sourcesSettingsPanel: document.querySelector("#sourcesSettingsPanel"),
  memorySettingsPanel: document.querySelector("#memorySettingsPanel"),
  placeholderSettingsPanel: document.querySelector("#placeholderSettingsPanel"),
  placeholderSettingsTitle: document.querySelector("#placeholderSettingsTitle"),
  sourceLabelInput: document.querySelector("#sourceLabelInput"),
  sourcePathInput: document.querySelector("#sourcePathInput"),
  addSourceButton: document.querySelector("#addSourceButton"),
  indexSourcesButton: document.querySelector("#indexSourcesButton"),
  sourceSettingsStatus: document.querySelector("#sourceSettingsStatus"),
  approvedSourceList: document.querySelector("#approvedSourceList"),
  indexedDocumentList: document.querySelector("#indexedDocumentList"),
  memoryTypeInput: document.querySelector("#memoryTypeInput"),
  memoryContentInput: document.querySelector("#memoryContentInput"),
  addMemoryButton: document.querySelector("#addMemoryButton"),
  memorySettingsStatus: document.querySelector("#memorySettingsStatus"),
  memoryList: document.querySelector("#memoryList")
};

function setStatus(text) {
  if (els.statusPill) els.statusPill.textContent = text;
}

function renderWorkspaceContext(summary = state.workspaceSummary) {
  if (!els.contextWorkspaceName) return;
  if (!summary?.workspace) {
    els.contextMode.textContent = "Workspace";
    els.contextWorkspaceName.textContent = "EOS Workspace";
    els.contextScopeText.textContent = "Context loading";
    els.contextAccessText.textContent = "EOS can access approved sources in this scope.";
    els.contextCountsText.textContent = "Loading context...";
    return;
  }
  const workspace = summary.workspace;
  const workspaceType = workspace.workspace_type === "organization" ? "Organization" : "Personal";
  const activeGroup = (summary.groups || []).find(group => group.id === "group-operations") || (summary.groups || [])[0];
  const permissions = summary.permissions || {};
  const counts = summary.counts || {};
  els.contextMode.textContent = workspaceType;
  els.contextWorkspaceName.textContent = workspace.name || "EOS Workspace";
  els.contextScopeText.textContent = `${activeGroup?.name || "Private"} · ${workspaceType === "Personal" ? "Private" : "Team"}`;
  els.contextAccessText.textContent = permissions.canReadDocuments
    ? "EOS can access approved sources in this scope."
    : "EOS is limited by your current permissions.";
  els.contextCountsText.textContent = `${counts.projects || 0} projects · ${counts.openTasks || 0} open tasks · ${counts.recentDocuments || 0} sources`;
}

async function loadWorkspaceContext() {
  renderWorkspaceContext();
  try {
    state.workspaceSummary = await api("/api/workspace-summary");
    renderWorkspaceContext(state.workspaceSummary);
  } catch (error) {
    if (!els.contextWorkspaceName) return;
    els.contextWorkspaceName.textContent = "EOS Workspace";
    els.contextScopeText.textContent = "Context unavailable";
    els.contextAccessText.textContent = error.message || "Workspace context could not be loaded.";
    els.contextCountsText.textContent = "";
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showView(name) {
  for (const view of [els.jimmyView, els.dashboardView, els.tasksView, els.wikiView, els.intakeView, els.jobView]) {
    view.classList.add("hidden");
  }
  els[`${name}View`].classList.remove("hidden");
  updateTabs(name);
}

function openSettingsPopover(mode) {
  els.settingsPopoverTitle.textContent = mode === "profile" ? "Profile" : "Settings";
  els.profilePopoverHeader.classList.toggle("hidden", mode !== "profile");
  els.settingsPopover.classList.remove("hidden");
}

function closeSettingsPopover() {
  els.settingsPopover.classList.add("hidden");
}

function setUserName(name) {
  const cleanName = name.trim() || "Jake";
  state.userName = cleanName;
  localStorage.setItem("jbk-user-name", cleanName);
  for (const target of document.querySelectorAll("[data-user-name]")) {
    target.textContent = cleanName;
  }
  for (const target of document.querySelectorAll("[data-user-initial]")) {
    target.textContent = cleanName.slice(0, 1).toUpperCase();
  }
  for (const target of document.querySelectorAll("[data-avatar-sample]")) {
    target.textContent = cleanName.slice(0, 1).toUpperCase();
  }
  if (els.userNameInput.value !== cleanName) {
    els.userNameInput.value = cleanName;
  }
  els.pageTitle.textContent = "What’s on your mind today?";
  if (!els.dashboardView.classList.contains("hidden")) {
    renderDashboardDate();
  }
}

function openAvatarModal() {
  els.avatarModal.classList.remove("hidden");
}

function closeAvatarModal() {
  els.avatarModal.classList.add("hidden");
}

function setUserAvatar(avatarName) {
  const nextAvatar = avatarName || "default";
  state.userAvatar = nextAvatar;
  localStorage.setItem("jbk-user-avatar", nextAvatar);
  for (const target of document.querySelectorAll("[data-user-avatar]")) {
    target.classList.remove("avatar-default", "avatar-ember", "avatar-forest", "avatar-ocean", "avatar-plum", "avatar-slate");
    target.classList.add(`avatar-${nextAvatar}`);
  }
  for (const option of document.querySelectorAll("[data-avatar-option]")) {
    option.classList.toggle("active", option.dataset.avatarOption === nextAvatar);
  }
}

function saveUserName() {
  setUserName(els.userNameInput.value);
  els.nameSaveStatus.textContent = "Saved";
  setTimeout(() => {
    els.nameSaveStatus.textContent = "";
  }, 1400);
}

function setUserLocation(location) {
  state.userLocation = location;
  localStorage.setItem("jbk-user-location", JSON.stringify(location));
  els.selectedCityLabel.textContent = location.name;
  els.weatherLocation.textContent = location.name;
  setTimezoneDisplay(location.timezone || "auto");
  els.citySearchInput.value = "";
  els.citySearchResults.innerHTML = "";
  els.pageTitle.textContent = "What’s on your mind today?";
  renderDashboardDate();
  if (!els.dashboardView.classList.contains("hidden")) {
    loadDashboardWeather();
  }
}

function setTimezoneDisplay(timezone) {
  const label = timezone && timezone !== "auto" ? timezone : "Auto";
  const optionText = timezone && timezone !== "auto" ? `Auto-detect (${timezone})` : "Auto-detect";
  els.timezoneSelect.innerHTML = "";
  for (const value of [optionText, label]) {
    const option = document.createElement("option");
    option.textContent = value;
    option.value = value;
    els.timezoneSelect.append(option);
  }
  els.timezoneSelect.value = optionText;
}

function loadSavedLocation() {
  try {
    return JSON.parse(localStorage.getItem("jbk-user-location")) || state.userLocation;
  } catch (error) {
    return state.userLocation;
  }
}

async function searchCities() {
  const query = els.citySearchInput.value.trim();
  const requestId = ++citySearchRequestId;
  if (query.length < 2) {
    els.citySearchResults.innerHTML = "";
    return;
  }
  els.citySearchResults.innerHTML = `<span class="city-search-status">Searching...</span>`;
  try {
    const data = await api(`/api/locations?q=${encodeURIComponent(query)}`);
    if (requestId !== citySearchRequestId) return;
    renderCityResults(data.locations || []);
  } catch (error) {
    if (requestId !== citySearchRequestId) return;
    els.citySearchResults.innerHTML = `<span class="city-search-status">City search unavailable.</span>`;
  }
}

function queueCitySearch() {
  clearTimeout(citySearchTimer);
  const query = els.citySearchInput.value.trim();
  if (query.length < 2) {
    citySearchRequestId += 1;
    els.citySearchResults.innerHTML = "";
    return;
  }
  citySearchTimer = setTimeout(searchCities, 300);
}

function renderCityResults(locations) {
  els.citySearchResults.innerHTML = "";
  if (!locations.length) {
    els.citySearchResults.innerHTML = `<span class="city-search-status">No cities found.</span>`;
    return;
  }
  for (const location of locations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "city-result-button";
    button.innerHTML = `<strong>${escapeHtml(location.name)}</strong><span>${escapeHtml(location.region || location.country || "")}</span>`;
    button.addEventListener("click", () => setUserLocation(location));
    els.citySearchResults.append(button);
  }
}

function openSettingsPage(section = "personal") {
  closeSettingsPopover();
  els.settingsPage.classList.remove("hidden");
  activateSettingsSection(section);
}

function closeSettingsPage() {
  els.settingsPage.classList.add("hidden");
}

function activateSettingsSection(section) {
  for (const item of document.querySelectorAll(".settings-nav-item")) {
    item.classList.toggle("active", item.dataset.settingsSection === section);
  }
  const isPersonal = section === "personal";
  const isIntegrations = section === "integrations";
  const isSources = section === "sources";
  const isMemory = section === "memory";
  els.personalSettingsPanel.classList.toggle("hidden", !isPersonal);
  els.integrationsSettingsPanel.classList.toggle("hidden", !isIntegrations);
  els.sourcesSettingsPanel.classList.toggle("hidden", !isSources);
  els.memorySettingsPanel.classList.toggle("hidden", !isMemory);
  els.placeholderSettingsPanel.classList.toggle("hidden", isPersonal || isIntegrations || isSources || isMemory);
  if (isSources) {
    loadSourceSettings();
  }
  if (isMemory) {
    loadMemorySettings();
  }
  if (!isPersonal && !isIntegrations && !isSources && !isMemory) {
    const label = document.querySelector(`[data-settings-section="${section}"]`)?.textContent.trim() || "Settings";
    els.placeholderSettingsTitle.textContent = label.replace("On", "").trim();
  }
}

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-theme", nextTheme === "light");
  for (const button of document.querySelectorAll("[data-theme]")) {
    button.classList.toggle("active", button.dataset.theme === nextTheme);
  }
  localStorage.setItem("jbk-theme", nextTheme);
}

function handleDashboardAction(action) {
  if (action === "chat") {
    showJimmyHome();
    els.jimmyInput.focus();
    return;
  }
  if (action === "tasks") {
    openTasksPage();
    return;
  }
  if (action === "wiki") {
    openWikiTab();
  }
}

function connectIntegration(provider) {
  if (provider === "outlook") {
    window.location.href = "/auth/outlook/start";
    return;
  }
  if (provider === "folders") {
    openSettingsPage("sources");
    return;
  }
  setStatus(`${provider.replaceAll("-", " ")} connector coming soon`);
}

async function loadSourceSettings() {
  if (!els.approvedSourceList || !els.indexedDocumentList) return;
  els.approvedSourceList.innerHTML = `<div class="source-empty">Loading sources...</div>`;
  els.indexedDocumentList.innerHTML = `<div class="source-empty">Loading documents...</div>`;
  try {
    const [sourcesData, filesData] = await Promise.all([
      api("/api/file-sources"),
      api("/api/files")
    ]);
    renderApprovedSources(sourcesData.fileSources || []);
    renderIndexedDocuments(filesData.documents || []);
    if (els.sourceSettingsStatus) {
      els.sourceSettingsStatus.textContent = sourcesData.appMode === "local" ? "" : "Local folders require local mode.";
    }
  } catch (error) {
    els.approvedSourceList.innerHTML = `<div class="source-empty">Sources unavailable.</div>`;
    els.indexedDocumentList.innerHTML = `<div class="source-empty">Documents unavailable.</div>`;
    if (els.sourceSettingsStatus) els.sourceSettingsStatus.textContent = error.message;
  }
}

function renderApprovedSources(fileSources) {
  els.approvedSourceList.innerHTML = "";
  if (!fileSources.length) {
    els.approvedSourceList.innerHTML = `<div class="source-empty">No approved sources yet.</div>`;
    return;
  }
  for (const source of fileSources) {
    const row = document.createElement("div");
    row.className = "source-row";
    row.dataset.sourceId = source.id;
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(source.label || "File source")}</strong>
        <small>${escapeHtml(formatSourceMeta(source))}</small>
        <code>${escapeHtml(source.path || "")}</code>
      </span>
      <span class="source-row-actions">
        <button type="button" data-source-action="toggle">${source.enabled ? "Disable" : "Enable"}</button>
        <button type="button" data-source-action="delete">Delete</button>
      </span>
    `;
    row.querySelector('[data-source-action="toggle"]').addEventListener("click", () => toggleApprovedSource(source));
    row.querySelector('[data-source-action="delete"]').addEventListener("click", () => deleteApprovedSource(source));
    els.approvedSourceList.append(row);
  }
}

function formatSourceMeta(source) {
  const parts = [
    source.source_type || "local",
    source.enabled ? "enabled" : "disabled"
  ];
  if (source.last_indexed_at) {
    parts.push(`indexed ${formatDate(source.last_indexed_at)}`);
  } else {
    parts.push("not indexed");
  }
  if (Number.isFinite(Number(source.last_indexed_document_count))) {
    parts.push(`${Number(source.last_indexed_document_count)} docs`);
  }
  if (source.last_index_error) {
    parts.push(`error: ${source.last_index_error}`);
  }
  return parts.join(" · ");
}

function renderIndexedDocuments(documents) {
  els.indexedDocumentList.innerHTML = "";
  if (!documents.length) {
    els.indexedDocumentList.innerHTML = `<div class="source-empty">No indexed documents yet.</div>`;
    return;
  }
  for (const documentItem of documents.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "source-row";
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(documentItem.title || "Document")}</strong>
        <small>${escapeHtml(documentItem.source_type || "source")} · ${formatDate(documentItem.updated_at || documentItem.created_at)}</small>
        <code>${escapeHtml(documentItem.source_path || documentItem.path || "")}</code>
      </span>
    `;
    els.indexedDocumentList.append(row);
  }
}

async function toggleApprovedSource(source) {
  const nextEnabled = !source.enabled;
  setStatus(nextEnabled ? "Enabling source" : "Disabling source");
  els.sourceSettingsStatus.textContent = nextEnabled ? "Enabling source..." : "Disabling source...";
  try {
    await api(`/api/file-sources/${encodeURIComponent(source.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: nextEnabled })
    });
    els.sourceSettingsStatus.textContent = nextEnabled ? "Source enabled" : "Source disabled";
    await loadSourceSettings();
    setStatus("Ready");
  } catch (error) {
    els.sourceSettingsStatus.textContent = error.message;
    setStatus("Source error");
  }
}

async function deleteApprovedSource(source) {
  const label = source.label || source.path || "this source";
  if (!confirm(`Delete ${label}? Indexed chunks from this source will be removed.`)) return;
  setStatus("Deleting source");
  els.sourceSettingsStatus.textContent = "Deleting source...";
  try {
    const result = await api(`/api/file-sources/${encodeURIComponent(source.id)}`, {
      method: "DELETE"
    });
    els.sourceSettingsStatus.textContent = `Source deleted. Removed ${result.removedDocuments || 0} documents.`;
    await loadSourceSettings();
    await refreshActivityPanel();
    setStatus("Ready");
  } catch (error) {
    els.sourceSettingsStatus.textContent = error.message;
    setStatus("Source error");
  }
}

async function addApprovedSource() {
  const path = els.sourcePathInput.value.trim();
  const label = els.sourceLabelInput.value.trim();
  if (!path) {
    els.sourceSettingsStatus.textContent = "Path is required.";
    return;
  }
  setStatus("Adding source");
  els.sourceSettingsStatus.textContent = "Adding source...";
  try {
    await api("/api/file-sources", {
      method: "POST",
      body: JSON.stringify({ label, path, sourceType: "local", enabled: true })
    });
    els.sourceLabelInput.value = "";
    els.sourcePathInput.value = "";
    els.sourceSettingsStatus.textContent = "Source added";
    await loadSourceSettings();
    setStatus("Ready");
  } catch (error) {
    els.sourceSettingsStatus.textContent = error.message;
    setStatus("Source error");
  }
}

async function indexApprovedSources() {
  setStatus("Indexing sources");
  els.sourceSettingsStatus.textContent = "Indexing approved sources...";
  try {
    const result = await api("/api/index-files", {
      method: "POST",
      body: JSON.stringify({})
    });
    const indexed = result.indexed || 0;
    const skipped = result.skipped || 0;
    els.sourceSettingsStatus.textContent = `Indexed ${indexed}. Skipped ${skipped}.`;
    await loadSourceSettings();
    await refreshActivityPanel();
    setStatus("Ready");
  } catch (error) {
    els.sourceSettingsStatus.textContent = error.message;
    setStatus("Indexing error");
  }
}

async function loadMemorySettings() {
  if (!els.memoryList) return;
  els.memoryList.innerHTML = `<div class="source-empty">Loading memories...</div>`;
  try {
    const data = await api("/api/memory");
    renderMemoryList(data.memories || []);
    if (els.memorySettingsStatus) els.memorySettingsStatus.textContent = "";
  } catch (error) {
    els.memoryList.innerHTML = `<div class="source-empty">Memory unavailable.</div>`;
    if (els.memorySettingsStatus) els.memorySettingsStatus.textContent = error.message;
  }
}

function formatMemoryMeta(memory) {
  return [
    memory.memory_type || "note",
    memory.source || "manual",
    memory.status || "active",
    formatDate(memory.updated_at || memory.created_at)
  ].filter(Boolean).join(" · ");
}

function renderMemoryList(memories) {
  els.memoryList.innerHTML = "";
  if (!memories.length) {
    els.memoryList.innerHTML = `<div class="source-empty">No saved memories yet.</div>`;
    return;
  }
  for (const memory of memories) {
    const row = document.createElement("div");
    row.className = "source-row memory-row";
    row.dataset.memoryId = memory.id;
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(memory.content)}</strong>
        <small>${escapeHtml(formatMemoryMeta(memory))}</small>
      </span>
      <span class="source-row-actions">
        <button type="button" data-memory-action="edit">Edit</button>
        <button type="button" data-memory-action="archive">Archive</button>
        <button type="button" data-memory-action="delete">Delete</button>
      </span>
    `;
    row.querySelector('[data-memory-action="edit"]').addEventListener("click", () => editMemory(memory));
    row.querySelector('[data-memory-action="archive"]').addEventListener("click", () => archiveMemory(memory));
    row.querySelector('[data-memory-action="delete"]').addEventListener("click", () => deleteMemory(memory));
    els.memoryList.append(row);
  }
}

async function addMemory() {
  const content = els.memoryContentInput.value.trim();
  const memoryType = els.memoryTypeInput.value || "note";
  if (!content) {
    els.memorySettingsStatus.textContent = "Memory content is required.";
    return;
  }
  setStatus("Adding memory");
  els.memorySettingsStatus.textContent = "Adding memory...";
  try {
    await api("/api/memory", {
      method: "POST",
      body: JSON.stringify({ content, memoryType, source: "manual" })
    });
    els.memoryContentInput.value = "";
    els.memorySettingsStatus.textContent = "Memory added";
    await loadMemorySettings();
    await refreshActivityPanel();
    setStatus("Ready");
  } catch (error) {
    els.memorySettingsStatus.textContent = error.message;
    setStatus("Memory error");
  }
}

async function editMemory(memory) {
  const nextContent = prompt("Edit memory", memory.content || "");
  if (nextContent === null) return;
  const content = nextContent.trim();
  if (!content) {
    els.memorySettingsStatus.textContent = "Memory content is required.";
    return;
  }
  setStatus("Updating memory");
  els.memorySettingsStatus.textContent = "Updating memory...";
  try {
    await api(`/api/memory/${encodeURIComponent(memory.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        content,
        memoryType: memory.memory_type || "note",
        status: "active",
        source: memory.source || "manual"
      })
    });
    els.memorySettingsStatus.textContent = "Memory updated";
    await loadMemorySettings();
    await refreshActivityPanel();
    setStatus("Ready");
  } catch (error) {
    els.memorySettingsStatus.textContent = error.message;
    setStatus("Memory error");
  }
}

async function archiveMemory(memory) {
  setStatus("Archiving memory");
  els.memorySettingsStatus.textContent = "Archiving memory...";
  try {
    await api(`/api/memory/${encodeURIComponent(memory.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        content: memory.content,
        memoryType: memory.memory_type || "note",
        status: "archived",
        source: memory.source || "manual"
      })
    });
    els.memorySettingsStatus.textContent = "Memory archived";
    await loadMemorySettings();
    await refreshActivityPanel();
    setStatus("Ready");
  } catch (error) {
    els.memorySettingsStatus.textContent = error.message;
    setStatus("Memory error");
  }
}

async function deleteMemory(memory) {
  if (!confirm("Delete this memory?")) return;
  setStatus("Deleting memory");
  els.memorySettingsStatus.textContent = "Deleting memory...";
  try {
    await api(`/api/memory/${encodeURIComponent(memory.id)}`, { method: "DELETE" });
    els.memorySettingsStatus.textContent = "Memory deleted";
    await loadMemorySettings();
    await refreshActivityPanel();
    setStatus("Ready");
  } catch (error) {
    els.memorySettingsStatus.textContent = error.message;
    setStatus("Memory error");
  }
}

function setSidebarCollapsed(collapsed) {
  els.appShell.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  els.sidebarToggle.setAttribute("aria-label", collapsed ? "Open sidebar" : "Collapse sidebar");
  els.sidebarToggle.querySelector("span").textContent = collapsed ? "›" : "‹";
  localStorage.setItem("jbk-sidebar-collapsed", collapsed ? "true" : "false");
  if (collapsed) closeSettingsPopover();
}

function toggleSidebar() {
  setSidebarCollapsed(!els.appShell.classList.contains("sidebar-collapsed"));
}

function showJimmyHome({ keepActiveJob = false } = {}) {
  if (!keepActiveJob) state.activeJobId = null;
  els.pageTitle.textContent = "What’s on your mind today?";
  renderJobs();
  showView("jimmy");
}

function updateTabs(name) {
  if (els.chatTab) els.chatTab.classList.toggle("active", name === "jimmy");
  if (els.dashboardTab) els.dashboardTab.classList.toggle("active", name === "dashboard");
  if (els.wikiTab) els.wikiTab.classList.toggle("active", name === "wiki" || name === "job");
  if (els.jimmyHomeButton) els.jimmyHomeButton.classList.toggle("active", name === "jimmy");
  if (els.dashboardSideButton) els.dashboardSideButton.classList.toggle("active", name === "dashboard");
  if (els.wikiSideButton) els.wikiSideButton.classList.toggle("active", name === "wiki" || name === "job");
}

async function openWikiPage() {
  setStatus("Loading wiki");
  showView("wiki");
  const data = await api("/api/wiki");
  renderWikiList(data.docs);
  setStatus("Ready");
}

function renderWikiList(docs) {
  els.wikiList.innerHTML = "";
  if (!docs.length) {
    els.wikiList.innerHTML = `<div class="dashboard-empty">No knowledge pages yet.</div>`;
    return;
  }
  for (const doc of docs) {
    const button = document.createElement("button");
    button.className = "wiki-list-item";
    button.dataset.wikiId = doc.id;
    button.innerHTML = `<strong>${escapeHtml(doc.title)}</strong><span>${escapeHtml(doc.path)}</span>`;
    button.addEventListener("click", () => openWikiDoc(doc.id));
    els.wikiList.append(button);
  }
}

async function openWikiDoc(id) {
  const data = await api(`/api/wiki/${encodeURIComponent(id)}`);
  state.activeWikiId = data.doc.id;
  els.wikiTitleInput.value = data.doc.title;
  els.wikiEditor.value = data.doc.content;
  for (const button of els.wikiList.querySelectorAll(".wiki-list-item")) {
    button.classList.toggle("active", button.dataset.wikiId === data.doc.id);
  }
}

function startNewWiki() {
  state.activeWikiId = null;
  els.wikiTitleInput.value = "";
  els.wikiEditor.value = "# New wiki\n\n## Summary\n\n";
  els.wikiTitleInput.focus();
  for (const button of els.wikiList.querySelectorAll(".wiki-list-item")) {
    button.classList.remove("active");
  }
}

async function saveWiki() {
  const title = els.wikiTitleInput.value.trim();
  let content = els.wikiEditor.value.trim();
  if (!title || !content) {
    els.wikiSaveStatus.textContent = "Title and content are required.";
    return;
  }
  if (!state.activeWikiId && content.match(/^#\s+New wiki\b/i)) {
    content = content.replace(/^#\s+New wiki\b/i, `# ${title}`);
  }
  setStatus("Saving knowledge");
  const path = state.activeWikiId ? `/api/wiki/${encodeURIComponent(state.activeWikiId)}` : "/api/wiki";
  const method = state.activeWikiId ? "PUT" : "POST";
  const data = await api(path, {
    method,
    body: JSON.stringify({ title, content })
  });
  state.activeWikiId = data.doc.id;
  els.wikiTitleInput.value = data.doc.title;
  els.wikiEditor.value = data.doc.content;
  els.wikiSaveStatus.textContent = "Saved";
  const docs = await api("/api/wiki");
  renderWikiList(docs.docs);
  for (const button of els.wikiList.querySelectorAll(".wiki-list-item")) {
    button.classList.toggle("active", button.dataset.wikiId === state.activeWikiId);
  }
  setStatus("Ready");
  setTimeout(() => {
    els.wikiSaveStatus.textContent = "";
  }, 1400);
}

async function openTasksPage() {
  setStatus("Loading tasks");
  showView("tasks");
  const data = await api("/api/tasks");
  renderTasksPage(data.tasks);
  setStatus("Ready");
}

function renderTasksPage(tasks) {
  const todo = tasks
    .filter(task => task.status !== "done")
    .sort(compareTasksByDueDate);
  const completed = tasks
    .filter(task => task.status === "done")
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  els.todoCount.textContent = todo.length;
  els.completedCount.textContent = completed.length;
  renderTaskList(els.todoTasks, todo, false);
  renderTaskList(els.completedTasks, completed, true);
}

function renderTaskList(target, tasks, completed) {
  target.innerHTML = "";
  if (!tasks.length) {
    target.innerHTML = `<div class="dashboard-empty">${completed ? "No completed tasks yet." : "No tasks yet."}</div>`;
    return;
  }
  for (const task of tasks) {
    const row = document.createElement("label");
    row.className = `task-row ${completed ? "completed" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${completed ? "checked" : ""} data-task-id="${task.id}">
      <span class="task-row-content">
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(formatTaskMeta(task))}</small>
      </span>
      ${completed ? "" : `
        <span class="task-row-actions">
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="delete">Delete</button>
        </span>
      `}
    `;
    row.querySelector("input").addEventListener("change", event => {
      updateTaskStatus(task.id, event.target.checked ? "done" : "todo");
    });
    const editButton = row.querySelector('[data-action="edit"]');
    const deleteButton = row.querySelector('[data-action="delete"]');
    if (editButton) {
      editButton.addEventListener("click", event => {
        event.preventDefault();
        openTaskModal(task);
      });
    }
    if (deleteButton) {
      deleteButton.addEventListener("click", event => {
        event.preventDefault();
        deleteTask(task.id);
      });
    }
    target.append(row);
  }
}

function compareTasksByDueDate(a, b) {
  if (a.due_at && b.due_at) return new Date(a.due_at) - new Date(b.due_at);
  if (a.due_at) return -1;
  if (b.due_at) return 1;
  return new Date(a.updated_at) - new Date(b.updated_at);
}

function formatTaskMeta(task) {
  const parts = [];
  if (task.due_at) parts.push(`Due ${formatDate(task.due_at)}`);
  parts.push(task.job_title || "Manual task");
  return parts.join(" · ");
}

async function updateTaskStatus(taskId, status) {
  setStatus("Updating task");
  await api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  await openTasksPage();
}

async function deleteTask(taskId) {
  setStatus("Deleting task");
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
  await openTasksPage();
}

async function addTask(event) {
  event.preventDefault();
  const title = els.newTaskTitle.value.trim();
  if (!title) return;
  const payload = { title, dueAt: els.newTaskDueAt.value || null };
  if (state.editingTaskId) {
    setStatus("Updating task");
    await api(`/api/tasks/${state.editingTaskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  } else {
    setStatus("Adding task");
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  els.newTaskTitle.value = "";
  els.newTaskDueAt.value = "";
  closeTaskModal();
  await openTasksPage();
}

function openTaskModal(task = null) {
  state.editingTaskId = task?.id || null;
  els.taskModalTitle.textContent = task ? "Edit task" : "Add task";
  els.taskModalSubmitButton.textContent = task ? "Save task" : "Add task";
  els.newTaskTitle.value = task?.title || "";
  els.newTaskDueAt.value = task?.due_at ? toDateTimeLocalValue(task.due_at) : "";
  els.taskModal.classList.remove("hidden");
  els.newTaskTitle.focus();
}

function closeTaskModal() {
  state.editingTaskId = null;
  els.taskModal.classList.add("hidden");
  els.taskModalTitle.textContent = "Add task";
  els.taskModalSubmitButton.textContent = "Add task";
  els.newTaskTitle.value = "";
  els.newTaskDueAt.value = "";
}

function toDateTimeLocalValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toggleTaskSection(button, body) {
  const collapsed = button.getAttribute("aria-expanded") === "false";
  button.setAttribute("aria-expanded", String(collapsed));
  body.classList.toggle("hidden", !collapsed);
}

function renderJobs() {
  els.jobList.innerHTML = "";
  if (!state.jobs.length) {
    els.jobList.innerHTML = `<div class="small-card">No jobs yet.</div>`;
    return;
  }
  for (const job of state.jobs) {
    const button = document.createElement("button");
    button.className = `job-button ${job.id === state.activeJobId ? "active" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(job.title)}</strong><br><span>${escapeHtml(job.status)} · ${escapeHtml(job.priority)}</span>`;
    button.addEventListener("click", () => openJob(job.id));
    els.jobList.append(button);
  }
}

function renderReminders(reminders) {
  els.reminderList.innerHTML = "";
  if (!reminders.length) {
    els.reminderList.innerHTML = `<div class="small-card">No pending reminders.</div>`;
    return;
  }
  for (const reminder of reminders) {
    const div = document.createElement("div");
    div.className = "small-card";
    div.innerHTML = `<strong>${escapeHtml(reminder.title)}</strong>${formatDate(reminder.due_at)}<br><span>${escapeHtml(reminder.job_title || "")}</span>`;
    els.reminderList.append(div);
  }
}

function renderJobDetail(detail) {
  const { job, files, tasks, reminders } = detail;
  state.activeJobId = job.id;
  els.pageTitle.textContent = job.title;

  els.fileList.innerHTML = "";
  for (const file of files) {
    const button = document.createElement("button");
    button.className = `file-button ${file.file_name === state.activeFileName ? "active" : ""}`;
    button.textContent = file.file_name;
    button.addEventListener("click", () => openFile(job.id, file.file_name));
    els.fileList.append(button);
  }

  els.taskList.innerHTML = tasks.length ? "" : `<div class="small-card">No tasks yet.</div>`;
  for (const task of tasks) {
    const div = document.createElement("div");
    div.className = "small-card";
    div.innerHTML = `<strong>${escapeHtml(task.title)}</strong>${escapeHtml(task.status)}`;
    els.taskList.append(div);
  }

  els.jobReminderList.innerHTML = reminders.length ? "" : `<div class="small-card">No reminders yet.</div>`;
  for (const reminder of reminders) {
    const div = document.createElement("div");
    div.className = "small-card";
    div.innerHTML = `<strong>${escapeHtml(reminder.title)}</strong>${formatDate(reminder.due_at)}`;
    els.jobReminderList.append(div);
  }

  renderJobs();
  showView("job");

  if (!state.activeFileName && files[0]) {
    openFile(job.id, files[0].file_name);
  }
}

function renderJimmyMessages() {
  els.jimmyMessages.innerHTML = "";
  els.welcomePanel.classList.toggle("hidden", state.jimmyMessages.length > 0);
  if (!state.jimmyMessages.length) {
    return;
  }
  for (const message of state.jimmyMessages) {
    const div = document.createElement("div");
    div.className = `message ${message.role}`;
    div.textContent = message.content;
    els.jimmyMessages.append(div);
  }
  els.jimmyMessages.scrollTop = els.jimmyMessages.scrollHeight;
}

function renderActivityPanel() {
  if (els.activityPanel) {
    els.activityPanel.classList.add("hidden");
    els.activityPanel.innerHTML = "";
  }
}

async function refreshActivityPanel(latestChatData = null) {
  if (latestChatData) {
    state.activity.plan = latestChatData.plan || null;
    state.activity.citations = latestChatData.citations || [];
    state.activity.connectorContext = latestChatData.connectorContext || [];
    state.activity.agentOutputs = latestChatData.agentOutputs || [];
  }
  try {
    const [eventsData, tasksData, agentData] = await Promise.all([
      api("/api/events"),
      api("/api/tasks"),
      api("/api/agent")
    ]);
    state.activity.events = eventsData.events || [];
    state.activity.tasks = tasksData.tasks || [];
    state.activity.agentOutputs = state.activity.agentOutputs.length ? state.activity.agentOutputs : (agentData.outputs || []);
  } catch (error) {
    state.activity.events = [];
    state.activity.tasks = [];
    state.activity.agentOutputs = state.activity.agentOutputs || [];
  }
  renderActivityPanel();
}

function commandScore(item, value) {
  const text = value.toLowerCase();
  const slashText = text.startsWith("/") ? text.slice(1) : text;
  const commandName = item.command.slice(1);
  let score = 0;
  if (item.command.startsWith(text)) score += 100;
  if (commandName.includes(slashText)) score += 60;
  if (item.label.toLowerCase().includes(slashText)) score += 45;
  for (const keyword of item.keywords) {
    if (text.includes(keyword)) score += 35;
    for (const part of slashText.split(/\s+/).filter(Boolean)) {
      if (keyword.includes(part)) score += 8;
    }
  }
  return score;
}

function getCommandSuggestions(value) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("/")) {
    return jimmyCommandCatalog
      .map(item => ({ ...item, score: commandScore(item, trimmed) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.command.localeCompare(b.command))
      .slice(0, 6);
  }
  if (trimmed.length < 8) return [];
  return jimmyCommandCatalog
    .map(item => ({ ...item, score: commandScore(item, trimmed) }))
    .filter(item => item.score >= 35)
    .sort((a, b) => b.score - a.score || a.command.localeCompare(b.command))
    .slice(0, 3);
}

function applyCommandSuggestion(command) {
  const current = els.jimmyInput.value.trim();
  const catalogItem = jimmyCommandCatalog.find(item => item.command === command);
  if (current.startsWith("/")) {
    els.jimmyInput.value = `${command} `;
  } else {
    const plainContext = current.replace(/\s+/g, " ").trim();
    els.jimmyInput.value = `${command}${plainContext ? ` ${plainContext}` : " "}`;
  }
  els.jimmyInput.focus();
  els.jimmyInput.setSelectionRange(els.jimmyInput.value.length, els.jimmyInput.value.length);
  hideCommandSuggestions();
  setStatus(catalogItem ? catalogItem.label : "Command ready");
}

function hideCommandSuggestions() {
  els.commandSuggestions.classList.add("hidden");
  els.commandSuggestions.innerHTML = "";
}

function renderCommandSuggestions() {
  const suggestions = getCommandSuggestions(els.jimmyInput.value);
  if (!suggestions.length) {
    hideCommandSuggestions();
    return;
  }
  els.commandSuggestions.innerHTML = suggestions.map((item, index) => `
    <button class="command-suggestion${index === 0 ? " active" : ""}" type="button" data-command="${escapeHtml(item.command)}" role="option">
      <strong>${escapeHtml(item.command)}</strong>
      <span>${escapeHtml(item.label)}</span>
      <small>${escapeHtml(item.description)}</small>
    </button>
  `).join("");
  els.commandSuggestions.classList.remove("hidden");
}

function handleCommandSuggestionKeys(event) {
  if (els.commandSuggestions.classList.contains("hidden")) return;
  const buttons = Array.from(els.commandSuggestions.querySelectorAll(".command-suggestion"));
  if (!buttons.length) return;
  const activeIndex = Math.max(0, buttons.findIndex(button => button.classList.contains("active")));
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const nextIndex = event.key === "ArrowDown"
      ? (activeIndex + 1) % buttons.length
      : (activeIndex - 1 + buttons.length) % buttons.length;
    buttons.forEach((button, index) => button.classList.toggle("active", index === nextIndex));
  }
  if (event.key === "Tab") {
    event.preventDefault();
    applyCommandSuggestion(buttons[activeIndex].dataset.command);
  }
  if (event.key === "Escape") {
    hideCommandSuggestions();
  }
}

async function loadHome() {
  setStatus("Loading");
  const [jobsData, remindersData, jimmyData] = await Promise.all([
    api("/api/jobs"),
    api("/api/reminders"),
    api("/api/chat")
  ]);
  state.jobs = jobsData.jobs;
  state.jimmyMessages = jimmyData.messages;
  state.reminders = remindersData.reminders;
  renderJobs();
  renderReminders(remindersData.reminders);
  renderJimmyMessages();
  await refreshActivityPanel();
  setStatus("Ready");
}

async function openDashboard() {
  setStatus("Loading dashboard");
  showView("dashboard");
  renderDashboardDate();
  const dashboardData = await api("/api/dashboard");
  state.dashboardLastLoadedDate = getDashboardDateKey();
  renderDashboard(dashboardData);
  await loadDashboardWeather();
  setStatus("Ready");
}

function getDashboardDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: state.userLocation.timezone || undefined });
}

async function refreshDashboardIfDateChanged() {
  if (els.dashboardView.classList.contains("hidden")) return;
  const todayKey = getDashboardDateKey();
  if (state.dashboardLastLoadedDate === todayKey) return;
  await openDashboard();
}

async function loadDashboardWeather() {
  const params = new URLSearchParams({
    latitude: state.userLocation.latitude,
    longitude: state.userLocation.longitude,
    location: state.userLocation.name,
    timezone: state.userLocation.timezone || "auto"
  });
  const weatherData = await api(`/api/weather?${params.toString()}`);
  renderWeather(weatherData.weather);
}

async function openJob(jobId) {
  setStatus("Opening job");
  state.activeJobId = jobId;
  state.activeFileName = null;
  const detail = await api(`/api/jobs/${jobId}`);
  renderJobDetail(detail);
  setStatus("Ready");
}

function openWikiTab() {
  openWikiPage();
}

function renderDashboardDate() {
  const date = new Date();
  els.dashboardGreeting.textContent = "Daily overview";
  els.dashboardDate.textContent = formatLongDate(date);
}

function renderWeather(weather) {
  els.weatherLocation.textContent = weather?.location || state.userLocation.name;
  if (!weather || weather.temperature === null || weather.temperature === undefined) {
    els.weatherTemp.textContent = "--°";
    els.weatherStatus.textContent = "Weather unavailable";
    return;
  }
  els.weatherTemp.textContent = `${weather.temperature}°`;
  els.weatherStatus.textContent = "Current temperature";
}

function renderDashboard(data) {
  const today = new Date().toDateString();
  const daily = (data.reminders || []).filter(reminder => {
    if (!reminder.due_at) return false;
    return new Date(reminder.due_at).toDateString() === today;
  });
  const overdue = [
    ...(data.reminders || []).filter(item => item.due_at && new Date(item.due_at) < new Date()),
    ...(data.weeklyTasks || []).filter(item => item.due_at && new Date(item.due_at) < new Date())
  ];
  const reminders = daily.length ? daily : (data.reminders || []).slice(0, 5);
  const waitingItems = data.waitingItems || [];
  const safetyWatch = data.safetyWatch || [];
  const draftResponses = data.draftResponses || [];
  const sourceKnowledge = data.sourceKnowledge || [];
  const weeklyTasks = data.weeklyTasks || [];
  const priorityItems = [
    ...overdue.map(item => ({
      title: item.title,
      meta: `Overdue${item.due_at ? ` · ${formatDate(item.due_at)}` : ""}${item.job_title ? ` · ${item.job_title}` : ""}`
    })),
    ...reminders.map(reminder => ({
      title: reminder.title,
      meta: `Today${reminder.due_at ? ` · ${formatDate(reminder.due_at)}` : ""}${reminder.job_title ? ` · ${reminder.job_title}` : ""}`
    })),
    ...weeklyTasks.map(task => ({
      title: task.title,
      meta: `${task.status}${task.due_at ? ` · ${formatDate(task.due_at)}` : ""}${task.job_title ? ` · ${task.job_title}` : ""}`
    }))
  ].slice(0, 5);
  const followupItems = [
    ...waitingItems.map(item => ({ title: item.title, meta: item.meta || "Waiting on outside input" })),
    ...draftResponses.map(item => ({ title: item.title, meta: item.meta || "Draft response" }))
  ].slice(0, 4);
  const knowledgeItems = [
    ...safetyWatch.map(item => ({ title: item.title, meta: item.meta || "Safety watch" })),
    ...sourceKnowledge.map(item => ({ title: item.title, meta: item.meta || "Wiki reference" }))
  ].slice(0, 4);
  const topPickup = (data.pickup || []).slice(0, 3);
  const todayTotal = reminders.length + (data.calendarItems || []).length;
  els.todayCount.textContent = todayTotal;
  els.overdueCount.textContent = overdue.length;
  els.waitingCount.textContent = waitingItems.length;
  els.draftCount.textContent = draftResponses.length;
  els.knowledgeCount.textContent = sourceKnowledge.length;
  els.dashboardPriorityCount.textContent = priorityItems.length;
  els.waitingPanelCount.textContent = waitingItems.length;
  els.safetyWatchCount.textContent = safetyWatch.length;
  els.dashboardFocusText.textContent = data.dailyBrief?.focus || buildDashboardFocus({ reminders, tasks: weeklyTasks, waitingItems, safetyWatch, draftResponses });
  renderDashboardList(els.dashboardPriorityList, priorityItems, item => ({
    title: item.title,
    meta: item.meta
  }), "Nothing urgent right now.");
  renderDashboardList(els.dashboardFollowupList, followupItems, item => ({
    title: item.title,
    meta: item.meta
  }), "No follow-ups waiting.");
  renderDashboardList(els.dashboardKnowledgeList, knowledgeItems, item => ({
    title: item.title,
    meta: item.meta
  }), "No safety or wiki items to scan.");
  renderDashboardList(els.pickupList, topPickup, job => ({
    title: job.title,
    meta: job.next_action || job.summary || `Last updated ${formatDate(job.updated_at)}`
  }), "Nothing to pick up yet.");
}

function buildDashboardFocus({ reminders, tasks, waitingItems, safetyWatch, draftResponses }) {
  if (reminders.length) return `${reminders.length} item${reminders.length === 1 ? "" : "s"} on today's schedule.`;
  if (tasks.length) return `${tasks.length} open action${tasks.length === 1 ? "" : "s"} need attention.`;
  if (draftResponses.length) return `${draftResponses.length} draft response${draftResponses.length === 1 ? "" : "s"} to review.`;
  if (waitingItems.length) return `${waitingItems.length} item${waitingItems.length === 1 ? "" : "s"} waiting on others.`;
  if (safetyWatch.length) return `${safetyWatch.length} safety watch item${safetyWatch.length === 1 ? "" : "s"} to scan.`;
  return "No urgent local items. Connected integrations will fill this in daily.";
}

function renderDashboardList(target, items, mapItem, emptyText) {
  target.innerHTML = "";
  if (!items.length) {
    target.innerHTML = `<div class="dashboard-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  for (const item of items) {
    const mapped = mapItem(item);
    const div = document.createElement("div");
    div.className = "dashboard-row";
    div.innerHTML = `<strong>${escapeHtml(mapped.title || "Untitled")}</strong><span>${escapeHtml(mapped.meta || "")}</span>`;
    target.append(div);
  }
}

async function openFile(jobId, fileName) {
  setStatus("Opening file");
  const data = await api(`/api/jobs/${jobId}/files/${encodeURIComponent(fileName)}`);
  state.activeFileName = fileName;
  state.activeFileContent = data.content;
  els.activeFileName.textContent = fileName;
  els.markdownEditor.value = data.content;
  for (const button of els.fileList.querySelectorAll(".file-button")) {
    button.classList.toggle("active", button.textContent === fileName);
  }
  setStatus("Ready");
}

async function saveActiveFile() {
  if (!state.activeJobId || !state.activeFileName) return;
  setStatus("Saving");
  await api(`/api/jobs/${state.activeJobId}/files/${encodeURIComponent(state.activeFileName)}`, {
    method: "PUT",
    body: JSON.stringify({ content: els.markdownEditor.value })
  });
  state.activeFileContent = els.markdownEditor.value;
  setStatus("Saved");
  setTimeout(() => setStatus("Ready"), 900);
}

function openIntake() {
  els.pageTitle.textContent = "New request";
  showView("intake");
}

async function submitIntake(event) {
  event.preventDefault();
  setStatus("Creating");
  const formData = new FormData(els.intakeForm);
  const payload = Object.fromEntries(formData.entries());
  const data = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  els.intakeForm.reset();
  await loadHome();
  await openJob(data.job.id);
  setStatus("Created");
  setTimeout(() => setStatus("Ready"), 900);
}

async function sendJimmyChat(event) {
  event.preventDefault();
  const message = els.jimmyInput.value.trim();
  if (!message) return;
  hideCommandSuggestions();

  if (message === "/new") {
    els.jimmyInput.value = "";
    state.jimmyMessages.push({
      role: "assistant",
      content: "The New Request flow is parked for now. The idea is saved in docs/parked-new-request-intake.md so we can bring it back later."
    });
    renderJimmyMessages();
    return;
  }

  els.jimmyInput.value = "";
  state.jimmyMessages.push({ role: "user", content: message });
  renderJimmyMessages();

  if (message === "/jobs") {
    const content = state.jobs.length
      ? state.jobs.map(job => `${job.title} (${job.status}, ${job.priority})`).join("\n")
      : "No jobs yet. The New Request flow is parked for now and saved in docs/parked-new-request-intake.md.";
    state.jimmyMessages.push({ role: "assistant", content });
    renderJimmyMessages();
    return;
  }

  if (message === "/reminders") {
    const content = state.reminders.length
      ? state.reminders.map(reminder => `${reminder.title} - ${formatDate(reminder.due_at)}${reminder.job_title ? ` (${reminder.job_title})` : ""}`).join("\n")
      : "No pending reminders.";
    state.jimmyMessages.push({ role: "assistant", content });
    renderJimmyMessages();
    return;
  }

  if (message === "/help") {
    state.jimmyMessages.push({
      role: "assistant",
      content: "Available commands:\n/jobs - list current jobs\n/reminders - ask EOS about pending reminders\n/wiki - list knowledge pages\n/wiki [topic] - ask EOS using matching knowledge pages\n/sources - list source knowledge pages\n/wiki-from-doc [file or topic] - draft from source knowledge\n/create-wiki Title - draft a page from pasted notes\n/document Title - draft documentation as a page\n/product-brief [topic] - draft a product brief\n/toolbox-talk [topic] - draft a toolbox talk\n/inspection-report [topic] - draft an inspection report\n/incident-summary [topic] - draft an incident summary\n/osha-reference [topic] - draft an OSHA reference\n/explain [topic] - explain how something works in simple steps\nsave as reference - save the final draft for EOS to reuse\n/help - show commands\n\nExport commands planned:\n/create-pdf\n/create-excel\n/create-word\n/create-powerpoint\n/create-email-draft\n/export-csv\n/export-html\n/export-json\n/create-calendar-file\n/export-package\n/create-qr-sheet\n/dashboard-snapshot\n\nEOS stores knowledge as markdown source-knowledge pages. Export commands are for sending polished files to other people.\n\nYou can also use plain language for the same actions, like: Explain how the dashboard works, Export this as a PDF, Make an Excel inspection checklist, Create a PowerPoint toolbox talk, or Draft an Outlook email."
    });
    renderJimmyMessages();
    return;
  }

  if (message === "/wiki") {
    const data = await api("/api/wiki");
    const content = data.docs.length
      ? data.docs.map(doc => `${doc.title} (${doc.path})`).join("\n")
      : "No knowledge pages yet.";
    state.jimmyMessages.push({ role: "assistant", content });
    renderJimmyMessages();
    return;
  }

  setStatus("EOS is thinking");
  const data = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, activeJobId: state.activeJobId })
  });
  state.jimmyMessages.push({ role: "assistant", content: data.content });
  renderJimmyMessages();
  await refreshActivityPanel(data);
  setStatus("Ready");
}

function readFileAsBase64(file) {
  return new Promise((resolveFile, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolveFile(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadSourceFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  setStatus("Importing docs");
  const imported = [];
  for (const file of files) {
    const textLike = /\.(txt|md|csv|json|html?|log)$/i.test(file.name);
    const payload = {
      fileName: file.name,
      sourceType: "reference",
      encoding: textLike ? "utf8" : "base64",
      content: textLike ? await file.text() : await readFileAsBase64(file)
    };
    const data = await api("/api/source-documents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    imported.push(data.document);
  }
  els.sourceFileInput.value = "";
  const lines = imported.map(doc => `- #${doc.id} ${doc.file_name} (${doc.status})${doc.markdown_path ? `\n  Page: ${doc.markdown_path}` : ""}`).join("\n");
  state.jimmyMessages.push({
    role: "assistant",
    content: `Converted ${imported.length} upload${imported.length === 1 ? "" : "s"} into markdown source knowledge page${imported.length === 1 ? "" : "s"}:\n\n${lines}\n\nUse /sources to list them, /wiki-from-doc [file or topic] to draft from them, or ask me about the uploaded material in plain language.`
  });
  renderJimmyMessages();
  setStatus("Ready");
}

function askJimmyAboutActiveJob() {
  if (!state.activeJobId) return;
  const job = state.jobs.find(item => item.id === state.activeJobId);
  showJimmyHome({ keepActiveJob: true });
  els.jimmyInput.value = job
    ? `Help me with "${job.title}". What should I do next?`
    : "Help me with this open job. What should I do next?";
  els.jimmyInput.focus();
}

async function clearJimmyChat() {
  setStatus("Clearing");
  await api("/api/chat", { method: "DELETE" });
  state.jimmyMessages = [];
  state.activity = {
    plan: null,
    citations: [],
    connectorContext: [],
    agentOutputs: [],
    events: [],
    tasks: []
  };
  renderJimmyMessages();
  renderActivityPanel();
  setStatus("Ready");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString();
}

function getGreeting(date) {
  const hour = getHourForTimezone(date, state.userLocation.timezone);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatLongDate(date) {
  const timezone = state.userLocation.timezone && state.userLocation.timezone !== "auto" ? state.userLocation.timezone : undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone
  }).formatToParts(date);
  const weekday = parts.find(part => part.type === "weekday")?.value || "";
  const month = parts.find(part => part.type === "month")?.value || "";
  const day = Number(parts.find(part => part.type === "day")?.value || date.getDate());
  return `${weekday}, ${month} ${day}${ordinalSuffix(day)}`;
}

function getHourForTimezone(date, timezone) {
  if (!timezone || timezone === "auto") return date.getHours();
  const value = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone
  }).format(date);
  return Number(value);
}

function ordinalSuffix(day) {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.jimmyHomeButton.addEventListener("click", showJimmyHome);
els.sidebarToggle.addEventListener("click", toggleSidebar);
els.tasksButton.addEventListener("click", openTasksPage);
els.addTaskButton.addEventListener("click", openTaskModal);
els.cancelAddTaskButton.addEventListener("click", closeTaskModal);
els.secondaryCancelAddTaskButton.addEventListener("click", closeTaskModal);
els.taskModal.addEventListener("click", event => {
  if (event.target === els.taskModal) closeTaskModal();
});
els.addTaskForm.addEventListener("submit", addTask);
els.todoToggle.addEventListener("click", () => toggleTaskSection(els.todoToggle, els.todoTasks));
els.completedToggle.addEventListener("click", () => toggleTaskSection(els.completedToggle, els.completedTasks));
els.profileButton.addEventListener("click", () => openSettingsPopover("profile"));
els.closeSettingsPopover.addEventListener("click", closeSettingsPopover);
els.settingsPageButton.addEventListener("click", () => openSettingsPage("personal"));
els.closeSettingsPage.addEventListener("click", closeSettingsPage);
els.avatarSettingsButton.addEventListener("click", openAvatarModal);
els.closeAvatarModal.addEventListener("click", closeAvatarModal);
els.avatarModal.addEventListener("click", event => {
  if (event.target === els.avatarModal) closeAvatarModal();
});
for (const option of document.querySelectorAll("[data-avatar-option]")) {
  option.addEventListener("click", () => {
    setUserAvatar(option.dataset.avatarOption);
    closeAvatarModal();
  });
}
for (const item of document.querySelectorAll(".settings-nav-item")) {
  item.addEventListener("click", () => activateSettingsSection(item.dataset.settingsSection));
}
for (const button of document.querySelectorAll("[data-theme]")) {
  button.addEventListener("click", () => setTheme(button.dataset.theme));
}
for (const button of document.querySelectorAll("[data-dashboard-action]")) {
  button.addEventListener("click", () => handleDashboardAction(button.dataset.dashboardAction));
}
for (const button of document.querySelectorAll("[data-connect-provider]")) {
  button.addEventListener("click", () => connectIntegration(button.dataset.connectProvider));
}
els.addSourceButton.addEventListener("click", addApprovedSource);
els.indexSourcesButton.addEventListener("click", indexApprovedSources);
els.sourcePathInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addApprovedSource();
});
els.addMemoryButton.addEventListener("click", addMemory);
els.memoryContentInput.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addMemory();
});
els.saveUserNameButton.addEventListener("click", saveUserName);
els.userNameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") saveUserName();
});
els.citySearchButton.addEventListener("click", searchCities);
els.citySearchInput.addEventListener("input", queueCitySearch);
els.citySearchInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchCities();
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeSettingsPopover();
    closeSettingsPage();
    closeAvatarModal();
  }
});
document.addEventListener("click", event => {
  if (
    els.settingsPopover.classList.contains("hidden") ||
    els.settingsPopover.contains(event.target) ||
    els.profileButton.contains(event.target)
  ) {
    return;
  }
  closeSettingsPopover();
});
if (els.chatTab) els.chatTab.addEventListener("click", () => showJimmyHome());
if (els.dashboardTab) els.dashboardTab.addEventListener("click", openDashboard);
if (els.wikiTab) els.wikiTab.addEventListener("click", openWikiTab);
if (els.dashboardSideButton) els.dashboardSideButton.addEventListener("click", openDashboard);
if (els.wikiSideButton) els.wikiSideButton.addEventListener("click", openWikiTab);
els.refreshWikiButton.addEventListener("click", openWikiPage);
els.newWikiButton.addEventListener("click", startNewWiki);
els.saveWikiButton.addEventListener("click", saveWiki);
els.cancelIntakeButton.addEventListener("click", () => {
  showJimmyHome();
});
els.intakeForm.addEventListener("submit", submitIntake);
els.saveFileButton.addEventListener("click", saveActiveFile);
els.askJimmyButton.addEventListener("click", askJimmyAboutActiveJob);
els.jimmyForm.addEventListener("submit", sendJimmyChat);
els.jimmyInput.addEventListener("input", renderCommandSuggestions);
els.jimmyInput.addEventListener("keydown", handleCommandSuggestionKeys);
els.commandSuggestions.addEventListener("click", event => {
  const button = event.target.closest("[data-command]");
  if (button) applyCommandSuggestion(button.dataset.command);
});
els.importDocButton.addEventListener("click", () => els.sourceFileInput.click());
els.sourceFileInput.addEventListener("change", uploadSourceFiles);
if (els.clearJimmyButton) {
  els.clearJimmyButton.addEventListener("click", clearJimmyChat);
}
for (const chip of document.querySelectorAll(".command-chip")) {
  chip.addEventListener("click", () => {
    els.jimmyInput.value = chip.dataset.command || "";
    els.jimmyInput.focus();
  });
}

setSidebarCollapsed(localStorage.getItem("jbk-sidebar-collapsed") === "true");
setTheme(localStorage.getItem("jbk-theme") || "dark");
setUserName(localStorage.getItem("jbk-user-name") || "Jake");
setUserAvatar(localStorage.getItem("jbk-user-avatar") || "default");
setUserLocation(loadSavedLocation());
loadWorkspaceContext();
setInterval(() => {
  refreshDashboardIfDateChanged().catch(error => console.error(error));
}, 60_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshDashboardIfDateChanged().catch(error => console.error(error));
});

loadHome().catch(error => {
  console.error(error);
  setStatus("Error");
  alert(error.message);
});
