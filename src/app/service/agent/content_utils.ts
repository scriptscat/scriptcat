import type { MessageContent, ContentBlock } from "./types";

/**
 * 从 MessageContent 提取纯文本（用于 copy、搜索、标题生成等）
 * - string: 直接返回
 * - ContentBlock[]: 连接所有 TextBlock 的 text
 */
export function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * 将 MessageContent 统一为 ContentBlock[]
 * - string: 转为 [{ type: "text", text }]
 * - ContentBlock[]: 原样返回
 */
export function normalizeContent(content: MessageContent): ContentBlock[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  return content;
}

/**
 * 类型守卫：判断 content 是否为 ContentBlock[]
 */
export function isContentBlocks(content: MessageContent): content is ContentBlock[] {
  return Array.isArray(content);
}
