// 滑动窗口裁剪：仅裁剪内存中传给 LLM 的 messages（不影响 chatRepo 持久化/UI 历史），
// 用于在触及 autoCompact 的 80% 阈值之前，减少长 tool loop 中旧 tool 结果的重复计费。
import type { AgentModelConfig, ChatRequest, ContentBlock } from "./types";
import { supportsVision } from "./model_capabilities";
import { imageBlockFallbackText } from "./providers/content_utils";

export const ELIDED_TOOL_RESULT_STUB =
  "[tool result elided to save context — re-run the tool if you need this data again]";

/** 附件裁剪占位文本：保留 type/attachmentId（OPFS 路径），供模型按需重新读取，而非丢弃全部标识信息。 */
function elidedAttachmentStub(block: Exclude<ContentBlock, { type: "text" }>): string {
  return `[attachment elided to save context, type: ${block.type}, OPFS path: uploads/${block.attachmentId} — re-open the attachment if needed]`;
}

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

// 字节→token 的保守换算：常见 tokenizer 在 UTF-8 文本上很少低于 2 字节/token
// （英文/Latin 文本通常 ~4 字节/token，CJK 每字符 3 字节通常对应 1-2 token）。
// 直接把字节数当 token 数会比真实 token 数偏大数倍，导致远低于模型真实上限就被裁剪/拒绝；
// 除以该常量后仍保持保守（不会低估），同时不再把每个 UTF-8 字节当作独立 token。
const CONSERVATIVE_BYTES_PER_TOKEN = 2;

// 每条 message 的 role/content/toolCallId 序列化字节数缓存。
// tool loop 每轮都要重新估算整段 messages 的预算占用；不缓存的话，每轮都要把（随对话增长的）
// 完整历史重新 JSON.stringify 一遍，R 轮下来是 O(R·N) —— 长对话里最耗时的部分。
// 而 content/toolCallId 一旦写入某条 message 就几乎不再变化，唯二的例外是
// elideOldToolResults / elideOldAttachments 原地改写 m.content，这两处都会显式调用
// invalidateMessageByteCache() 使缓存失效；因此按 message 对象身份缓存是安全的。
// toolCalls 字段（status/attachments/subAgentDetails 会在工具执行后原地变化）不缓存，
// 每次都单独重算——但它只随"该条消息自身的工具调用数"增长，不随对话长度增长，代价很小。
const stableContentByteCache = new WeakMap<object, number>();

/** 消息 content 被原地改写后必须调用，否则会读到改写前的缓存字节数。 */
export function invalidateMessageByteCache(message: object): void {
  stableContentByteCache.delete(message);
}

function getStableContentBytes(message: { role: string; content: unknown; toolCallId?: string }): number {
  let bytes = stableContentByteCache.get(message);
  if (bytes === undefined) {
    const stable: Record<string, unknown> = { role: message.role, content: message.content };
    if (message.toolCallId) stable.toolCallId = message.toolCallId;
    bytes = new TextEncoder().encode(JSON.stringify(stable)).byteLength;
    stableContentByteCache.set(message, bytes);
  }
  return bytes;
}

/**
 * 以 UTF-8 字节数的保守上界估算 provider 请求 token。
 * 只对 provider 实际会内联展开为 base64 的块计入二进制字节：
 * 当前仅 vision 模型的 image 块会被 resolveAttachments 加载；file/audio 及非 vision 模型的
 * image 均降级为纯文本描述（见 providers/content_utils.ts），其体积已包含在下方的 JSON 基线字节里。
 */
export function estimateRequestTokens(
  messages: ChatRequest["messages"],
  tools?: unknown[],
  attachmentSizes?: Map<string, number>,
  model?: AgentModelConfig
): number {
  const hasVision = model ? supportsVision(model) : false;
  const attachmentBytes = messages.reduce((sum, message) => {
    if (!Array.isArray(message.content)) return sum;
    return (
      sum +
      message.content.reduce((blockSum, block) => {
        if (block.type === "text") return blockSum;
        // file/audio 从不被内联；image 只在 vision 模型上才会被解析为 data URL
        if (block.type === "file" || block.type === "audio" || !hasVision) return blockSum;
        const size = attachmentSizes?.get(block.attachmentId);
        if (size == null) {
          return blockSum + new TextEncoder().encode(imageBlockFallbackText(block)).byteLength;
        }
        return blockSum + (Math.ceil(size / 3) * 4 + 128);
      }, 0)
    );
  }, 0);
  if (!Number.isFinite(attachmentBytes)) return Number.POSITIVE_INFINITY;

  let bytes = 0;
  for (const message of messages) {
    bytes += getStableContentBytes(message);
    if (message.toolCalls && message.toolCalls.length > 0) {
      bytes += new TextEncoder().encode(JSON.stringify(message.toolCalls)).byteLength;
    }
  }
  if (tools && tools.length > 0) {
    bytes += new TextEncoder().encode(JSON.stringify(tools)).byteLength;
  }
  return Math.ceil((bytes + attachmentBytes) / CONSERVATIVE_BYTES_PER_TOKEN);
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
      invalidateMessageByteCache(m);
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
      block.type === "text" ? block : { type: "text", text: elidedAttachmentStub(block) }
    );
    invalidateMessageByteCache(message);
  }
}

/** 在安全预算内尽量保留最近的 tool 结果；必要时裁剪全部旧结果。 */
export function elideUntilWithinBudget(
  messages: ChatRequest["messages"],
  contextWindow: number,
  tools?: unknown[],
  budgetRatio = 0.9,
  attachmentSizes?: Map<string, number>,
  model?: AgentModelConfig
): boolean {
  // 原先按 hasToolResults 分两条 if 判断，但两分支条件完全相同（结果都只取决于 estimate()），
  // 白白多做一次 O(n) 的 messages.some() 扫描；合并为一次判断，语义不变。
  const estimate = () => estimateRequestTokens(messages, tools, attachmentSizes, model);
  if (estimate() / contextWindow < budgetRatio) return true;
  for (let keep = 5; keep >= 0; keep--) {
    elideOldToolResults(messages, keep);
    if (estimate() / contextWindow < budgetRatio) return true;
  }
  elideOldAttachments(messages);
  return estimate() / contextWindow < budgetRatio;
}
