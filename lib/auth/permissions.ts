import { APP_MODE } from "../db";

export const PERMISSIONS = {
  adminAll: "perm.admin.all",
  chatUse: "perm.chat.use",
  documentsRead: "perm.documents.read",
  documentsWrite: "perm.documents.write",
  projectsRead: "perm.projects.read",
  projectsManage: "perm.projects.manage",
  tasksManage: "perm.tasks.manage",
  usersManage: "perm.users.manage",
  rolesManage: "perm.roles.manage",
  groupsManage: "perm.groups.manage"
} as const;

export function canUseLocalFiles() {
  return APP_MODE === "local";
}

export function assertWorkspaceAccess(workspaceId: string) {
  if (!workspaceId) throw new Error("Workspace is required");
}

export function isAdminPermission(permissionId: string) {
  return permissionId === PERMISSIONS.adminAll;
}

export function authorizedDocumentWhereClause(groupId?: string | null) {
  const groupFilter = groupId
    ? "AND (document_chunks.group_id = ? OR documents.group_id = ? OR document_chunks.group_id IS NULL OR documents.group_id IS NULL)"
    : "";
  return `
    document_chunks.workspace_id = ?
    ${groupFilter}
    AND (documents.file_source_id IS NULL OR file_sources.enabled = 1)
  `;
}
