import { getUserId, getWorkspaceId } from "../db";

export function workspaceFromRequest(request: Request) {
  return {
    workspace_id: getWorkspaceId(request.headers.get("x-workspace-id")),
    user_id: getUserId(request.headers.get("x-user-id"))
  };
}
