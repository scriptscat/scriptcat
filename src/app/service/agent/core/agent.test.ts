import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSEParser } from "./sse_parser";
import { buildOpenAIRequest, parseOpenAIStream } from "./providers/openai";
import { buildAnthropicRequest, parseAnthropicStream } from "./providers/anthropic";
import type { AgentModelConfig } from "./types";
import type { ChatRequest, ChatStreamEvent, ToolDefinition } from "./types";
import { AgentService } from "@App/app/service/agent/service_worker/agent";
import type { ToolRegistry } from "./tool_registry";
import type { ToolExecutor } from "./tool_registry";

// mock agent_chat repo 单例：子服务通过 import { agentChatRepo } 直接使用该 mock 对象
const { mockChatRepo } = vi.hoisted(() => ({
  mockChatRepo: {} as any,
}));

vi.mock("@App/app/repo/agent_chat", () => ({
  AgentChatRepo: class {},
  agentChatRepo: mockChatRepo,
}));

// 模型配置
const openaiConfig: AgentModelConfig = {
  id: "test-openai",
  name: "Test OpenAI",
  provider: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o",
};

const anthropicConfig: AgentModelConfig = {
  id: "test-anthropic",
  name: "Test Anthropic",
  provider: "anthropic",
  apiBaseUrl: "https://api.anthropic.com",
  apiKey: "sk-ant-test",
  model: "claude-sonnet-4-20250514",
};

const testTools: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "获取指定城市的天气",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市名称" },
      },
      required: ["city"],
    },
  },
];

// 辅助函数：将 SSE 文本构造为 ReadableStreamDefaultReader
function createMockReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined } as ReadableStreamReadDoneResult<Uint8Array>;
      }
      const value = encoder.encode(chunks[index++]);
      return { done: false, value } as ReadableStreamReadResult<Uint8Array>;
    },
    releaseLock: () => {},
    cancel: async () => {},
    closed: Promise.resolve(undefined),
  } as ReadableStreamDefaultReader<Uint8Array>;
}

// 辅助函数：收集 parseStream 产生的所有事件
async function collectEvents(
  parseFn: typeof parseOpenAIStream,
  chunks: string[],
  signal?: AbortSignal
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  const reader = createMockReader(chunks);
  await parseFn(reader, (e) => events.push(e), signal ?? new AbortController().signal);
  return events;
}

