export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function generateText(messages: LlmMessage[]) {
  if (!process.env.OPENAI_API_KEY) {
    const userMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    return `AI model is not configured yet. I saved your message and prepared the workspace flow.\n\nRequest received: ${userMessage.slice(0, 600)}`;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: messages
    })
  });

  if (!response.ok) {
    throw new Error(`LLM request failed with ${response.status}`);
  }

  const data = await response.json();
  return data.output_text || data.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("\n") || "";
}
