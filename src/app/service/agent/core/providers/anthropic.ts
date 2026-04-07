import type { ChatStreamEvent, ChatRequest, ContentBlock } from "../types";
import type { AgentModelConfig } from "../types";
import { isContentBlocks } from "../content_utils";
import {
  generateAttachmentId,
  convertTextBlock,
  convertFileBlock,
  imageBlockFallback,
  readSSEStream,
} from "./content_utils";

// 将 ContentBlock[] 转换为 Anthropic content 格式
function convertContentBlocks(
  blocks: ContentBlock[],
  attachmentResolver?: (id: string) => string | null
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        result.push(convertTextBlock(block));
        break;
      case "image": {
        const data = attachmentResolver?.(block.attachmentId);
        if (data) {
          // data URL → base64 内容，Anthropic 格式：source.base64
          const match = data.match(/^data:([^;]+);base64,(.+)$/s);
          if (match) {
            result.push({
              type: "image",
              source: { type: "base64", media_type: match[1], data: match[2] },
            });
          } else {
            result.push(imageBlockFallback(block));
          }
        } else {
          result.push(imageBlockFallback(block));
        }
        break;
      }
      case "file":
        result.push(convertFileBlock(block));
        break;
      case "audio":
        // Anthropic 暂不支持音频，降级为文本描述（含时长信息）
        result.push({
          type: "text",
          text: `[Audio: ${block.name || "audio"}${block.durationMs ? ` (${(block.durationMs / 1000).toFixed(1)}s)` : ""}, OPFS path: uploads/${block.attachmentId}]`,
        });
        break;
    }
  }
  return result;
}

// 构造 Anthropic 格式的请求
export function buildAnthropicRequest(
  config: AgentModelConfig,
  request: ChatRequest,
  attachmentResolver?: (id: string) => string | null
): { url: string; init: RequestInit } {
  const baseUrl = config.apiBaseUrl || "https://api.anthropic.com";
  const url = `${baseUrl}/v1/messages`;
  const useCache = request.cache !== false;

  // 分离 system 消息和其他消息
  const systemMessages = request.messages.filter((m) => m.role === "system");
  const otherMessages = request.messages.filter((m) => m.role !== "system");

  // Anthropic 格式：tool 角色消息需要转换为 tool_result content block
  // assistant 消息带 toolCalls 时需要转换为 tool_use content blocks
  const messages = otherMessages.map((m) => {
    if (m.role === "tool" && m.toolCallId) {
      return {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      };
    }
    // assistant 消息带 tool_calls 时，转换为 content blocks 格式
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) {
        if (isContentBlocks(m.content)) {
          content.push(...convertContentBlocks(m.content, attachmentResolver));
        } else {
          content.push({ type: "text", text: m.content });
        }
      }
      for (const tc of m.toolCalls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments
            ? (() => {
                try {
                  return JSON.parse(tc.arguments);
                } catch {
                  return {};
                }
              })()
            : {},
        });
      }
      return { role: "assistant" as const, content };
    }
    // 处理 ContentBlock[] 格式的消息内容
    if (isContentBlocks(m.content)) {
      return { role: m.role, content: convertContentBlocks(m.content, attachmentResolver) };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
  };

  body.max_tokens = config.maxTokens || 16384;

  if (systemMessages.length > 0) {
    const systemBlocks = systemMessages.map((m) => ({
      type: "text" as const,
      text:
        typeof m.content === "string"
          ? m.content
          : m.content
              .filter((b) => b.type === "text")
              .map((b) => (b as { type: "text"; text: string }).text)
              .join(""),
    }));
    // 最后一个 system block 加 cache_control（仅在启用缓存时）
    if (useCache && systemBlocks.length > 0) {
      (systemBlocks[systemBlocks.length - 1] as Record<string, unknown>).cache_control = { type: "ephemeral" };
    }
    body.system = systemBlocks;
  }

  // 添加工具定义
  if (request.tools && request.tools.length > 0) {
    const tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
    // 最后一个 tool 加 cache_control（仅在启用缓存时）
    if (useCache && tools.length > 0) {
      (tools[tools.length - 1] as Record<string, unknown>).cache_control = { type: "ephemeral" };
    }
    body.tools = tools;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };

  return {
    url,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  };
}