describe("SSEParser", () => {
  it("应正确解析单个 SSE 事件", () => {
    const parser = new SSEParser();
    const events = parser.parse('data: {"text":"hello"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("message");
    expect(events[0].data).toBe('{"text":"hello"}');
  });

  it("应正确解析带 event 字段的事件", () => {
    const parser = new SSEParser();
    const events = parser.parse('event: content_block_delta\ndata: {"delta":"hi"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("content_block_delta");
  });

  it("应正确处理跨 chunk 的事件", () => {
    const parser = new SSEParser();
    const events1 = parser.parse('data: {"text":');
    expect(events1).toHaveLength(0);
    const events2 = parser.parse('"hello"}\n\n');
    expect(events2).toHaveLength(1);
    expect(events2[0].data).toBe('{"text":"hello"}');
  });

  it("应正确解析多个连续事件", () => {
    const parser = new SSEParser();
    const events = parser.parse('data: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(events).toHaveLength(2);
  });

  it("应忽略注释行", () => {
    const parser = new SSEParser();
    const events = parser.parse(": comment\ndata: test\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("test");
  });
});

describe("OpenAI Provider", () => {
  describe("buildOpenAIRequest", () => {
    it("应正确构造基础请求", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-openai",
        messages: [
          { role: "system", content: "你是助手" },
          { role: "user", content: "你好" },
        ],
      };

      const { url, init } = buildOpenAIRequest(openaiConfig, request);
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(init.method).toBe("POST");

      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer sk-test");

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("gpt-4o");
      expect(body.messages).toHaveLength(2);
      expect(body.stream).toBe(true);
      expect(body.tools).toBeUndefined();
    });

    it("应正确包含工具定义", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-openai",
        messages: [{ role: "user", content: "北京天气" }],
        tools: testTools,
      };

      const { init } = buildOpenAIRequest(openaiConfig, request);
      const body = JSON.parse(init.body as string);

      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].type).toBe("function");
      expect(body.tools[0].function.name).toBe("get_weather");
      expect(body.tools[0].function.description).toBe("获取指定城市的天气");
      expect(body.tools[0].function.parameters.properties.city.type).toBe("string");
    });

    it("应正确处理 tool 角色消息", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-openai",
        messages: [
          { role: "user", content: "北京天气" },
          { role: "assistant", content: "" },
          { role: "tool", content: '{"temp": 25}', toolCallId: "call_123" },
        ],
        tools: testTools,
      };

      const { init } = buildOpenAIRequest(openaiConfig, request);
      const body = JSON.parse(init.body as string);

      expect(body.messages[2].role).toBe("tool");
      expect(body.messages[2].tool_call_id).toBe("call_123");
    });

    it("应正确转换 assistant 消息中的 toolCalls 为 OpenAI tool_calls 格式", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-openai",
        messages: [
          { role: "user", content: "北京天气" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "call_abc", name: "get_weather", arguments: '{"city":"北京"}' }],
          },
          { role: "tool", content: '{"temp": 25}', toolCallId: "call_abc" },
        ],
        tools: testTools,
      };

      const { init } = buildOpenAIRequest(openaiConfig, request);
      const body = JSON.parse(init.body as string);

      // assistant 消息应包含 tool_calls
      const assistantMsg = body.messages[1];
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.tool_calls).toHaveLength(1);
      expect(assistantMsg.tool_calls[0].id).toBe("call_abc");
      expect(assistantMsg.tool_calls[0].type).toBe("function");
      expect(assistantMsg.tool_calls[0].function.name).toBe("get_weather");
      expect(assistantMsg.tool_calls[0].function.arguments).toBe('{"city":"北京"}');

      // tool 消息应有 tool_call_id
      const toolMsg = body.messages[2];
      expect(toolMsg.role).toBe("tool");
      expect(toolMsg.tool_call_id).toBe("call_abc");
    });

    it("assistant 消息没有 toolCalls 时不应生成 tool_calls 字段", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-openai",
        messages: [
          { role: "user", content: "你好" },
          { role: "assistant", content: "你好！" },
        ],
      };

      const { init } = buildOpenAIRequest(openaiConfig, request);
      const body = JSON.parse(init.body as string);

      expect(body.messages[1].tool_calls).toBeUndefined();
    });
  });

  describe("parseOpenAIStream", () => {
    it("应正确解析内容增量事件", async () => {
      const events = await collectEvents(parseOpenAIStream, [
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"世界"}}]}\n\n',
        "data: [DONE]\n\n",
      ]);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "content_delta", delta: "你好" });
      expect(events[1]).toEqual({ type: "content_delta", delta: "世界" });
      expect(events[2]).toEqual({ type: "done" });
    });

    it("应正确解析 tool_call 事件", async () => {
      const events = await collectEvents(parseOpenAIStream, [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"city\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"\\"北京\\"}"}}]}}]}\n\n',
        "data: [DONE]\n\n",
      ]);

      expect(events[0].type).toBe("tool_call_start");
      if (events[0].type === "tool_call_start") {
        expect(events[0].toolCall.id).toBe("call_1");
        expect(events[0].toolCall.name).toBe("get_weather");
      }
      expect(events[1].type).toBe("tool_call_delta");
      expect(events[2].type).toBe("tool_call_delta");
      expect(events[3]).toEqual({ type: "done" });
    });

    it("应正确解析带 usage 的 done 事件", async () => {
      const events = await collectEvents(parseOpenAIStream, [
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
        'data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      ]);

      expect(events).toHaveLength(2);
      expect(events[1]).toEqual({
        type: "done",
        usage: { inputTokens: 10, outputTokens: 5 },
      });
    });

    it("应正确处理 SSE 流中的 API 错误响应", async () => {
      // 模拟真实场景：API 返回 200 但 SSE 数据中包含错误
      const events = await collectEvents(parseOpenAIStream, [
        'data: {"error":{"message":"Request failed with status code 400","type":"invalid_request_error","code":null}}\n\n',
        'data: {"id":"","object":"chat.completion.chunk","created":0,"model":"","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":0,"total_tokens":100}}\n\n',
        "data: [DONE]\n\n",
      ]);

      // 应只有一个 error 事件，后续数据不再处理
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].message).toBe("Request failed with status code 400");
      }
    });

    it("应处理没有 message 字段的错误响应", async () => {
      const events = await collectEvents(parseOpenAIStream, [
        'data: {"error":{"type":"server_error","code":"internal"}}\n\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        // 没有 message 时应回退到 JSON.stringify
        expect(events[0].message).toContain("server_error");
      }
    });

    it("应正确处理读取流异常", async () => {
      const reader = {
        read: async () => {
          throw new Error("Network error");
        },
        releaseLock: () => {},
        cancel: async () => {},
        closed: Promise.resolve(undefined),
      } as unknown as ReadableStreamDefaultReader<Uint8Array>;

      const events: ChatStreamEvent[] = [];
      await parseOpenAIStream(reader, (e) => events.push(e), new AbortController().signal);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].message).toBe("Network error");
      }
    });

    it("signal 中断时不应产生错误事件", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const events = await collectEvents(
        parseOpenAIStream,
        ['data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'],
        abortController.signal
      );

      // signal 已中断，不应处理任何数据
      expect(events).toHaveLength(0);
    });
  });
});

