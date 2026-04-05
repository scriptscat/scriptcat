import { describe, it, expect } from "vitest";
import { buildOpenAIRequest, parseOpenAIStream } from "./openai";
import type { AgentModelConfig } from "../types";
import type { ChatRequest, ChatStreamEvent } from "../types";

const config: AgentModelConfig = {
  id: "test",
  name: "Test",
  provider: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o",
};

describe("buildOpenAIRequest", () => {
  it("无 apiKey 时不包含 Authorization 头", () => {
    const noKeyConfig = { ...config, apiKey: "" };
    const { init } = buildOpenAIRequest(noKeyConfig, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("自定义 apiBaseUrl 时使用自定义 URL", () => {
    const customConfig = { ...config, apiBaseUrl: "https://my-proxy.com/api" };
    const { url } = buildOpenAIRequest(customConfig, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(url).toBe("https://my-proxy.com/api/chat/completions");
  });

  it("apiBaseUrl 为空时使用默认 URL", () => {
    const noBaseConfig = { ...config, apiBaseUrl: "" };
    const { url } = buildOpenAIRequest(noBaseConfig, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("assistant 消息带 toolCalls 时应转换为 OpenAI 格式", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [
        { role: "user", content: "天气" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' }],
        },
        { role: "tool", content: '{"temp":25}', toolCallId: "call_1" },
      ],
    };

    const { init } = buildOpenAIRequest(config, request);
    const body = JSON.parse(init.body as string);

    // assistant 消息应包含 tool_calls
    const assistantMsg = body.messages[1];
    expect(assistantMsg.tool_calls).toHaveLength(1);
    expect(assistantMsg.tool_calls[0].type).toBe("function");
    expect(assistantMsg.tool_calls[0].function.name).toBe("get_weather");
    expect(assistantMsg.tool_calls[0].function.arguments).toBe('{"city":"北京"}');

    // tool 消息应包含 tool_call_id
    const toolMsg = body.messages[2];
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("call_1");
  });

  it("无 tools 时不包含 tools 字段", () => {
    const { init } = buildOpenAIRequest(config, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    const body = JSON.parse(init.body as string);
    expect(body.tools).toBeUndefined();
  });

  it("应设置 stream 和 stream_options", () => {
    const { init } = buildOpenAIRequest(config, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});

// 辅助函数：创建 mock ReadableStreamDefaultReader
function createMockReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: async () => {
      if (index < chunks.length) {
        return { done: false, value: encoder.encode(chunks[index++]) };
      }
      return { done: true, value: undefined } as any;
    },
    cancel: async () => {},
    closed: Promise.resolve(undefined),
    releaseLock: () => {},
  };
}

describe("parseOpenAIStream", () => {
  it("应正确解析 content_delta 事件", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "content_delta", delta: "Hello" });
    expect(events[1]).toEqual({ type: "content_delta", delta: " World" });
    expect(events[2]).toEqual({ type: "done" });
  });

  it("应正确解析 tool_call_start 和 tool_call_delta", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"city\\""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":":\\"北京\\"}"}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events[0].type).toBe("tool_call_start");
    if (events[0].type === "tool_call_start") {
      expect(events[0].toolCall.name).toBe("get_weather");
      expect(events[0].toolCall.id).toBe("call_1");
    }
    expect(events[1].type).toBe("tool_call_delta");
    expect(events[2].type).toBe("tool_call_delta");
  });

  it("应正确处理 usage 信息", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(2);
    expect(events[1].type).toBe("done");
    if (events[1].type === "done") {
      expect(events[1].usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    }
  });

  it("应正确处理含 cached_tokens 的 usage 信息", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":80}}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(2);
    expect(events[1].type).toBe("done");
    if (events[1].type === "done") {
      expect(events[1].usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 80 });
    }
  });

  it("应正确处理 API 错误响应", async () => {
    const reader = createMockReader(['data: {"error":{"message":"Rate limit exceeded"}}\n\n']);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].message).toBe("Rate limit exceeded");
    }
  });

  it("应忽略无 choices 的事件", async () => {
    const reader = createMockReader([
      'data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk"}\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "content_delta", delta: "ok" });
  });

  it("应忽略无法解析的 JSON", async () => {
    const reader = createMockReader([
      "data: {invalid json\n\n",
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "content_delta", delta: "ok" });
  });

  it("signal 已中止时应停止读取", async () => {
    const controller = new AbortController();
    controller.abort();

    const reader = createMockReader(['data: {"choices":[{"delta":{"content":"hello"}}]}\n\n']);

    const events: ChatStreamEvent[] = [];
    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(0);
  });

  it("读取错误时应发送 error 事件", async () => {
    const reader = {
      read: async () => {
        throw new Error("Network error");
      },
      cancel: async () => {},
      closed: Promise.resolve(undefined),
      releaseLock: () => {},
    } as any;

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].message).toBe("Network error");
    }
  });

  it("读取错误但 signal 已中止时不应发送 error 事件", async () => {
    const controller = new AbortController();
    const reader = {
      read: async () => {
        controller.abort();
        throw new Error("Aborted");
      },
      cancel: async () => {},
      closed: Promise.resolve(undefined),
      releaseLock: () => {},
    } as any;

    const events: ChatStreamEvent[] = [];
    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(0);
  });

  it("应正确解析 reasoning_content 为 thinking_delta 事件", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":"让我思考"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"一下这个问题"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"这是答案"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: "thinking_delta", delta: "让我思考" });
    expect(events[1]).toEqual({ type: "thinking_delta", delta: "一下这个问题" });
    expect(events[2]).toEqual({ type: "content_delta", delta: "这是答案" });
    expect(events[3]).toEqual({ type: "done" });
  });

  it("reasoning_content 和 content 同时存在时应同时发出两个事件", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"reasoning_content":"思考中","content":"回答"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "thinking_delta", delta: "思考中" });
    expect(events[1]).toEqual({ type: "content_delta", delta: "回答" });
  });

  it("最后一个 chunk 同时包含 usage 和 choices 时应先处理 choices 再处理 usage", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"search","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"q\\":\\"test\\"}"}}]}}]}\n\n',
      // 最后一个 chunk 同时包含 choices（finish_reason）和 usage
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":100,"completion_tokens":20}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    // tool_call_start, tool_call_delta, done(with usage)
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("tool_call_start");
    expect(events[1].type).toBe("tool_call_delta");
    expect(events[2].type).toBe("done");
    if (events[2].type === "done") {
      expect(events[2].usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    }
  });

  it("最后一个 chunk 同时包含 usage 和 tool_call 增量时不应丢失 tool_call 数据", async () => {
    // 模拟实际场景：最后一个 chunk 携带 tool_call arguments 增量 + usage
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"dom_read_page","arguments":"{\\"tabId\\":123"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":",\\"mode\\":\\"summary\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":40010,"completion_tokens":154}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("tool_call_start");
    if (events[0].type === "tool_call_start") {
      expect(events[0].toolCall.name).toBe("dom_read_page");
      expect(events[0].toolCall.arguments).toBe('{"tabId":123');
    }
    // 关键：最后的 tool_call_delta 不应被 usage 检查吞掉
    expect(events[1].type).toBe("tool_call_delta");
    if (events[1].type === "tool_call_delta") {
      expect(events[1].delta).toBe(',"mode":"summary"}');
    }
    expect(events[2].type).toBe("done");
    if (events[2].type === "done") {
      expect(events[2].usage).toEqual({ inputTokens: 40010, outputTokens: 154 });
    }
  });

  it("每个 chunk 都带 usage 时不应提前终止流（Grok 兼容）", async () => {
    // Grok API 在每个 chunk 都附带 usage，不应被当作结束信号
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"content":"很"},"finish_reason":null,"index":0}],"usage":{"prompt_tokens":100,"completion_tokens":1}}\n\n',
      'data: {"choices":[{"delta":{"content":"抱"},"finish_reason":null,"index":0}],"usage":{"prompt_tokens":100,"completion_tokens":2}}\n\n',
      'data: {"choices":[{"delta":{"content":"歉"},"finish_reason":null,"index":0}],"usage":{"prompt_tokens":100,"completion_tokens":3}}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":100,"completion_tokens":3}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    // 应收到 3 个 content_delta + 1 个 done（带最终 usage）
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: "content_delta", delta: "很" });
    expect(events[1]).toEqual({ type: "content_delta", delta: "抱" });
    expect(events[2]).toEqual({ type: "content_delta", delta: "歉" });
    expect(events[3].type).toBe("done");
    if (events[3].type === "done") {
      expect(events[3].usage).toEqual({ inputTokens: 100, outputTokens: 3 });
    }
  });

  it("每个 chunk 都带 usage 且无 [DONE] 时应在流结束时发出 done", async () => {
    // 某些 API 在所有 chunk 带 usage 但不发 [DONE]
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}],"usage":{"prompt_tokens":50,"completion_tokens":1}}\n\n',
      'data: {"choices":[{"delta":{"content":"世界"},"finish_reason":null}],"usage":{"prompt_tokens":50,"completion_tokens":2}}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":50,"completion_tokens":2}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "content_delta", delta: "你好" });
    expect(events[1]).toEqual({ type: "content_delta", delta: "世界" });
    expect(events[2].type).toBe("done");
    if (events[2].type === "done") {
      expect(events[2].usage).toEqual({ inputTokens: 50, outputTokens: 2 });
    }
  });

  it("reasoning_content 后跟 tool_calls 应都正确解析", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":"分析页面"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"结构"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"dom_read_page","arguments":"{\\"selector\\":\\".item\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":500,"completion_tokens":50}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseOpenAIStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: "thinking_delta", delta: "分析页面" });
    expect(events[1]).toEqual({ type: "thinking_delta", delta: "结构" });
    expect(events[2].type).toBe("tool_call_start");
    expect(events[3].type).toBe("done");
    if (events[3].type === "done") {
      expect(events[3].usage).toEqual({ inputTokens: 500, outputTokens: 50 });
    }
  });
});