// 解析 Anthropic SSE 流，生成 ChatStreamEvent
export function parseAnthropicStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  // 跟踪 message_start 中的 usage（含 cache 信息），在 message_delta 中合并输出
  let cachedUsage: { inputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number } | null =
    null;

  // 跟踪图片块的累积 base64 数据
  let imageBlockData: { index: number; mediaType: string; base64Chunks: string[] } | null = null;

  return readSSEStream(
    reader,
    signal,
    (sseEvent) => {
      try {
        const json = JSON.parse(sseEvent.data);

        switch (sseEvent.event) {
          case "message_start": {
            // message_start 包含初始 usage（input_tokens, cache 信息）
            const usage = json.message?.usage;
            if (usage) {
              cachedUsage = {
                inputTokens: usage.input_tokens || 0,
                cacheCreationInputTokens: usage.cache_creation_input_tokens,
                cacheReadInputTokens: usage.cache_read_input_tokens,
              };
            }
            break;
          }
          case "content_block_start": {
            const block = json.content_block;
            if (block?.type === "thinking") {
              // thinking block 开始，后续通过 content_block_delta 传输内容
            } else if (block?.type === "tool_use") {
              onEvent({
                type: "tool_call_start",
                toolCall: {
                  id: block.id,
                  name: block.name,
                  arguments: "",
                },
              });
            } else if (block?.type === "image") {
              // 图片生成块开始，记录 index 和 media_type
              imageBlockData = {
                index: json.index,
                mediaType: block.source?.media_type || "image/png",
                base64Chunks: [],
              };
              onEvent({
                type: "content_block_start",
                block: {
                  type: "image",
                  mimeType: block.source?.media_type || "image/png",
                  name: "generated_image",
                },
              });
            }
            break;
          }
          case "content_block_delta": {
            const delta = json.delta;
            if (delta?.type === "text_delta") {
              onEvent({ type: "content_delta", delta: delta.text });
            } else if (delta?.type === "thinking_delta") {
              onEvent({ type: "thinking_delta", delta: delta.thinking });
            } else if (delta?.type === "input_json_delta") {
              onEvent({
                type: "tool_call_delta",
                id: "",
                delta: delta.partial_json,
              });
            } else if (delta?.type === "image_delta" && imageBlockData) {
              // 累积 base64 数据块
              imageBlockData.base64Chunks.push(delta.data);
            }
            break;
          }
          case "content_block_stop": {
            // 图片块结束时，拼接 base64 并 emit content_block_complete
            if (imageBlockData) {
              const fullBase64 = imageBlockData.base64Chunks.join("");
              const dataUrl = `data:${imageBlockData.mediaType};base64,${fullBase64}`;
              const ext = imageBlockData.mediaType.split("/")[1] || "png";
              onEvent({
                type: "content_block_complete",
                block: {
                  type: "image",
                  attachmentId: generateAttachmentId(ext),
                  mimeType: imageBlockData.mediaType,
                  name: "generated_image",
                },
                data: dataUrl,
              });
              imageBlockData = null;
            }
            break;
          }
          case "message_delta": {
            // 消息结束，合并 message_start 的 input usage 和 message_delta 的 output usage
            if (json.usage) {
              onEvent({
                type: "done",
                usage: {
                  inputTokens: cachedUsage?.inputTokens || json.usage.input_tokens || 0,
                  outputTokens: json.usage.output_tokens || 0,
                  cacheCreationInputTokens: cachedUsage?.cacheCreationInputTokens,
                  cacheReadInputTokens: cachedUsage?.cacheReadInputTokens,
                },
              });
              return true;
            }
            break;
          }
          case "message_stop": {
            onEvent({ type: "done" });
            return true;
          }
          case "error": {
            onEvent({
              type: "error",
              message: json.error?.message || "Anthropic API error",
            });
            return true;
          }
        }
      } catch {
        // 解析失败忽略
      }
      return false;
    },
    (message) => onEvent({ type: "error", message })
  );
}

// ---- LLMProvider 接口适配 ----

import type { LLMProvider } from "./types";

/** Anthropic Claude 格式的 Provider 实现（注册在 providers/index.ts） */
export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  buildRequest: (input) => buildAnthropicRequest(input.model, input.request, input.resolver),
  parseStream: (reader, onEvent, signal) => parseAnthropicStream(reader, onEvent, signal),
};
