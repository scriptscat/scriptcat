import type { ChatMessage, ChatRequest, MessageContent } from "./types";

// 会话创建于所有权模型引入之前：agent_chat.ts 的 normalizeConversation 为这类记录统一回填
// "legacy:" 前缀 generation。放在这里（而非 repo 层）是因为大量测试会整体 mock agent_chat 模块，
// 从中导入纯函数会在那些测试里解析为 undefined。
export function isLegacyGeneration(generation: string | undefined): boolean {
  return generation?.startsWith("legacy:") ?? false;
}

// content block 里携带的附件 id（image/file/audio block 均以 attachmentId 引用）
function contentBlockAttachmentIds(content: MessageContent): string[] {
  if (typeof content === "string") return [];
  return content
    .filter((block) => block.type !== "text")
    .map((block) => (block as { attachmentId: string }).attachmentId);
}

/** Keep ownership only for durable artifacts that a compacted summary explicitly keeps addressable.
 * undefined/空的 ownedAttachmentIds 在当前模型里合法地表示"不拥有，content block 引用的都是借用"，
 * 因此只有 legacy=true（会话创建于所有权模型引入之前，见 agent_chat.ts 的 "legacy:" generation 前缀）
 * 时才退化为按 content block / 工具附件元数据推断候选集合；否则升级前对话摘要保留的旧附件
 * 永远无法被正确识别为候选，即使摘要文本里仍然显式引用了它（见 finding 4）。*/
export function retainedSummaryAttachmentIds(summary: string, messages: ChatMessage[], legacy = false): string[] {
  const owned = new Set<string>();
  const collectToolCalls = (toolCalls: NonNullable<ChatMessage["toolCalls"]>) => {
    for (const toolCall of toolCalls) {
      if (toolCall.ownedAttachmentIds !== undefined) {
        for (const id of toolCall.ownedAttachmentIds) owned.add(id);
      } else if (legacy) {
        for (const attachment of toolCall.attachments || []) owned.add(attachment.id);
      }
      for (const message of toolCall.subAgentDetails?.messages || []) {
        if (legacy) {
          for (const id of contentBlockAttachmentIds(message.content)) owned.add(id);
        }
        collectToolCalls(message.toolCalls);
      }
    }
  };
  for (const message of messages) {
    if (message.ownedAttachmentIds !== undefined) {
      for (const id of message.ownedAttachmentIds) owned.add(id);
    } else if (legacy) {
      for (const id of contentBlockAttachmentIds(message.content)) owned.add(id);
    }
    collectToolCalls(message.toolCalls || []);
  }
  return [...owned].filter((id) => summary.includes(`uploads/${id}`));
}

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
