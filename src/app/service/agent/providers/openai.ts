import type { ChatStreamEvent, ChatRequest, ContentBlock } from "../types";
import type { AgentModelConfig } from "../types";
import { SSEParser } from "../sse_parser";
import { isContentBlocks } from "../content_utils";

// 将 ContentBlock[] 转换为 OpenAI content 数组格式
function convertContentBlocks(
  blocks: ContentBlock[],
  attachmentResolver?: (id: string) => string | null
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        result.push({ type: "text", text: block.text });
        break;
      case "image": {
        const data = attachmentResolver?.(block.attachmentId);
        if (data) {
          result.push({ type: "image_url", image_url: { url: data } });
        } else {
          result.push({ type: "text", text: `[Image: ${block.name || "image"}]` });
        }
        break;
      }
      case "file":
        // OpenAI 不支持文件上传到 chat，降级为文本引用
        result.push({ type: "text", text: `[File: ${block.name}]` });
        break;
      case "audio": {
        const data = attachmentResolver?.(block.attachmentId);
        if (data) {
          const match = data.match(/^data:([^;]+);base64,(.+)$/s);
          if (match) {
            // 从 mimeType 提取格式 (e.g. "audio/wav" → "wav")
            const format = block.mimeType.split("/")[1] || "wav";
            result.push({ type: "input_audio", input_audio: { data: match[2], format } });
          } else {
            result.push({ type: "text", text: `[Audio: ${block.name || "audio"}]` });
          }
        } else {
          result.push({ type: "text", text: `[Audio: ${block.name || "audio"}]` });
        }
        break;
      }
    }
  }
  return result;
}

// 构造 OpenAI 兼容格式的请求
export function buildOpenAIRequest(
  config: AgentModelConfig,
  request: ChatRequest,
  attachmentResolver?: (id: string) => string | null
): { url: string; init: RequestInit } {
  const baseUrl = config.apiBaseUrl || "https://api.openai.com/v1";
  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const messages = request.messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role };
    // 处理 ContentBlock[] 格式的消息内容
    if (isContentBlocks(m.content)) {
      msg.content = convertContentBlocks(m.content, attachmentResolver);
    } else {
      msg.content = m.content;
    }
    if (m.toolCallId) {
      msg.tool_call_id = m.toolCallId;
    }
    // assistant 消息带 tool_calls 时，转换为 OpenAI 格式
    if (m.toolCalls && m.toolCalls.length > 0) {
      msg.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    return msg;
  });

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (config.maxTokens) {
    body.max_tokens = config.maxTokens;
  }

  // 添加工具定义
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  return {
    url,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  };
}

// 解析 OpenAI SSE 流，生成 ChatStreamEvent
export function parseOpenAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const parser = new SSEParser();
  const decoder = new TextDecoder();

  return (async () => {
    // 记录最新的 usage 数据（某些 API 如 Grok 在每个 chunk 都带 usage，而非仅最后一个）
    let lastUsage:
      | { inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
      | undefined;

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.parse(chunk);

        for (const sseEvent of events) {
          if (sseEvent.data === "[DONE]") {
            onEvent({ type: "done", usage: lastUsage });
            return;
          }

          try {
            const json = JSON.parse(sseEvent.data);

            // 处理 API 错误响应
            if (json.error) {
              onEvent({
                type: "error",
                message: json.error.message || JSON.stringify(json.error),
              });
              return;
            }

            const choice = json.choices?.[0];
            if (choice) {
              const delta = choice.delta;
              if (delta) {
                // 思考过程增量（reasoning_content 兼容 deepseek / openai o-series）
                if (delta.reasoning_content) {
                  onEvent({ type: "thinking_delta", delta: delta.reasoning_content });
                }

                // 内容增量（可能是字符串或数组，GPT-4o 图片生成时为数组）
                if (delta.content) {
                  if (Array.isArray(delta.content)) {
                    for (const part of delta.content) {
                      if (part.type === "text" && part.text) {
                        onEvent({ type: "content_delta", delta: part.text });
                      } else if (part.type === "image_url" && part.image_url?.url) {
                        // 模型生成的图片，通过 content_block_complete 事件传递 data URL
                        const dataUrl: string = part.image_url.url;
                        const mimeMatch = dataUrl.match(/^data:([^;]+);/);
                        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
                        const ext = mimeType.split("/")[1] || "png";
                        const blockId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
                        onEvent({
                          type: "content_block_complete",
                          block: { type: "image", attachmentId: blockId, mimeType, name: "generated-image" },
                          data: dataUrl,
                        });
                      }
                    }
                  } else {
                    onEvent({ type: "content_delta", delta: delta.content });
                  }
                }

                // 工具调用
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (tc.function?.name) {
                      onEvent({
                        type: "tool_call_start",
                        toolCall: {
                          id: tc.id || `tc_${Date.now()}`,
                          name: tc.function.name,
                          arguments: tc.function.arguments || "",
                        },
                      });
                    } else if (tc.function?.arguments) {
                      onEvent({
                        type: "tool_call_delta",
                        id: tc.id || "",
                        delta: tc.function.arguments,
                      });
                    }
                  }
                }
              }
            }

            // 记录 usage（不作为结束信号，兼容每个 chunk 都带 usage 的 API）
            if (json.usage) {
              const cachedTokens = json.usage.prompt_tokens_details?.cached_tokens;
              lastUsage = {
                inputTokens: json.usage.prompt_tokens || 0,
                outputTokens: json.usage.completion_tokens || 0,
                ...(cachedTokens ? { cacheReadInputTokens: cachedTokens } : {}),
              };
            }
          } catch {
            // 解析失败忽略
          }
        }
      }
      // 流正常结束但没收到 [DONE]（某些 API 可能如此）
      if (!signal.aborted) {
        onEvent({ type: "done", usage: lastUsage });
      }
    } catch (e: any) {
      if (signal.aborted) return;
      onEvent({ type: "error", message: e.message || "Stream read error" });
    }
  })();
}