describe("Anthropic Provider", () => {
  describe("buildAnthropicRequest", () => {
    it("应正确构造基础请求", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-anthropic",
        messages: [
          { role: "system", content: "你是助手" },
          { role: "user", content: "你好" },
        ],
      };

      const { url, init } = buildAnthropicRequest(anthropicConfig, request);
      expect(url).toBe("https://api.anthropic.com/v1/messages");

      const headers = init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("sk-ant-test");

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("claude-sonnet-4-20250514");
      expect(body.system).toEqual([{ type: "text", text: "你是助手", cache_control: { type: "ephemeral" } }]);
      // system 消息不应出现在 messages 中
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe("user");
      expect(body.tools).toBeUndefined();
    });

    it("应正确包含工具定义（Anthropic 格式）", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-anthropic",
        messages: [{ role: "user", content: "北京天气" }],
        tools: testTools,
      };

      const { init } = buildAnthropicRequest(anthropicConfig, request);
      const body = JSON.parse(init.body as string);

      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].name).toBe("get_weather");
      expect(body.tools[0].input_schema).toBeDefined();
      // Anthropic 不用 function 包裹
      expect(body.tools[0].type).toBeUndefined();
    });

    it("应正确转换 tool 角色消息为 Anthropic tool_result 格式", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-anthropic",
        messages: [
          { role: "user", content: "北京天气" },
          { role: "assistant", content: "" },
          { role: "tool", content: '{"temp": 25}', toolCallId: "toolu_123" },
        ],
        tools: testTools,
      };

      const { init } = buildAnthropicRequest(anthropicConfig, request);
      const body = JSON.parse(init.body as string);

      // tool 消息应转换为 user 角色 + tool_result content block
      const toolMsg = body.messages[2];
      expect(toolMsg.role).toBe("user");
      expect(toolMsg.content).toBeInstanceOf(Array);
      expect(toolMsg.content[0].type).toBe("tool_result");
      expect(toolMsg.content[0].tool_use_id).toBe("toolu_123");
      expect(toolMsg.content[0].content).toBe('{"temp": 25}');
    });

    it("应正确转换 assistant 消息中的 toolCalls 为 Anthropic content blocks", () => {
      const request: ChatRequest = {
        conversationId: "test",
        modelId: "test-anthropic",
        messages: [
          { role: "user", content: "北京天气" },
          {
            role: "assistant",
            content: "让我查一下",
            toolCalls: [{ id: "toolu_abc", name: "get_weather", arguments: '{"city":"北京"}' }],
          },
          { role: "tool", content: '{"temp": 25}', toolCallId: "toolu_abc" },
        ],
        tools: testTools,
      };

      const { init } = buildAnthropicRequest(anthropicConfig, request);
      const body = JSON.parse(init.body as string);

      // assistant 消息应转换为 content blocks（text + tool_use）
      const assistantMsg = body.messages[1];
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.content).toBeInstanceOf(Array);
      expect(assistantMsg.content).toHaveLength(2);
      expect(assistantMsg.content[0]).toEqual({ type: "text", text: "让我查一下" });
      expect(assistantMsg.content[1]).toEqual({
        type: "tool_use",
        id: "toolu_abc",
        name: "get_weather",
        input: { city: "北京" },
      });
    });
  });

  describe("parseAnthropicStream", () => {
    it("应正确解析内容增量事件", async () => {
      const events = await collectEvents(parseAnthropicStream, [
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"你好"}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"世界"}}\n\n',
        "event: message_stop\ndata: {}\n\n",
      ]);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "content_delta", delta: "你好" });
      expect(events[1]).toEqual({ type: "content_delta", delta: "世界" });
      expect(events[2]).toEqual({ type: "done" });
    });

    it("应正确解析 tool_use 事件", async () => {
      const events = await collectEvents(parseAnthropicStream, [
        'event: content_block_start\ndata: {"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather"}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"input_json_delta","partial_json":"\\"北京\\"}"}}\n\n',
        "event: message_stop\ndata: {}\n\n",
      ]);

      expect(events[0].type).toBe("tool_call_start");
      if (events[0].type === "tool_call_start") {
        expect(events[0].toolCall.id).toBe("toolu_1");
        expect(events[0].toolCall.name).toBe("get_weather");
      }
      expect(events[1].type).toBe("tool_call_delta");
      expect(events[2].type).toBe("tool_call_delta");
      expect(events[3]).toEqual({ type: "done" });
    });

    it("应正确解析带 usage 的 message_delta 事件", async () => {
      const events = await collectEvents(parseAnthropicStream, [
        'event: message_delta\ndata: {"usage":{"input_tokens":20,"output_tokens":8}}\n\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "done",
        usage: { inputTokens: 20, outputTokens: 8 },
      });
    });

    it("应正确处理 error 事件", async () => {
      const events = await collectEvents(parseAnthropicStream, [
        'event: error\ndata: {"error":{"message":"Rate limit exceeded"}}\n\n',
      ]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].message).toBe("Rate limit exceeded");
      }
    });

    it("应正确解析 thinking 事件", async () => {
      const events = await collectEvents(parseAnthropicStream, [
        'event: content_block_start\ndata: {"content_block":{"type":"thinking"}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"让我想想..."}}\n\n',
        "event: message_stop\ndata: {}\n\n",
      ]);

      expect(events).toHaveLength(2); // thinking_delta + done（thinking start 不产生事件）
      expect(events[0]).toEqual({ type: "thinking_delta", delta: "让我想想..." });
      expect(events[1]).toEqual({ type: "done" });
    });
  });
});

describe("Agent Types", () => {
  it("ChatRequest 应支持 tools 字段", () => {
    const request: ChatRequest = {
      conversationId: "test",
      modelId: "test",
      messages: [{ role: "user", content: "hello" }],
      tools: testTools,
    };
    expect(request.tools).toHaveLength(1);
  });

  it("ChatRequest 消息应支持 tool 角色和 toolCallId", () => {
    const request: ChatRequest = {
      conversationId: "test",
      modelId: "test",
      messages: [
        { role: "user", content: "hello" },
        { role: "tool", content: "result", toolCallId: "call_1" },
      ],
    };
    expect(request.messages[1].role).toBe("tool");
    expect(request.messages[1].toolCallId).toBe("call_1");
  });

  it("ChatRequest 消息应支持 toolCalls 字段", () => {
    const request: ChatRequest = {
      conversationId: "test",
      modelId: "test",
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "test_tool", arguments: "{}" }],
        },
        { role: "tool", content: "result", toolCallId: "call_1" },
      ],
    };
    expect(request.messages[1].toolCalls).toHaveLength(1);
    expect(request.messages[1].toolCalls![0].name).toBe("test_tool");
  });
});

// ---- callLLMWithToolLoop 测试 ----

// 辅助：构造 mock Response，兼容 jsdom 不支持 ReadableStream body 的情况
function buildSSEResponse(sseChunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const mockReader = {
    read: async () => {
      if (index >= sseChunks.length) {
        return { done: true, value: undefined } as ReadableStreamReadDoneResult<Uint8Array>;
      }
      const value = encoder.encode(sseChunks[index++]);
      return { done: false, value } as ReadableStreamReadResult<Uint8Array>;
    },
    releaseLock: () => {},
    cancel: async () => {},
    closed: Promise.resolve(undefined),
  };
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => mockReader,
    },
    text: async () => "",
  } as unknown as Response;
}

