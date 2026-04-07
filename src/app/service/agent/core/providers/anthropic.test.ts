import { describe, it, expect } from "vitest";
import { buildAnthropicRequest, parseAnthropicStream } from "./anthropic";
import type { AgentModelConfig } from "../types";
import type { ChatRequest, ChatStreamEvent } from "../types";

const config: AgentModelConfig = {
  id: "test",
  name: "Test",
  provider: "anthropic",
  apiBaseUrl: "https://api.anthropic.com",
  apiKey: "sk-ant-test",
  model: "claude-sonnet-4-20250514",
};

describe("buildAnthropicRequest", () => {
  it("多个 system 消息应合并为单个", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [
        { role: "system", content: "你是助手" },
        { role: "system", content: "请用中文回答" },
        { role: "user", content: "你好" },
      ],
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);

    expect(body.system).toEqual([
      { type: "text", text: "你是助手" },
      { type: "text", text: "请用中文回答", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
  });

  it("无 system 消息时不包含 system 字段", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);
    expect(body.system).toBeUndefined();
  });

  it("apiBaseUrl 为空时使用默认 URL", () => {
    const noBaseConfig = { ...config, apiBaseUrl: "" };
    const { url } = buildAnthropicRequest(noBaseConfig, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("assistant 消息带 toolCalls 时应转换为 content blocks 格式", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [
        { role: "user", content: "天气" },
        {
          role: "assistant",
          content: "让我查一下",
          toolCalls: [{ id: "toolu_1", name: "get_weather", arguments: '{"city":"北京"}' }],
        },
        { role: "tool", content: '{"temp":25}', toolCallId: "toolu_1" },
      ],
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);

    // messages[0] 是 user, messages[1] 是 assistant
    const assistantMsg = body.messages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toHaveLength(2);
    expect(assistantMsg.content[0]).toEqual({ type: "text", text: "让我查一下" });
    expect(assistantMsg.content[1].type).toBe("tool_use");
    expect(assistantMsg.content[1].name).toBe("get_weather");
    expect(assistantMsg.content[1].input).toEqual({ city: "北京" });
  });

  it("assistant 消息仅有 toolCalls 无 content 时不应包含 text block", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [
        { role: "user", content: "天气" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "toolu_1", name: "get_weather", arguments: '{"city":"北京"}' }],
        },
      ],
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);

    // messages[0] 是 user "天气", messages[1] 是 assistant
    const assistantMsg = body.messages[1];
    expect(assistantMsg.content).toHaveLength(1);
    expect(assistantMsg.content[0].type).toBe("tool_use");
  });

  it("应设置正确的 Anthropic 头", () => {
    const { init } = buildAnthropicRequest(config, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("工具定义应使用 input_schema 而非 parameters", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "test_tool",
          description: "测试",
          parameters: { type: "object", properties: { x: { type: "number" } } },
        },
      ],
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);

    expect(body.tools[0].input_schema).toBeDefined();
    expect(body.tools[0].parameters).toBeUndefined();
    expect(body.tools[0].type).toBeUndefined();
    // 最后一个工具应带 cache_control
    expect(body.tools[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("cache: false 时不应添加 cache_control", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [
        { role: "system", content: "你是助手" },
        { role: "user", content: "hi" },
      ],
      tools: [
        {
          name: "test_tool",
          description: "测试",
          parameters: { type: "object", properties: { x: { type: "number" } } },
        },
      ],
      cache: false,
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);

    // system block 不应有 cache_control
    expect(body.system[0].cache_control).toBeUndefined();
    // tool 不应有 cache_control
    expect(body.tools[0].cache_control).toBeUndefined();
  });

  it("默认 max_tokens 为 16384，应设置 stream", () => {
    const { init } = buildAnthropicRequest(config, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(16384);
    expect(body.stream).toBe(true);
  });

  it("配置 maxTokens 时应设置 max_tokens", () => {
    const configWithMax = { ...config, maxTokens: 4096 };
    const { init } = buildAnthropicRequest(configWithMax, {
      conversationId: "c1",
      modelId: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(4096);
  });

  it("tool 消息无 toolCallId 时应按普通消息处理", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [
        { role: "user", content: "hi" },
        { role: "tool", content: "result" }, // 无 toolCallId
      ],
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);

    // 无 toolCallId 时不转换为 tool_result
    const toolMsg = body.messages[1];
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.content).toBe("result");
  });

  it("assistant toolCalls 中 arguments 格式错误时应降级为空对象", () => {
    const request: ChatRequest = {
      conversationId: "c1",
      modelId: "test",
      messages: [
        { role: "user", content: "天气" },
        {
          role: "assistant",
          content: "让我查一下",
          toolCalls: [{ id: "toolu_1", name: "get_weather", arguments: "not json" }],
        },
      ],
    };

    const { init } = buildAnthropicRequest(config, request);
    const body = JSON.parse(init.body as string);

    const assistantMsg = body.messages[1];
    expect(assistantMsg.content[1].type).toBe("tool_use");
    // 格式错误的 JSON 应降级为空对象
    expect(assistantMsg.content[1].input).toEqual({});
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

describe("parseAnthropicStream", () => {
  it("应正确解析 content_block_delta (text_delta)", async () => {
    const reader = createMockReader([
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":" World"}}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "content_delta", delta: "Hello" });
    expect(events[1]).toEqual({ type: "content_delta", delta: " World" });
    expect(events[2]).toEqual({ type: "done" });
  });

  it("应正确解析 tool_use 事件", async () => {
    const reader = createMockReader([
      'event: content_block_start\ndata: {"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather"}}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"input_json_delta","partial_json":"{\\"city\\""}}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"input_json_delta","partial_json":":\\"北京\\"}"}}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events[0].type).toBe("tool_call_start");
    if (events[0].type === "tool_call_start") {
      expect(events[0].toolCall.id).toBe("toolu_1");
      expect(events[0].toolCall.name).toBe("get_weather");
      expect(events[0].toolCall.arguments).toBe("");
    }
    expect(events[1].type).toBe("tool_call_delta");
    expect(events[2].type).toBe("tool_call_delta");
  });

  it("应正确解析 thinking_delta 事件", async () => {
    const reader = createMockReader([
      'event: content_block_start\ndata: {"content_block":{"type":"thinking"}}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"让我想想..."}}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events[0]).toEqual({ type: "thinking_delta", delta: "让我想想..." });
    expect(events[1]).toEqual({ type: "done" });
  });

  it("应正确处理 message_delta 中的 usage", async () => {
    const reader = createMockReader([
      'event: message_delta\ndata: {"usage":{"input_tokens":100,"output_tokens":50}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
    if (events[0].type === "done") {
      expect(events[0].usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: undefined,
        cacheReadInputTokens: undefined,
      });
    }
  });

  it("应合并 message_start 和 message_delta 的 usage（含 cache 信息）", async () => {
    const reader = createMockReader([
      'event: message_start\ndata: {"message":{"usage":{"input_tokens":200,"cache_creation_input_tokens":50,"cache_read_input_tokens":100}}}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"hi"}}\n\n',
      'event: message_delta\ndata: {"usage":{"output_tokens":30}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "content_delta", delta: "hi" });
    expect(events[1].type).toBe("done");
    if (events[1].type === "done") {
      expect(events[1].usage).toEqual({
        inputTokens: 200,
        outputTokens: 30,
        cacheCreationInputTokens: 50,
        cacheReadInputTokens: 100,
      });
    }
  });

  it("应正确处理 error 事件", async () => {
    const reader = createMockReader(['event: error\ndata: {"error":{"message":"Overloaded"}}\n\n']);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].message).toBe("Overloaded");
    }
  });

  it("error 事件无 message 时使用默认错误信息", async () => {
    const reader = createMockReader(['event: error\ndata: {"error":{}}\n\n']);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].message).toBe("Anthropic API error");
    }
  });

  it("signal 已中止时应停止读取", async () => {
    const controller = new AbortController();
    controller.abort();

    const reader = createMockReader([
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"hi"}}\n\n',
    ]);

    const events: ChatStreamEvent[] = [];
    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(0);
  });

  it("读取错误时应发送 error 事件", async () => {
    const reader = {
      read: async () => {
        throw new Error("Connection reset");
      },
      cancel: async () => {},
      closed: Promise.resolve(undefined),
      releaseLock: () => {},
    } as any;

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].message).toBe("Connection reset");
    }
  });

  it("读取错误但 signal 已中止时不应发送 error", async () => {
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
    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events).toHaveLength(0);
  });

  it("应正确解析图片生成流（content_block_start image → image_delta → content_block_stop）", async () => {
    const reader = createMockReader([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"image","source":{"type":"base64","media_type":"image/png"}}}\n\n',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"image_delta","data":"iVBORw0KGgo"}}\n\n',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"image_delta","data":"AAAANSUhEUg"}}\n\n',
      'event: content_block_stop\ndata: {"index":0}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    // 1. content_block_start
    expect(events[0].type).toBe("content_block_start");
    if (events[0].type === "content_block_start") {
      expect(events[0].block.type).toBe("image");
      expect(events[0].block.mimeType).toBe("image/png");
    }

    // 2. content_block_complete（base64 拼接）
    expect(events[1].type).toBe("content_block_complete");
    if (events[1].type === "content_block_complete") {
      expect(events[1].block.type).toBe("image");
      expect(events[1].block.mimeType).toBe("image/png");
      expect(events[1].block.attachmentId).toBeTruthy();
      expect(events[1].data).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg");
    }

    // 3. done
    expect(events[2]).toEqual({ type: "done" });
  });

  it("图片生成后应正常处理后续文本", async () => {
    const reader = createMockReader([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"image","source":{"type":"base64","media_type":"image/jpeg"}}}\n\n',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"image_delta","data":"/9j/4AAQ"}}\n\n',
      'event: content_block_stop\ndata: {"index":0}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"这是生成的图片"}}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events[0].type).toBe("content_block_start");
    expect(events[1].type).toBe("content_block_complete");
    if (events[1].type === "content_block_complete") {
      expect(events[1].data).toBe("data:image/jpeg;base64,/9j/4AAQ");
    }
    expect(events[2]).toEqual({ type: "content_delta", delta: "这是生成的图片" });
    expect(events[3]).toEqual({ type: "done" });
  });

  it("非图片的 content_block_stop 不应触发图片完成事件", async () => {
    const reader = createMockReader([
      'event: content_block_start\ndata: {"content_block":{"type":"thinking"}}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"思考中"}}\n\n',
      'event: content_block_stop\ndata: {"index":0}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    expect(events[0]).toEqual({ type: "thinking_delta", delta: "思考中" });
    // content_block_stop 不应产生 content_block_complete
    expect(events[1]).toEqual({ type: "done" });
  });

  it("图片块 source 缺少 media_type 时应默认使用 image/png", async () => {
    const reader = createMockReader([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"image","source":{"type":"base64"}}}\n\n',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"image_delta","data":"AAAA"}}\n\n',
      'event: content_block_stop\ndata: {"index":0}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    if (events[0].type === "content_block_start") {
      expect(events[0].block.mimeType).toBe("image/png");
    }
    if (events[1].type === "content_block_complete") {
      expect(events[1].block.mimeType).toBe("image/png");
      expect(events[1].data).toBe("data:image/png;base64,AAAA");
    }
  });

  it("应忽略无法解析的 JSON 数据", async () => {
    const reader = createMockReader([
      "event: content_block_delta\ndata: {bad json\n\n",
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"ok"}}\n\n',
      "event: message_stop\ndata: {}\n\n",
    ]);

    const events: ChatStreamEvent[] = [];
    const controller = new AbortController();

    await parseAnthropicStream(reader, (e) => events.push(e), controller.signal);

    // 第一个 JSON 解析失败应忽略
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "content_delta", delta: "ok" });
  });
});
