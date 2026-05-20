import { generateText } from "../llm";
import type { AgentPlan } from "./planner";

export async function writerAgent(input: {
  message: string;
  plan: AgentPlan;
  context: string;
  citations: Array<{ document_id: number; title: string; source_path: string | null }>;
}) {
  const content = await generateText([
    {
      role: "system",
      content: "You are the AI Workspace OS writer agent. Answer clearly, preserve facts, cite source paths when provided, and mark unknowns instead of inventing details."
    },
    {
      role: "user",
      content: `Plan: ${JSON.stringify(input.plan)}\n\nContext:\n${input.context || "No retrieved context."}\n\nUser message:\n${input.message}`
    }
  ]);

  return { content, citations: input.citations };
}