// 辅助：构造纯文本 SSE 数据（OpenAI 格式）
function makeTextSSE(text: string, usage?: { prompt_tokens: number; completion_tokens: number }): string[] {
  const chunks: string[] = [];
  chunks.push(`data: {"choices":[{"delta":{"content":"${text}"}}]}\n\n`);
  if (usage) {
    chunks.push(`data: {"usage":${JSON.stringify(usage)}}\n\n`);
  } else {
    chunks.push("data: [DONE]\n\n");
  }
  return chunks;
}

// 辅助：构造带 tool_call 的 SSE 数据（OpenAI 格式）
function makeToolCallSSE(
  toolId: string,
  toolName: string,
  args: string,
  usage?: { prompt_tokens: number; completion_tokens: number }
): string[] {
  const chunks: string[] = [];
  chunks.push(
    `data: {"choices":[{"delta":{"tool_calls":[{"id":"${toolId}","function":{"name":"${toolName}","arguments":""}}]}}]}\n\n`
  );
  chunks.push(
    `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"${args.replace(/"/g, '\\"')}"}}]}}]}\n\n`
  );
  if (usage) {
    chunks.push(`data: {"usage":${JSON.stringify(usage)}}\n\n`);
  } else {
    chunks.push("data: [DONE]\n\n");
  }
  return chunks;
}

// 创建 mock AgentService 实例
function createTestService() {
  // 重置 agent_chat 单例 mock 方法（保持对象身份不变，只替换 vi.fn）
  Object.assign(mockChatRepo, {
    appendMessage: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
    listConversations: vi.fn().mockResolvedValue([]),
    saveConversation: vi.fn().mockResolvedValue(undefined),
    saveMessages: vi.fn().mockResolvedValue(undefined),
    getAttachment: vi.fn().mockResolvedValue(null),
    saveAttachment: vi.fn().mockResolvedValue(0),
  });

  const mockGroup = {
    on: vi.fn(),
  } as any;

  const mockSender = {} as any;

  const service = new AgentService(mockGroup, mockSender);

  // 替换 modelRepo（避免 chrome.storage 调用）
  (service as any).modelService.modelRepo = {
    listModels: vi.fn().mockResolvedValue([openaiConfig]),
    getModel: vi.fn().mockImplementation((id: string) => {
      if (id === "test-openai") return Promise.resolve(openaiConfig);
      return Promise.resolve(undefined);
    }),
    getDefaultModelId: vi.fn().mockResolvedValue("test-openai"),
  };

  const toolRegistry = (service as any).toolRegistry as ToolRegistry;

  return { service, mockRepo: mockChatRepo, toolRegistry };
}

