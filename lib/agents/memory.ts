import type { DatabaseAdapter } from "../db";
import { saveMemory } from "../memory";

export async function memoryAgent(db: DatabaseAdapter, input: {
  workspace_id: string;
  user_id: string;
  message: string;
}) {
  if (!/\b(remember|preference|always|my name|keep in mind)\b/i.test(input.message)) {
    return null;
  }
  return saveMemory(db, {
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    memory_type: "user_preference",
    content: input.message,
    metadata: { captured_by: "memoryAgent" }
  });
}
