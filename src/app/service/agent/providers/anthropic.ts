import type { ChatStreamEvent, ChatRequest } from "../types";
import type { AgentModelConfig } from "@App/pkg/config/config";
import { SSEParser } from "../sse_parser";

// 构造 Anthropic 格式的请求
export function buildAnthropicRequest(
  config: AgentModelConfig,
  request: ChatRequest
): { url: string; init: RequestInit } {
  const baseUrl = config.apiBaseUrl || "https://api.anthropic.com";
  const url = `${baseUrl}/v1/messages`;

  // 分离 system 消息和其他消息
  const systemMessages = request.messages.filter((m) => m.role === "system");
  const otherMessages = request.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 8192,
    messages: otherMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: true,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join("\n\n");
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
          try {
            const json = JSON.parse(sseEvent.data);

            switch (sseEvent.event) {
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
                }
                break;
              }
              case "message_delta": {
                // 消息结束，可能包含 usage
                if (json.usage) {
                  onEvent({
                    type: "done",
                    usage: {
                      inputTokens: json.usage.input_tokens || 0,
                      outputTokens: json.usage.output_tokens || 0,
                    },
                  });
                  return;
                }
                break;
              }
              case "message_stop": {
                onEvent({ type: "done" });
                return;
              }
              case "error": {
                onEvent({
                  type: "error",
                  message: json.error?.message || "Anthropic API error",
                });
                return;
              }
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