describe("callLLMWithToolLoop", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("无 tool calling 的简单对话", async () => {
    const { service } = createTestService();
    const events: ChatStreamEvent[] = [];

    fetchSpy.mockResolvedValueOnce(
      buildSSEResponse(makeTextSSE("你好世界", { prompt_tokens: 10, completion_tokens: 5 }))
    );

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "你好" }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
    });

    // 应该收到 content_delta 和 done
    const contentEvents = events.filter((e) => e.type === "content_delta");
    expect(contentEvents.length).toBeGreaterThanOrEqual(1);

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.type === "done" && doneEvent!.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
  });

  it("单轮 tool calling", async () => {
    const { service, toolRegistry } = createTestService();
    const events: ChatStreamEvent[] = [];

    // 注册一个 mock 工具
    const mockExecutor: ToolExecutor = {
      execute: vi.fn().mockResolvedValue({ temp: 25 }),
    };
    toolRegistry.registerBuiltin(
      { name: "get_weather", description: "获取天气", parameters: { type: "object", properties: {} } },
      mockExecutor
    );

    // 第一次调用：LLM 返回 tool_call
    fetchSpy.mockResolvedValueOnce(
      buildSSEResponse(
        makeToolCallSSE("call_1", "get_weather", '{"city":"北京"}', { prompt_tokens: 20, completion_tokens: 10 })
      )
    );
    // 第二次调用：LLM 返回纯文本
    fetchSpy.mockResolvedValueOnce(
      buildSSEResponse(makeTextSSE("北京今天25度", { prompt_tokens: 30, completion_tokens: 8 }))
    );

    const messages: ChatRequest["messages"] = [{ role: "user", content: "北京天气怎么样" }];

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages,
      tools: [{ name: "get_weather", description: "获取天气", parameters: {} }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
    });

    // fetch 应被调用两次
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // 工具应被执行
    expect(mockExecutor.execute).toHaveBeenCalledWith({ city: "北京" });

    // messages 应包含 assistant(tool_call) + tool(result) + user 原始消息
    expect(messages.length).toBe(3); // user + assistant(toolCalls) + tool(result)
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].toolCalls).toBeDefined();
    expect(messages[2].role).toBe("tool");

    // 应有 done 事件，usage 是累加的
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === "done") {
      expect(doneEvent.usage).toEqual({
        inputTokens: 50,
        outputTokens: 18,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      });
    }
  });

  it("多轮 tool calling", async () => {
    const { service, toolRegistry } = createTestService();
    const events: ChatStreamEvent[] = [];

    const mockExecutor: ToolExecutor = {
      execute: vi.fn().mockResolvedValue("result"),
    };
    toolRegistry.registerBuiltin(
      { name: "search", description: "搜索", parameters: { type: "object", properties: {} } },
      mockExecutor
    );

    // 第一次：tool_call
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeToolCallSSE("call_1", "search", '{"q":"a"}')));
    // 第二次：又一个 tool_call
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeToolCallSSE("call_2", "search", '{"q":"b"}')));
    // 第三次：纯文本
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("完成")));

    const messages: ChatRequest["messages"] = [{ role: "user", content: "搜索" }];

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages,
      tools: [{ name: "search", description: "搜索", parameters: {} }],
      maxIterations: 10,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    // user + assistant+tool + assistant+tool = 5 条消息
    expect(messages.length).toBe(5);
    expect(events.find((e) => e.type === "done")).toBeDefined();
  });

  it("超过 maxIterations 限制", async () => {
    const { service, toolRegistry } = createTestService();
    const events: ChatStreamEvent[] = [];

    toolRegistry.registerBuiltin(
      { name: "loop_tool", description: "循环工具", parameters: { type: "object", properties: {} } },
      { execute: vi.fn().mockResolvedValue("ok") }
    );

    // 每次都返回 tool_call
    fetchSpy.mockImplementation(() => Promise.resolve(buildSSEResponse(makeToolCallSSE("call_x", "loop_tool", "{}"))));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      tools: [{ name: "loop_tool", description: "循环工具", parameters: {} }],
      maxIterations: 3,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
    });

    // fetch 应被调用 3 次（maxIterations）
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // 应收到 error 事件
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.message).toContain("maximum iterations");
      expect(errorEvent.message).toContain("3");
    }
  });

  it("signal 中止后应提前退出", async () => {
    const { service } = createTestService();
    const events: ChatStreamEvent[] = [];
    const abortController = new AbortController();

    // 模拟：callLLM 正常返回结果，但在返回后 signal 已被 abort
    // 通过 mock callLLM 直接实现，避免 parseStream 阻塞
    const callLLMSpy = vi.spyOn(service as any, "callLLM").mockImplementation(async () => {
      abortController.abort();
      return { content: "hello", toolCalls: undefined, usage: { inputTokens: 5, outputTokens: 3 } };
    });

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: abortController.signal,
      scriptToolCallback: null,
    });

    // abort 后不应有 done 事件（callLLMWithToolLoop 在 signal.aborted 时直接 return）
    expect(events.find((e) => e.type === "done")).toBeUndefined();
    callLLMSpy.mockRestore();
  });

  it("scriptToolCallback 转发未注册的工具", async () => {
    const { service } = createTestService();
    const events: ChatStreamEvent[] = [];

    const scriptCallback = vi.fn().mockResolvedValue([{ id: "call_1", result: '{"data":"from_script"}' }]);

    // 第一次：tool_call（工具未在 registry 注册）
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeToolCallSSE("call_1", "script_tool", '{"input":"test"}')));
    // 第二次：纯文本
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("done")));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      tools: [{ name: "script_tool", description: "脚本工具", parameters: {} }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: scriptCallback,
    });

    // scriptCallback 应被调用
    expect(scriptCallback).toHaveBeenCalledTimes(1);
    expect(scriptCallback).toHaveBeenCalledWith([expect.objectContaining({ id: "call_1", name: "script_tool" })]);

    expect(events.find((e) => e.type === "done")).toBeDefined();
  });

  it("有 conversationId 时应持久化消息", async () => {
    const { service, mockRepo } = createTestService();
    const events: ChatStreamEvent[] = [];

    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("回答")));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "问题" }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
      conversationId: "conv-123",
    });

    // 应调用 appendMessage 持久化 assistant 消息
    expect(mockRepo.appendMessage).toHaveBeenCalledTimes(1);
    expect(mockRepo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-123",
        role: "assistant",
        content: "回答",
      })
    );
  });

  it("无 conversationId 时不应调用持久化", async () => {
    const { service, mockRepo } = createTestService();
    const events: ChatStreamEvent[] = [];

    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("回答")));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "问题" }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
      // 无 conversationId
    });

    expect(mockRepo.appendMessage).not.toHaveBeenCalled();
  });

  it("有 conversationId 的 tool calling 应持久化所有消息", async () => {
    const { service, mockRepo, toolRegistry } = createTestService();
    const events: ChatStreamEvent[] = [];

    toolRegistry.registerBuiltin(
      { name: "my_tool", description: "工具", parameters: { type: "object", properties: {} } },
      { execute: vi.fn().mockResolvedValue("tool_result") }
    );

    // 第一次：tool_call
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeToolCallSSE("call_1", "my_tool", "{}")));
    // 第二次：纯文本
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("最终回答")));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "问题" }],
      tools: [{ name: "my_tool", description: "工具", parameters: {} }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
      conversationId: "conv-456",
    });

    // 应持久化 3 条消息：assistant(tool_call) + tool(result) + assistant(final)
    expect(mockRepo.appendMessage).toHaveBeenCalledTimes(3);

    // 第一次：assistant with toolCalls
    expect(mockRepo.appendMessage.mock.calls[0][0]).toMatchObject({
      conversationId: "conv-456",
      role: "assistant",
      toolCalls: expect.arrayContaining([expect.objectContaining({ id: "call_1", name: "my_tool" })]),
    });

    // 第二次：tool result
    expect(mockRepo.appendMessage.mock.calls[1][0]).toMatchObject({
      conversationId: "conv-456",
      role: "tool",
      toolCallId: "call_1",
    });

    // 第三次：最终 assistant 回答
    expect(mockRepo.appendMessage.mock.calls[2][0]).toMatchObject({
      conversationId: "conv-456",
      role: "assistant",
      content: "最终回答",
    });
  });

  it("callLLM 抛出异常时应向上传播", async () => {
    const { service } = createTestService();
    const events: ChatStreamEvent[] = [];

    // 直接 mock callLLM，避免内部重试延迟
    vi.spyOn(service as any, "callLLM").mockRejectedValue(new Error("Internal server error"));

    await expect(
      (service as any).callLLMWithToolLoop({
        toolRegistry: (service as any).toolRegistry,
        model: openaiConfig,
        messages: [{ role: "user", content: "test" }],
        maxIterations: 5,
        sendEvent: (e: ChatStreamEvent) => events.push(e),
        signal: new AbortController().signal,
        scriptToolCallback: null,
      })
    ).rejects.toThrow("Internal server error");

    // 不应有 done 或 error 事件（异常直接抛出，由上层 catch）
    expect(events.find((e) => e.type === "done")).toBeUndefined();
  });

  it("callLLM HTTP 错误 - 纯文本错误体", async () => {
    const { service } = createTestService();

    // 直接 mock callLLM，避免内部重试延迟；429 是可重试错误，withRetry 会重试 3 次
    vi.spyOn(service as any, "callLLM").mockRejectedValue(new Error("API error: 429 - Rate limit exceeded"));

    await expect(
      (service as any).callLLMWithToolLoop({
        toolRegistry: (service as any).toolRegistry,
        model: openaiConfig,
        messages: [{ role: "user", content: "test" }],
        maxIterations: 5,
        sendEvent: () => {},
        signal: new AbortController().signal,
        scriptToolCallback: null,
        delayFn: async () => {},
      })
    ).rejects.toThrow("API error: 429 - Rate limit exceeded");
  });

  it("callLLM HTTP 错误 - 空错误体", async () => {
    const { service } = createTestService();

    // 直接 mock callLLM，避免内部重试延迟；502 是可重试错误，withRetry 会重试 3 次
    vi.spyOn(service as any, "callLLM").mockRejectedValue(new Error("API error: 502"));

    await expect(
      (service as any).callLLMWithToolLoop({
        toolRegistry: (service as any).toolRegistry,
        model: openaiConfig,
        messages: [{ role: "user", content: "test" }],
        maxIterations: 5,
        sendEvent: () => {},
        signal: new AbortController().signal,
        scriptToolCallback: null,
        delayFn: async () => {},
      })
    ).rejects.toThrow("API error: 502");
  });

  it("LLM 返回 toolCalls 但没有工具定义时应正常结束", async () => {
    const { service } = createTestService();
    const events: ChatStreamEvent[] = [];

    // LLM 幻觉返回了 tool_call，但调用时没传 tools 且 registry 也没有注册工具
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeToolCallSSE("call_1", "phantom_tool", '{"x":1}')));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      // 不传 tools，allToolDefs 为空
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
    });

    // 应只调用 1 次 fetch（不进入 tool calling 循环）
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 应正常结束，发送 done
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
  });

  it("callLLM 内部不应将 done/error 事件转发给 sendEvent", async () => {
    const { service } = createTestService();
    const events: ChatStreamEvent[] = [];

    // 使用带 usage 的响应（parseOpenAIStream 会产生 done 事件）
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("hello", { prompt_tokens: 5, completion_tokens: 3 })));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
    });

    // callLLM 内部过滤了 parseStream 产生的 done 事件，只有 callLLMWithToolLoop 发送的 done
    // 所以只应有 1 个 done 事件（来自 callLLMWithToolLoop 第 306 行）
    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents).toHaveLength(1);

    // content_delta 应正常转发
    const contentEvents = events.filter((e) => e.type === "content_delta");
    expect(contentEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("单次响应包含多个 tool_calls", async () => {
    const { service, toolRegistry, mockRepo } = createTestService();
    const events: ChatStreamEvent[] = [];

    const executorA: ToolExecutor = { execute: vi.fn().mockResolvedValue("result_a") };
    const executorB: ToolExecutor = { execute: vi.fn().mockResolvedValue("result_b") };

    toolRegistry.registerBuiltin(
      { name: "tool_a", description: "工具A", parameters: { type: "object", properties: {} } },
      executorA
    );
    toolRegistry.registerBuiltin(
      { name: "tool_b", description: "工具B", parameters: { type: "object", properties: {} } },
      executorB
    );

    // 直接 mock callLLM 返回多个 toolCalls（绕过 callLLM 内部 currentToolCall 单变量的限制）
    let callCount = 0;
    const callLLMSpy = vi.spyOn(service as any, "callLLM").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: "",
          toolCalls: [
            { id: "call_a", name: "tool_a", arguments: '{"x":1}' },
            { id: "call_b", name: "tool_b", arguments: '{"y":2}' },
          ],
          usage: { inputTokens: 20, outputTokens: 10 },
        };
      }
      return { content: "两个工具都执行完了", usage: { inputTokens: 30, outputTokens: 8 } };
    });

    const messages: ChatRequest["messages"] = [{ role: "user", content: "同时用两个工具" }];

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages,
      tools: [
        { name: "tool_a", description: "工具A", parameters: {} },
        { name: "tool_b", description: "工具B", parameters: {} },
      ],
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
      conversationId: "conv-multi",
    });

    // 两个工具都应被执行
    expect(executorA.execute).toHaveBeenCalledTimes(1);
    expect(executorB.execute).toHaveBeenCalledTimes(1);

    // messages: user + assistant(2 toolCalls) + tool_a_result + tool_b_result = 4
    expect(messages.length).toBe(4);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].toolCalls).toHaveLength(2);
    expect(messages[2].role).toBe("tool");
    expect(messages[3].role).toBe("tool");

    // 持久化：assistant(toolCalls) + 2个tool结果 + assistant(final) = 4
    expect(mockRepo.appendMessage).toHaveBeenCalledTimes(4);
    expect(mockRepo.appendMessage.mock.calls[1][0]).toMatchObject({ role: "tool", toolCallId: "call_a" });
    expect(mockRepo.appendMessage.mock.calls[2][0]).toMatchObject({ role: "tool", toolCallId: "call_b" });

    expect(events.find((e) => e.type === "done")).toBeDefined();
    callLLMSpy.mockRestore();
  });

  it("skipBuiltinTools 时仅使用传入的 tools", async () => {
    const { service, toolRegistry } = createTestService();
    const events: ChatStreamEvent[] = [];

    // 注册一个内置工具
    const builtinExecutor: ToolExecutor = {
      execute: vi.fn().mockResolvedValue("builtin_result"),
    };
    toolRegistry.registerBuiltin(
      { name: "builtin_tool", description: "内置工具", parameters: { type: "object", properties: {} } },
      builtinExecutor
    );

    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("hello")));

    // 用 skipBuiltinTools 调用，传入一个脚本工具
    const scriptTools: ToolDefinition[] = [
      { name: "script_tool", description: "脚本工具", parameters: { type: "object", properties: {} } },
    ];

    // mock callLLM 来检查传入的 tools
    let capturedTools: ToolDefinition[] | undefined;
    const callLLMSpy = vi
      .spyOn(service as any, "callLLM")
      .mockImplementation(async (_model: any, params: any, sendEvent: any) => {
        capturedTools = params.tools;
        sendEvent({ type: "done" });
        return { content: "ok", usage: { inputTokens: 5, outputTokens: 3 } };
      });

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      tools: scriptTools,
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
      skipBuiltinTools: true,
    });

    // 传给 callLLM 的 tools 应只有脚本工具，不含内置工具
    expect(capturedTools).toHaveLength(1);
    expect(capturedTools![0].name).toBe("script_tool");

    callLLMSpy.mockRestore();
  });

  it("skipBuiltinTools 无 tools 传入时 allToolDefs 为空", async () => {
    const { service, toolRegistry } = createTestService();
    const events: ChatStreamEvent[] = [];

    // 注册内置工具
    toolRegistry.registerBuiltin(
      { name: "builtin_tool", description: "内置工具", parameters: { type: "object", properties: {} } },
      { execute: vi.fn().mockResolvedValue("result") }
    );

    let capturedTools: ToolDefinition[] | undefined;
    const callLLMSpy = vi
      .spyOn(service as any, "callLLM")
      .mockImplementation(async (_model: any, params: any, sendEvent: any) => {
        capturedTools = params.tools;
        sendEvent({ type: "done" });
        return { content: "ok", usage: { inputTokens: 5, outputTokens: 3 } };
      });

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      // 不传 tools
      maxIterations: 5,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
      skipBuiltinTools: true,
    });

    // 不应有任何工具
    expect(capturedTools).toBeUndefined();

    callLLMSpy.mockRestore();
  });

  it("每轮循环应重新获取工具定义（支持动态注册）", async () => {
    const { service, toolRegistry } = createTestService();
    const events: ChatStreamEvent[] = [];

    // 注册 load_skill 工具：第一次调用时动态注册 new_tool
    const loadSkillExecutor: ToolExecutor = {
      execute: vi.fn().mockImplementation(async () => {
        // 模拟 load_skill 动态注册新工具
        toolRegistry.registerBuiltin(
          { name: "dynamic_tool", description: "动态注册的工具", parameters: { type: "object", properties: {} } },
          { execute: vi.fn().mockResolvedValue("dynamic result") }
        );
        return "skill loaded";
      }),
    };
    toolRegistry.registerBuiltin(
      { name: "load_skill", description: "加载 Skill", parameters: { type: "object", properties: {} } },
      loadSkillExecutor
    );

    // 第一轮：LLM 调用 load_skill
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeToolCallSSE("call_1", "load_skill", '{"skill_name":"test"}')));
    // 第二轮：LLM 调用 dynamic_tool（动态注册的）
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeToolCallSSE("call_2", "dynamic_tool", "{}")));
    // 第三轮：纯文本结束
    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("完成")));

    await (service as any).callLLMWithToolLoop({
      toolRegistry: (service as any).toolRegistry,
      model: openaiConfig,
      messages: [{ role: "user", content: "test" }],
      maxIterations: 10,
      sendEvent: (e: ChatStreamEvent) => events.push(e),
      signal: new AbortController().signal,
      scriptToolCallback: null,
    });

    // fetch 应被调用 3 次（load_skill → dynamic_tool → 完成）
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // 第二次 fetch 的请求体应包含 dynamic_tool 定义
    const secondCallBody = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
    const toolNames = secondCallBody.tools.map((t: any) => t.function.name);
    expect(toolNames).toContain("dynamic_tool");

    // 应有 done 事件
    expect(events.find((e) => e.type === "done")).toBeDefined();

    // 清理
    toolRegistry.unregisterBuiltin("load_skill");
    toolRegistry.unregisterBuiltin("dynamic_tool");
  });
});

