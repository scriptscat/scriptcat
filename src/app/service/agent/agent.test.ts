import { describe, it, expect } from "vitest";
import { SSEParser } from "./sse_parser";
import { buildOpenAIRequest } from "./providers/openai";
import { buildAnthropicRequest } from "./providers/anthropic";
import type { AgentModelConfig } from "@App/pkg/config/config";
import type { ChatRequest, ToolDefinition } from "./types";

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
});

describe("Anthropic Provider", () => {
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
    expect(body.system).toBe("你是助手");
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
});
