import type { ContentBlock } from "../types";
import { SSEParser } from "../sse_parser";
import type { SSEEvent } from "../sse_parser";

/**
 * 生成图片附件 ID，格式：img_{时间戳}_{随机串}.{扩展名}
 */
export function generateAttachmentId(ext: string): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/**
 * 将 text 块转换为统一的文本内容对象
 */
export function convertTextBlock(block: Extract<ContentBlock, { type: "text" }>): Record<string, unknown> {
  return { type: "text", text: block.text };
}

/**
 * 将 file 块转换为文本描述（两个 provider 格式相同）
 */
export function convertFileBlock(block: Extract<ContentBlock, { type: "file" }>): Record<string, unknown> {
  return {
    type: "text",
    text: `[File: ${block.name}${block.size ? ` (${block.size} bytes)` : ""}, OPFS path: uploads/${block.attachmentId}]`,
  };
}

/**
 * image 块无法解析时的文本降级描述
 */
export function imageBlockFallback(block: Extract<ContentBlock, { type: "image" }>): Record<string, unknown> {
  return {
    type: "text",
    text: `[Image: ${block.name || "image"}, OPFS path: uploads/${block.attachmentId}]`,
  };
}

/**
 * audio 块无法解析时的文本降级描述
 */
export function audioBlockFallback(block: Extract<ContentBlock, { type: "audio" }>): Record<string, unknown> {
  return {
    type: "text",
    text: `[Audio: ${block.name || "audio"}, OPFS path: uploads/${block.attachmentId}]`,
  };
}

/**
 * 读取 SSE 流的公共骨架：创建解码器 + 解析器 → while 读取 reader → 解码 → 解析 SSE → 逐事件回调
 * onEvent 返回 true 表示流已结束（调用方应 return），返回 false 则继续
 */
export async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: SSEEvent) => boolean,
  onError: (message: string) => void
): Promise<void> {
  const parser = new SSEParser();
  const decoder = new TextDecoder();

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const events = parser.parse(chunk);

      for (const sseEvent of events) {
        // onEvent 返回 true 代表流处理完毕，提前退出
        if (onEvent(sseEvent)) return;
      }
    }
  } catch (e: any) {
    if (signal.aborted) return;
    onError(e.message || "Stream read error");
  }
}
