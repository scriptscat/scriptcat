import type { ChatMessage, ChatRequest } from "./types";

/** 将持久化消息转换为 LLM 消息，错误占位消息只用于 UI 展示，不应重放。 */
export function toLLMMessages(
  messages: Array<Pick<ChatMessage, "role" | "content" | "toolCallId" | "toolCalls" | "error">>
): ChatRequest["messages"] {
  return messages
    .filter((message) => !message.error)
    .map((message) => ({
      role: message.role,
      content: message.content,
      toolCallId: message.toolCallId,
      toolCalls: message.toolCalls,
    }));
}
