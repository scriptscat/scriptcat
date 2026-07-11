// 滑动窗口裁剪：仅裁剪内存中传给 LLM 的 messages（不影响 chatRepo 持久化/UI 历史），
// 用于在触及 autoCompact 的 80% 阈值之前，减少长 tool loop 中旧 tool 结果的重复计费。
import type { ChatRequest } from "./types";

export const ELIDED_TOOL_RESULT_STUB =
  "[tool result elided to save context — re-run the tool if you need this data again]";

/** 以 UTF-8 字节数的保守上界估算 provider 请求 token。 */
export function estimateRequestTokens(messages: ChatRequest["messages"], tools?: unknown[]): number {
  const bytes = new TextEncoder().encode(JSON.stringify({ messages, tools })).byteLength;
  return Math.ceil(bytes / 2);
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

/** 在安全预算内尽量保留最近的 tool 结果；必要时裁剪全部旧结果。 */
export function elideUntilWithinBudget(
  messages: ChatRequest["messages"],
  contextWindow: number,
  tools?: unknown[],
  budgetRatio = 0.6
): void {
  if (estimateRequestTokens(messages, tools) / contextWindow < budgetRatio) return;
  for (let keep = 5; keep >= 0; keep--) {
    elideOldToolResults(messages, keep);
    if (estimateRequestTokens(messages, tools) / contextWindow < budgetRatio) return;
  }
}
