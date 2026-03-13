import type { ChatStreamEvent, ChatRequest } from "../types";
import type { AgentModelConfig } from "../types";
import { SSEParser } from "../sse_parser";

// 构造 OpenAI 兼容格式的请求
export function buildOpenAIRequest(config: AgentModelConfig, request: ChatRequest): { url: string; init: RequestInit } {
  const baseUrl = config.apiBaseUrl || "https://api.openai.com/v1";
  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const messages = request.messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content };
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
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.parse(chunk);

        for (const sseEvent of events) {
          if (sseEvent.data === "[DONE]") {
            onEvent({ type: "done" });
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

                // 内容增量
                if (delta.content) {
                  onEvent({ type: "content_delta", delta: delta.content });
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

            // 处理 usage（最后一个 chunk，必须在 choices 之后处理，避免丢失 tool_call 数据）
            if (json.usage) {
              const cachedTokens = json.usage.prompt_tokens_details?.cached_tokens;
              onEvent({
                type: "done",
                usage: {
                  inputTokens: json.usage.prompt_tokens || 0,
                  outputTokens: json.usage.completion_tokens || 0,
                  ...(cachedTokens ? { cacheReadInputTokens: cachedTokens } : {}),
                },
              });
              return;
            }
          } catch {
            // 解析失败忽略
          }
        }
      }
    } catch (e: any) {
      if (signal.aborted) return;
      onEvent({ type: "error", message: e.message || "Stream read error" });
    }
  })();
}
