import type { ChatRequest, AgentModelConfig } from "./types";
import { isContentBlocks } from "./content_utils";
import { supportsVision } from "./model_capabilities";

/**
 * 解析消息中 image+vision 的 attachmentId → base64 data URL
 * file/audio/image(无vision) 不加载，provider 使用 OPFS 路径引用
 * @param messages 待解析的消息列表
 * @param model 当前模型配置（用于判断是否支持 vision）
 * @param getAttachment 通过 attachmentId 异步获取 Blob 的函数（未找到返回 null/undefined）
 * @returns resolver 函数：给定 attachmentId 返回 data URL 或 null
 */
export async function resolveAttachments(
  messages: ChatRequest["messages"],
  model: AgentModelConfig,
  getAttachment: (id: string) => Promise<Blob | null | undefined>
): Promise<(id: string) => string | null> {
  const resolved = new Map<string, string>();
  const mimeTypes = new Map<string, string>();
  const ids = new Set<string>();
  const hasVision = supportsVision(model);

  for (const m of messages) {
    if (isContentBlocks(m.content)) {
      for (const block of m.content) {
        // 只收集 image + vision 的 attachmentId
        if (block.type === "image" && hasVision && "attachmentId" in block) {
          ids.add(block.attachmentId);
          if (block.mimeType) {
            mimeTypes.set(block.attachmentId, block.mimeType);
          }
        }
      }
    }
  }

  if (ids.size === 0) return () => null;

  for (const id of ids) {
    try {
      const blob = await getAttachment(id);
      if (blob) {
        // Blob → base64 data URL（分块拼接，避免 O(n²) 字符串拼接）
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const CHUNK_SIZE = 8192;
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
          chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))));
        }
        const b64 = btoa(chunks.join(""));
        const mime = mimeTypes.get(id) || blob.type || "application/octet-stream";
        resolved.set(id, `data:${mime};base64,${b64}`);
      }
    } catch {
      // 加载失败，跳过
    }
  }

  return (id: string) => resolved.get(id) ?? null;
}
