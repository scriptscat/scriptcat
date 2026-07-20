import type { ChatRequest, AgentModelConfig } from "./types";
import { isContentBlocks } from "./content_utils";
import { supportsVision } from "./model_capabilities";
import type { AttachmentSizeInfo } from "./context_elision";
import { raceWithAbort, throwIfAborted } from "./abort_utils";

export type AttachmentSnapshot = {
  resolver: (id: string) => string | null;
  sizes: Map<string, AttachmentSizeInfo>;
};

export async function prepareAttachmentSnapshot(
  messages: ChatRequest["messages"],
  model: AgentModelConfig,
  getAttachment: (id: string) => Promise<Blob | null | undefined>,
  signal?: AbortSignal
): Promise<AttachmentSnapshot> {
  const resolved = new Map<string, string>();
  const sizes = new Map<string, AttachmentSizeInfo>();
  const mimeTypes = new Map<string, string>();
  const ids = new Set<string>();
  if (supportsVision(model)) {
    for (const message of messages) {
      if (!isContentBlocks(message.content)) continue;
      for (const block of message.content) {
        if (block.type !== "image") continue;
        ids.add(block.attachmentId);
        if (block.mimeType) mimeTypes.set(block.attachmentId, block.mimeType);
      }
    }
  }

  for (const id of ids) {
    throwIfAborted(signal);
    const blob = await raceWithAbort(getAttachment(id), signal);
    throwIfAborted(signal);
    if (!blob) continue;
    const info: AttachmentSizeInfo = { bytes: blob.size };
    if (typeof createImageBitmap === "function") {
      try {
        const bitmapPromise = createImageBitmap(blob);
        // raceWithAbort cannot cancel browser decoding. If it finishes after Stop, close the abandoned bitmap.
        void bitmapPromise.then(
          (bitmap) => {
            if (signal?.aborted) bitmap.close();
          },
          () => {}
        );
        const bitmap = await raceWithAbort(bitmapPromise, signal);
        info.width = bitmap.width;
        info.height = bitmap.height;
        bitmap.close();
      } catch (error) {
        if (signal?.aborted) throw error;
        // Unsupported or damaged image: size remains a conservative byte-based estimate.
      }
    }
    throwIfAborted(signal);
    const bytes = new Uint8Array(await raceWithAbort(blob.arrayBuffer(), signal));
    throwIfAborted(signal);
    const chunks: string[] = [];
    for (let index = 0; index < bytes.length; index += 8192) {
      chunks.push(String.fromCharCode(...bytes.subarray(index, Math.min(index + 8192, bytes.length))));
    }
    const mime = mimeTypes.get(id) || blob.type || "application/octet-stream";
    resolved.set(id, `data:${mime};base64,${btoa(chunks.join(""))}`);
    sizes.set(id, info);
  }
  return { resolver: (id) => resolved.get(id) ?? null, sizes };
}

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
  return (await prepareAttachmentSnapshot(messages, model, getAttachment)).resolver;
}