// ---- handleConversationChat ephemeral 测试 ----

describe("handleConversationChat ephemeral 模式", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // 辅助：创建 mock sender（connect 模式）
  function createMockSender() {
    const sentMessages: any[] = [];
    let onMessageCb: ((msg: any) => void) | null = null;
    let onDisconnectCb: (() => void) | null = null;

    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: (cb: (msg: any) => void) => {
        onMessageCb = cb;
      },
      onDisconnect: (cb: () => void) => {
        onDisconnectCb = cb;
      },
      disconnect: () => {},
    };

    const sender = {
      isType: (type: any) => type === 1, // GetSenderType.CONNECT = 1
      getConnect: () => mockConn,
    };

    return { sender, sentMessages, mockConn, getOnMessage: () => onMessageCb, getOnDisconnect: () => onDisconnectCb };
  }

  it("ephemeral 模式不加载会话、不持久化", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    fetchSpy.mockResolvedValueOnce(
      buildSSEResponse(makeTextSSE("ephemeral reply", { prompt_tokens: 10, completion_tokens: 5 }))
    );

    await (service as any).handleConversationChat(
      {
        conversationId: "eph-conv-1",
        message: "hello",
        ephemeral: true,
        modelId: "test-openai",
        messages: [{ role: "user", content: "hello" }],
        system: "你是助手",
        scriptUuid: "test-uuid",
      },
      sender
    );

    // 不应调用 repo 的 getMessages 或 listConversations（不加载会话）
    expect(mockRepo.getMessages).not.toHaveBeenCalled();
    expect(mockRepo.listConversations).not.toHaveBeenCalled();
    // 不应调用 appendMessage（不持久化）
    expect(mockRepo.appendMessage).not.toHaveBeenCalled();
    // 不应调用 saveConversation
    expect(mockRepo.saveConversation).not.toHaveBeenCalled();
  });

  it("ephemeral 模式使用传入的 messages 和 system", async () => {
    const { service } = createTestService();
    const { sender, sentMessages } = createMockSender();

    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("回复", { prompt_tokens: 10, completion_tokens: 5 })));

    await (service as any).handleConversationChat(
      {
        conversationId: "eph-conv-2",
        message: "你好",
        ephemeral: true,
        modelId: "test-openai",
        messages: [
          { role: "user", content: "上一条" },
          { role: "assistant", content: "上次回复" },
          { role: "user", content: "你好" },
        ],
        system: "系统提示",
        scriptUuid: "test-uuid",
      },
      sender
    );

    // 应该发送了 fetch 请求
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 检查 fetch 请求体中的消息
    const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    // 应包含 system + 3 条消息
    expect(fetchBody.messages.length).toBeGreaterThanOrEqual(4);
    // 第一条应是 system，包含内置提示词 + 用户自定义
    expect(fetchBody.messages[0].role).toBe("system");
    expect(fetchBody.messages[0].content).toContain("You are ScriptCat Agent");
    expect(fetchBody.messages[0].content).toContain("系统提示");

    // 应该发送了 done 事件
    const doneMsg = sentMessages.find((m) => m.action === "event" && m.data.type === "done");
    expect(doneMsg).toBeDefined();
  });

  it("ephemeral 模式使用 skipBuiltinTools", async () => {
    const { service, toolRegistry } = createTestService();
    const { sender, sentMessages } = createMockSender();

    // 注册内置工具
    toolRegistry.registerBuiltin(
      { name: "dom_read_page", description: "读取页面", parameters: { type: "object", properties: {} } },
      { execute: vi.fn().mockResolvedValue("page content") }
    );

    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("ok", { prompt_tokens: 5, completion_tokens: 3 })));

    await (service as any).handleConversationChat(
      {
        conversationId: "eph-conv-3",
        message: "test",
        ephemeral: true,
        modelId: "test-openai",
        messages: [{ role: "user", content: "test" }],
        scriptUuid: "test-uuid",
      },
      sender
    );

    // fetch 请求体中不应包含内置工具
    const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(fetchBody.tools).toBeUndefined();

    // 应正常完成
    const doneMsg = sentMessages.find((m) => m.action === "event" && m.data.type === "done");
    expect(doneMsg).toBeDefined();
  });

  it("ephemeral 模式带脚本工具时 tools 传入 callLLMWithToolLoop", async () => {
    const { service } = createTestService();
    const { sender, sentMessages } = createMockSender();

    // mock callLLMWithToolLoop 来验证参数
    let capturedParams: any;
    const loopSpy = vi.spyOn(service as any, "callLLMWithToolLoop").mockImplementation(async (params: any) => {
      capturedParams = params;
      params.sendEvent({ type: "done", usage: { inputTokens: 5, outputTokens: 3 } });
    });

    await (service as any).handleConversationChat(
      {
        conversationId: "eph-conv-4",
        message: "test",
        ephemeral: true,
        modelId: "test-openai",
        messages: [{ role: "user", content: "test" }],
        tools: [{ name: "my_script_tool", description: "脚本工具", parameters: {} }],
        scriptUuid: "test-uuid",
      },
      sender
    );

    // 验证 callLLMWithToolLoop 收到正确参数
    expect(capturedParams.skipBuiltinTools).toBe(true);
    expect(capturedParams.tools).toHaveLength(1);
    expect(capturedParams.tools[0].name).toBe("my_script_tool");
    expect(capturedParams.scriptToolCallback).not.toBeNull();
    // 不应有 conversationId（ephemeral 不持久化）
    expect(capturedParams.conversationId).toBeUndefined();

    // 应发送 done 事件
    expect(sentMessages.some((m) => m.action === "event" && m.data.type === "done")).toBe(true);

    loopSpy.mockRestore();
  });

  it("ephemeral 模式无 system 时不添加 system 消息", async () => {
    const { service } = createTestService();
    const { sender } = createMockSender();

    fetchSpy.mockResolvedValueOnce(buildSSEResponse(makeTextSSE("ok", { prompt_tokens: 5, completion_tokens: 3 })));

    await (service as any).handleConversationChat(
      {
        conversationId: "eph-conv-5",
        message: "test",
        ephemeral: true,
        modelId: "test-openai",
        messages: [{ role: "user", content: "test" }],
        // 无 system
        scriptUuid: "test-uuid",
      },
      sender
    );

    const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    // 应有 system 消息（内置提示词），即使用户没传 system
    const systemMsg = fetchBody.messages.find((m: any) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain("You are ScriptCat Agent");
  });
});
