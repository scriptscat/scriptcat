// 滑动窗口裁剪：仅裁剪内存中传给 LLM 的 messages（不影响 chatRepo 持久化/UI 历史），
// 用于在触及 autoCompact 的 80% 阈值之前，减少长 tool loop 中旧 tool 结果的重复计费。
import type { ChatRequest } from "./types";

export const ELIDED_TOOL_RESULT_STUB =
  "[tool result elided to save context — re-run the tool if you need this data again]";

export const ELIDED_ATTACHMENT_STUB = "[attachment elided to save context — re-open the attachment if needed]";

/** 读取 provider 会把附件展开成 data URL 后的实际字节规模。 */
export async function loadAttachmentSizes(
  messages: ChatRequest["messages"],
  getAttachment: (id: string) => Promise<Blob | null | undefined>
): Promise<Map<string, number>> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== "text") ids.add(block.attachmentId);
    }
  }
  const sizes = new Map<string, number>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const blob = await getAttachment(id);
        if (blob) sizes.set(id, blob.size);
      } catch {
        // 无法读取的附件保留为未知大小，由预算检查决定是否省略或拒绝请求。
      }
    })
  );
  return sizes;
}

/** 以 UTF-8 字节数的保守上界估算 provider 请求 token。 */
export function estimateRequestTokens(
  messages: ChatRequest["messages"],
  tools?: unknown[],
  attachmentSizes?: Map<string, number>
): number {
  const attachmentBytes = messages.reduce((sum, message) => {
    if (!Array.isArray(message.content)) return sum;
    return (
      sum +
      message.content.reduce((blockSum, block) => {
        if (block.type === "text") return blockSum;
        const size = attachmentSizes?.get(block.attachmentId);
        if (size == null) return Number.POSITIVE_INFINITY;
        return blockSum + (block.type === "file" ? 0 : Math.ceil(size / 3) * 4 + 128);
      }, 0)
    );
  }, 0);
  if (!Number.isFinite(attachmentBytes)) return Number.POSITIVE_INFINITY;
  const bytes = new TextEncoder().encode(JSON.stringify({ messages, tools })).byteLength;
  return bytes + attachmentBytes;
}

/**
 * 保留最近 keepLastAssistantTurns 轮 assistant(带 toolCalls) 及其后的消息原文，
 * 将更早的 tool 角色消息内容替换为占位文本。
 */
export function elideOldToolResults(messages: ChatRequest["messages"], keepLastAssistantTurns: number): void {
  let assistantTurnsSeen = 0;
  let cutoffIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      assistantTurnsSeen++;
      if (assistantTurnsSeen === keepLastAssistantTurns) {
        cutoffIndex = i;
        break;
      }
    }
  }

  const limit = keepLastAssistantTurns === 0 ? messages.length : cutoffIndex;
  for (let i = 0; i < limit; i++) {
    const m = messages[i];
    if (m.role === "tool" && m.content !== ELIDED_TOOL_RESULT_STUB) {
      m.content = ELIDED_TOOL_RESULT_STUB;
    }
  }
}

/** 将较旧消息中的多模态块替换为可恢复的文本占位，保留最近消息的附件。 */
export function elideOldAttachments(messages: ChatRequest["messages"], keepLastMessages = 2): void {
  const cutoff = Math.max(0, messages.length - keepLastMessages);
  for (let i = 0; i < cutoff; i++) {
    const message = messages[i];
    if (!Array.isArray(message.content)) continue;
    message.content = message.content.map((block) =>
      block.type === "text" ? block : { type: "text", text: ELIDED_ATTACHMENT_STUB }
    );
  }
}

/** 在安全预算内尽量保留最近的 tool 结果；必要时裁剪全部旧结果。 */
export function elideUntilWithinBudget(
  messages: ChatRequest["messages"],
  contextWindow: number,
  tools?: unknown[],
  budgetRatio = 0.9,
  attachmentSizes?: Map<string, number>
): boolean {
  const hasToolResults = messages.some((message) => message.role === "tool");
  const estimate = () => estimateRequestTokens(messages, tools, attachmentSizes);
  if (!hasToolResults && estimate() / contextWindow < budgetRatio) return true;
  if (hasToolResults && estimate() / contextWindow < budgetRatio) return true;
  for (let keep = 5; keep >= 0; keep--) {
    elideOldToolResults(messages, keep);
    if (estimate() / contextWindow < budgetRatio) return true;
  }
  elideOldAttachments(messages);
  return estimate() / contextWindow < budgetRatio;
}
