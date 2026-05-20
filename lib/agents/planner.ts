export type AgentPlan = {
  agents: Array<"researcher" | "writer" | "connector" | "fileAgent" | "task" | "memory">;
  intent: "answer" | "remember" | "index_files" | "create_task" | "connector_sync";
  reason: string;
};

export async function plannerAgent(input: { message: string; event_type?: string }): Promise<AgentPlan> {
  const message = input.message.toLowerCase();
  const agents: AgentPlan["agents"] = ["researcher", "writer"];
  let intent: AgentPlan["intent"] = "answer";

  if (input.event_type === "FILE_UPLOADED" || /\b(index|reindex|scan)\b/.test(message)) {
    agents.push("fileAgent");
    intent = "index_files";
  }
  if (input.event_type === "TASK_CREATED" || /\b(task|todo|remind|assign|follow up|follow-up)\b/.test(message)) {
    agents.push("task");
    intent = "create_task";
  }
  if (input.event_type === "CONNECTOR_SYNCED" || /\b(github|drive|slack|file|folder|source|document|repo|connector)\b/.test(message)) {
    agents.push("connector");
    intent = intent === "answer" ? "connector_sync" : intent;
  }
  if (input.event_type === "MEMORY_UPDATED" || /\b(remember|preference|always|my name|keep in mind)\b/.test(message)) {
    agents.push("memory");
    intent = "remember";
  }

  return {
    agents: Array.from(new Set(agents)),
    intent,
    reason: "Selected agents from lightweight intent keywords. Replace with an LLM planner when ready."
  };
}
