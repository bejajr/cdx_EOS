import type { DatabaseAdapter } from "./db";
import { completeEvent, createEvent, failEvent, getPendingEvents, type WorkspaceEvent } from "./events";
import { plannerAgent } from "./agents/planner";
import { researcherAgent } from "./agents/researcher";
import { connectorAgent } from "./agents/connector";
import { writerAgent } from "./agents/writer";
import { memoryAgent } from "./agents/memory";
import { fileAgent } from "./agents/fileAgent";
import { taskAgent } from "./agents/task";

function parsePayload(event: WorkspaceEvent) {
  try {
    return event.payload_json ? JSON.parse(event.payload_json) : {};
  } catch {
    return {};
  }
}

export async function runChatWorkflow(db: DatabaseAdapter, input: {
  workspace_id: string;
  group_id?: string | null;
  user_id: string;
  thread_id: string;
  message: string;
}) {
  await createEvent(db, {
    workspace_id: input.workspace_id,
    group_id: input.group_id || null,
    type: "MESSAGE_CREATED",
    actor_type: "user",
    actor_id: input.user_id,
    payload: { thread_id: input.thread_id, message: input.message }
  });

  const plan = await plannerAgent({ message: input.message });
  const research = plan.agents.includes("researcher")
    ? await researcherAgent(db, input.workspace_id, input.message, input.group_id)
    : { context: "", citations: [] };
  const connectorContext = plan.agents.includes("connector")
    ? await connectorAgent(db, input.workspace_id, input.message)
    : [];
  const answer = await writerAgent({
    message: input.message,
    plan,
    context: [research.content, ...connectorContext.map((item) => item.content)].filter(Boolean).join("\n\n---\n\n"),
    citations: research.citations
  });

  const timestamp = new Date().toISOString();
  await db.run(
    `INSERT INTO chat_messages (workspace_id, thread_id, role, content, metadata_json, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?)`,
    [input.workspace_id, input.thread_id, answer.content, JSON.stringify({ citations: answer.citations, plan }), timestamp]
  );
  await db.run(
    `INSERT INTO agent_outputs (workspace_id, thread_id, agent_name, output_type, content, metadata_json, created_at)
     VALUES (?, ?, 'writer', 'final_response', ?, ?, ?)`,
    [input.workspace_id, input.thread_id, answer.content, JSON.stringify({ citations: answer.citations, plan }), timestamp]
  );

  await memoryAgent(db, {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        message: input.message
      });
  await createEvent(db, {
    workspace_id: input.workspace_id,
    group_id: input.group_id || null,
    type: "WORKFLOW_TRIGGERED",
    actor_type: "agent",
    actor_id: "writer",
    payload: { thread_id: input.thread_id, citations: answer.citations }
  });

  return answer;
}

export async function runWorkflowForEvent(db: DatabaseAdapter, event: WorkspaceEvent) {
  const payload = parsePayload(event);
  const message = String(payload.message || payload.title || payload.query || event.type);
  const plan = await plannerAgent({ message, event_type: event.type });
  const outputs = [];

  try {
    if (plan.agents.includes("fileAgent")) {
      outputs.push(await fileAgent(db, {
        workspace_id: event.workspace_id,
        action: event.type === "FILE_UPLOADED" ? "index" : "search",
        query: message
      }));
    }

    if (plan.agents.includes("task")) {
      outputs.push(await taskAgent(db, {
        workspace_id: event.workspace_id,
        group_id: event.group_id || null,
        title: payload.title || (/task|todo|remind|assign/i.test(message) ? message : undefined),
        due_at: payload.due_at || payload.dueAt || null,
        priority: payload.priority || "normal",
        assigned_to_user_id: payload.assigned_to_user_id || null,
        source_event_id: event.id
      }));
    }

    if (plan.agents.includes("memory")) {
      outputs.push(await memoryAgent(db, {
        workspace_id: event.workspace_id,
        user_id: event.actor_id || "system",
        message
      }));
    }

    const research = plan.agents.includes("researcher")
      ? await researcherAgent(db, event.workspace_id, message, event.group_id || null)
      : { context: "", citations: [] };
    const connectorContext = plan.agents.includes("connector")
      ? await connectorAgent(db, event.workspace_id, message)
      : [];

    let finalResponse = null;
    if (plan.agents.includes("writer")) {
      finalResponse = await writerAgent({
        message,
        plan,
        context: [research.content, ...connectorContext.map((item) => item.content)].filter(Boolean).join("\n\n---\n\n"),
        citations: research.citations
      });
      outputs.push(finalResponse);
    }

    const timestamp = new Date().toISOString();
    await db.run(
      `INSERT INTO agent_outputs (workspace_id, group_id, thread_id, agent_name, output_type, content, metadata_json, created_at)
       VALUES (?, ?, ?, 'workflow', ?, ?, ?, ?)`,
      [
        event.workspace_id,
        event.group_id || null,
        payload.thread_id || null,
        finalResponse ? "final_response" : "event_result",
        finalResponse?.content || JSON.stringify(outputs),
        JSON.stringify({ event_id: event.id, plan, outputs }),
        timestamp
      ]
    );

    await completeEvent(db, { event_id: event.id, result: { plan, outputs } });
    return { event_id: event.id, status: "completed", plan, outputs, finalResponse };
  } catch (error) {
    await failEvent(db, { event_id: event.id, error });
    return { event_id: event.id, status: "failed", error };
  }
}

export async function runPendingWorkflows(db: DatabaseAdapter, input: {
  workspace_id?: string;
  limit?: number;
} = {}) {
  const events = await getPendingEvents(db, input);
  const results = [];
  for (const event of events) {
    results.push(await runWorkflowForEvent(db, event));
  }
  return results;
}
