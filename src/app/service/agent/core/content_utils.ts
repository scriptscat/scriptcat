import type { MessageContent, ContentBlock } from "./types";

// MIME 类型 → 文件扩展名映射
const MIME_EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/json": "json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "text/plain": "txt",
  "text/html": "html",
  "text/csv": "csv",
};

/**
 * 根据 MIME 类型获取文件扩展名
 */
export function getExtFromMime(mimeType: string): string {
  if (MIME_EXT_MAP[mimeType]) return MIME_EXT_MAP[mimeType];
  // 从子类型中提取（去掉非字母数字字符）
  const sub = mimeType.split("/")[1];
  return sub ? sub.replace(/[^a-z0-9]/gi, "") : "bin";
}

/**
 * 判断文件名是否为图片类型（根据扩展名）
 */
export function isImageFileName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name);
}

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
