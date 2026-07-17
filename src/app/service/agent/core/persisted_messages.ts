import type { ChatMessage, ChatRequest } from "./types";

/** 将持久化消息转换为 LLM 消息，错误占位消息只用于 UI 展示，不应重放。 */
export function toLLMMessages(
  messages: Array<Pick<ChatMessage, "role" | "content" | "toolCallId" | "toolCalls" | "error">>
): ChatRequest["messages"] {
  const normalized: ChatRequest["messages"] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.error || message.role === "tool") continue;
    normalized.push({
      role: message.role,
      content: message.content,
      toolCallId: message.toolCallId,
      toolCalls: message.toolCalls,
    });
    if (message.role !== "assistant" || !message.toolCalls?.length) continue;

    const results = new Map<string, (typeof messages)[number]>();
    let cursor = index + 1;
    while (cursor < messages.length && messages[cursor].role === "tool") {
      const toolMessage = messages[cursor];
      if (!toolMessage.error && toolMessage.toolCallId && !results.has(toolMessage.toolCallId)) {
        results.set(toolMessage.toolCallId, toolMessage);
      }
      cursor++;
    }
    for (const toolCall of message.toolCalls) {
      const result = results.get(toolCall.id);
      normalized.push({
        role: "tool",
        content: result?.content ?? JSON.stringify({ error: "Tool result unavailable after recovery" }),
        toolCallId: toolCall.id,
      });
    }
    index = cursor - 1;
  }
  return normalized;
}
