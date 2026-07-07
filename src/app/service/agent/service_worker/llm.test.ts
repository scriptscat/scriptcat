import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestService, makeSSEResponse, makeTextResponse } from "./test-helpers";

// ---- callLLM 相关测试（通过 callLLMWithToolLoop 间接测试） ----

describe("callLLM 流式响应解析", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // 辅助：创建 Anthropic SSE Response
  function makeAnthropicSSEResponse(events: Array<{ event: string; data: any }>): Response {
    const encoder = new TextEncoder();
    const chunks = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    let i = 0;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (i >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: encoder.encode(chunks[i++]) };
          },
          releaseLock: () => {},
          cancel: async () => {},
          closed: Promise.resolve(undefined),
        }),
      },
      text: async () => "",
    } as unknown as Response;
  }

  function createMockSender() {
    const sentMessages: any[] = [];
    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const sender = {
      isType: (type: any) => type === 1,
      getConnect: () => mockConn,
    };
    return { sender, sentMessages };
  }

  const BASE_CONV = {
    id: "conv-1",
    title: "Test",
    modelId: "test-openai",
    createtime: Date.now(),
    updatetime: Date.now(),
  };

  it("正常文本响应：OpenAI SSE → sendEvent 收到 content_delta + done", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    fetchSpy.mockResolvedValueOnce(
      makeSSEResponse([
        `data: {"choices":[{"delta":{"content":"你好"}}]}\n\n`,
        `data: {"choices":[{"delta":{"content":"世界"}}]}\n\n`,
        `data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`,
      ])
    );

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "hi" }, sender);

    const events = sentMessages.map((m) => m.data);
    const contentDeltas = events.filter((e: any) => e.type === "content_delta");
    const doneEvents = events.filter((e: any) => e.type === "done");

    expect(contentDeltas.length).toBeGreaterThanOrEqual(1);
    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0].usage).toBeDefined();
    expect(doneEvents[0].usage.inputTokens).toBe(10);
    expect(doneEvents[0].usage.outputTokens).toBe(5);
  });

  it("正常文本响应（Anthropic provider）：验证 buildAnthropicRequest + parseAnthropicStream", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    // 设置 Anthropic model
    const anthropicModelRepo = {
      listModels: vi.fn().mockResolvedValue([
        {
          id: "test-anthropic",
          name: "Claude",
          provider: "anthropic",
          apiBaseUrl: "https://api.anthropic.com",
          apiKey: "sk-test",
          model: "claude-3",
        },
      ]),
      getModel: vi.fn().mockImplementation((id: string) => {
        if (id === "test-anthropic") {
          return Promise.resolve({
            id: "test-anthropic",
            name: "Claude",
            provider: "anthropic",
            apiBaseUrl: "https://api.anthropic.com",
            apiKey: "sk-test",
            model: "claude-3",
          });
        }
        return Promise.resolve(undefined);
      }),
      getDefaultModelId: vi.fn().mockResolvedValue("test-anthropic"),
      saveModel: vi.fn(),
      removeModel: vi.fn(),
      setDefaultModelId: vi.fn(),
    };
    (service as any).modelService.modelRepo = anthropicModelRepo;

    const conv = { ...BASE_CONV, modelId: "test-anthropic" };
    mockRepo.listConversations.mockResolvedValue([conv]);
    mockRepo.getMessages.mockResolvedValue([]);

    fetchSpy.mockResolvedValueOnce(
      makeAnthropicSSEResponse([
        { event: "message_start", data: { message: { usage: { input_tokens: 15 } } } },
        { event: "content_block_start", data: { content_block: { type: "text", text: "" } } },
        { event: "content_block_delta", data: { delta: { type: "text_delta", text: "你好世界" } } },
        { event: "message_delta", data: { usage: { output_tokens: 8 } } },
      ])
    );

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "hi" }, sender);

    // 验证请求使用了 Anthropic 格式
    const reqInit = fetchSpy.mock.calls[0][1];
    expect(reqInit.headers["x-api-key"]).toBe("sk-test");
    expect(fetchSpy.mock.calls[0][0]).toContain("/v1/messages");

    const events = sentMessages.map((m) => m.data);
    const contentDeltas = events.filter((e: any) => e.type === "content_delta");
    const doneEvents = events.filter((e: any) => e.type === "done");
    expect(contentDeltas).toHaveLength(1);
    expect(contentDeltas[0].delta).toBe("你好世界");
    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0].usage.inputTokens).toBe(15);
    expect(doneEvents[0].usage.outputTokens).toBe(8);
  });

  it("API 错误响应（HTTP 401）：4xx 客户端错误不重试，立即收到 error + errorCode=auth", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 401 不重试，只需提供 1 次 mock
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "401 Unauthorized",
    } as unknown as Response);

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "hi" }, sender);

    // 仅调用 1 次 fetch，不重试
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const events = sentMessages.map((m) => m.data);
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].errorCode).toBe("auth");
  });

  it("API 错误响应（HTTP 429）：应进入重试循环，第二次成功", async () => {
    vi.useFakeTimers();

    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 第一次 429，第二次成功
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Too Many Requests",
    } as unknown as Response);
    fetchSpy.mockResolvedValueOnce(
      makeSSEResponse([
        `data: {"choices":[{"delta":{"content":"重试成功"}}]}\n\n`,
        `data: {"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n`,
      ])
    );

    const chatPromise = (service as any).handleConversationChat({ conversationId: "conv-1", message: "hi" }, sender);

    // 推进定时器跳过第一次重试延迟（10s）
    await vi.advanceTimersByTimeAsync(10_000);

    await chatPromise;

    // fetch 应被调用 2 次（429 + 成功）
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const events = sentMessages.map((m) => m.data);
    // 应有 1 次 retry 通知
    const retryEvents = events.filter((e: any) => e.type === "retry");
    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0].attempt).toBe(1);
    // 最终应成功完成
    const doneEvents = events.filter((e: any) => e.type === "done");
    expect(doneEvents).toHaveLength(1);

    vi.useRealTimers();
  });

  it("API 错误响应（HTTP 500 后重试成功）：withRetry 生效", async () => {
    vi.useFakeTimers();

    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 第一次 500 错误
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as unknown as Response);

    // 第二次成功
    fetchSpy.mockResolvedValueOnce(
      makeSSEResponse([
        `data: {"choices":[{"delta":{"content":"恢复了"}}]}\n\n`,
        `data: {"usage":{"prompt_tokens":10,"completion_tokens":3}}\n\n`,
      ])
    );

    const chatPromise = (service as any).handleConversationChat({ conversationId: "conv-1", message: "hi" }, sender);

    // 推进定时器跳过 withRetry 的退避延迟
    await vi.advanceTimersByTimeAsync(10_000);

    await chatPromise;

    // fetch 应被调用 2 次（500 + 成功）
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const events = sentMessages.map((m) => m.data);
    const doneEvents = events.filter((e: any) => e.type === "done");
    expect(doneEvents).toHaveLength(1);

    vi.useRealTimers();
  });

  it("无 response body：抛出 No response body", async () => {
    vi.useFakeTimers();

    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // callLLM 内部会重试 5 次，需提供足够多的 mock
    const makeNoBody = () => ({ ok: true, status: 200, body: null, text: async () => "" }) as unknown as Response;
    for (let i = 0; i < 6; i++) fetchSpy.mockResolvedValueOnce(makeNoBody());

    const chatPromise = (service as any).handleConversationChat({ conversationId: "conv-1", message: "hi" }, sender);

    // 推进定时器跳过 callLLM 内部重试延迟
    await vi.advanceTimersByTimeAsync(100_000);

    await chatPromise;

    const events = sentMessages.map((m) => m.data);
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].message).toContain("No response body");

    vi.useRealTimers();
  });

  it("AbortSignal 中止：disconnect 后不再发送消息", async () => {
    const { service, mockRepo } = createTestService();
    const sentMessages: any[] = [];
    let disconnectCb: (() => void) | null = null;

    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: vi.fn(),
      onDisconnect: vi.fn().mockImplementation((cb: () => void) => {
        disconnectCb = cb;
      }),
    };
    const sender = {
      isType: (type: any) => type === 1,
      getConnect: () => mockConn,
    };

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // fetch 抛 AbortError（模拟 signal 取消 fetch）
    fetchSpy.mockImplementation((_url: string, _init: RequestInit) => {
      // 在 fetch 调用时立即触发 disconnect
      if (disconnectCb) {
        disconnectCb();
        disconnectCb = null;
      }
      // 模拟 abort 导致 fetch reject
      return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
    });

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "hi" }, sender);

    // abort 后 handleConversationChat 检测到 signal.aborted，静默返回
    const events = sentMessages.map((m) => m.data);
    // 不应有 error 事件（abort 不算 error）
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(0);
    // 不应有 done 事件
    const doneEvents = events.filter((e: any) => e.type === "done");
    expect(doneEvents).toHaveLength(0);
  });
});

// ---- callLLMWithToolLoop 场景补充 ----

describe("callLLMWithToolLoop 工具调用循环", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function makeToolCallResponse(toolCalls: Array<{ id: string; name: string; arguments: string }>): Response {
    const chunks: string[] = [];
    for (const tc of toolCalls) {
      chunks.push(
        `data: {"choices":[{"delta":{"tool_calls":[{"id":"${tc.id}","function":{"name":"${tc.name}","arguments":""}}]}}]}\n\n`
      );
      chunks.push(
        `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":${JSON.stringify(tc.arguments)}}}]}}]}\n\n`
      );
    }
    chunks.push(`data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`);
    return makeSSEResponse(chunks);
  }

  // 与 makeToolCallResponse 相同，但 prompt_tokens 可自定义，用于驱动 usageRatio 跨越裁剪阈值
  function makeToolCallResponseWithUsage(
    toolCalls: Array<{ id: string; name: string; arguments: string }>,
    promptTokens: number
  ): Response {
    const chunks: string[] = [];
    for (const tc of toolCalls) {
      chunks.push(
        `data: {"choices":[{"delta":{"tool_calls":[{"id":"${tc.id}","function":{"name":"${tc.name}","arguments":""}}]}}]}\n\n`
      );
      chunks.push(
        `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":${JSON.stringify(tc.arguments)}}}]}}]}\n\n`
      );
    }
    chunks.push(`data: {"usage":{"prompt_tokens":${promptTokens},"completion_tokens":5}}\n\n`);
    return makeSSEResponse(chunks);
  }

  function createMockSender() {
    const sentMessages: any[] = [];
    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const sender = {
      isType: (type: any) => type === 1,
      getConnect: () => mockConn,
    };
    return { sender, sentMessages };
  }

  const BASE_CONV = {
    id: "conv-1",
    title: "Test",
    modelId: "test-openai",
    createtime: Date.now(),
    updatetime: Date.now(),
  };

  it("工具调用单轮：tool_call → 执行 → 文本完成", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    // 注册一个内置工具
    const registry = (service as any).toolRegistry;
    registry.registerBuiltin(
      { name: "echo", description: "Echo", parameters: { type: "object", properties: { msg: { type: "string" } } } },
      { execute: async (args: Record<string, unknown>) => `echo: ${args.msg}` }
    );

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 第一次：返回 tool_call
    fetchSpy.mockResolvedValueOnce(
      makeToolCallResponse([{ id: "call_1", name: "echo", arguments: '{"msg":"hello"}' }])
    );
    // 第二次：纯文本
    fetchSpy.mockResolvedValueOnce(makeTextResponse("done"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test" }, sender);

    const events = sentMessages.map((m) => m.data);
    // 应有 tool_call_start, tool_call_complete, new_message, done
    expect(events.some((e: any) => e.type === "tool_call_start")).toBe(true);
    expect(events.some((e: any) => e.type === "tool_call_complete")).toBe(true);
    const completeEvent = events.find((e: any) => e.type === "tool_call_complete");
    expect(completeEvent.result).toBe("echo: hello");
    expect(events.some((e: any) => e.type === "new_message")).toBe(true);
    expect(events.some((e: any) => e.type === "done")).toBe(true);

    // assistant 消息应持久化（tool_calls 和最终文本各一条）
    const appendCalls = mockRepo.appendMessage.mock.calls;
    const assistantCalls = appendCalls.filter((c: any) => c[0].role === "assistant");
    expect(assistantCalls).toHaveLength(2); // tool_call + final text

    // fetch 应调用 2 次
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    registry.unregisterBuiltin("echo");
  });

  it("工具调用多轮（3 轮）：连续 tool_call 后文本", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    const registry = (service as any).toolRegistry;
    let callCount = 0;
    registry.registerBuiltin(
      { name: "counter", description: "Count", parameters: { type: "object", properties: {} } },
      {
        execute: async () => {
          callCount++;
          return `count=${callCount}`;
        },
      }
    );

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 3 轮 tool_call
    fetchSpy.mockResolvedValueOnce(makeToolCallResponse([{ id: "c1", name: "counter", arguments: "{}" }]));
    fetchSpy.mockResolvedValueOnce(makeToolCallResponse([{ id: "c2", name: "counter", arguments: "{}" }]));
    fetchSpy.mockResolvedValueOnce(makeToolCallResponse([{ id: "c3", name: "counter", arguments: "{}" }]));
    // 最终文本
    fetchSpy.mockResolvedValueOnce(makeTextResponse("done"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test" }, sender);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(callCount).toBe(3);

    const events = sentMessages.map((m) => m.data);
    const doneEvents = events.filter((e: any) => e.type === "done");
    expect(doneEvents).toHaveLength(1);
    // done 事件 usage 应累计 4 轮
    expect(doneEvents[0].usage.inputTokens).toBe(40); // 10 * 4
    expect(doneEvents[0].usage.outputTokens).toBe(20); // 5 * 4

    registry.unregisterBuiltin("counter");
  });

  it("超过 maxIterations：sendEvent 收到 max_iterations 错误", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    const registry = (service as any).toolRegistry;
    registry.registerBuiltin(
      { name: "loop", description: "Loop", parameters: { type: "object", properties: {} } },
      { execute: async () => "ok" }
    );

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // maxIterations=1 但 LLM 一直返回 tool_call
    fetchSpy.mockResolvedValueOnce(makeToolCallResponse([{ id: "c1", name: "loop", arguments: "{}" }]));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "test", maxIterations: 1 },
      sender
    );

    const events = sentMessages.map((m) => m.data);
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].message).toContain("maximum iterations");
    expect(errorEvents[0].errorCode).toBe("max_iterations");

    // fetch 只调用 1 次（maxIterations=1）
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    registry.unregisterBuiltin("loop");
  });

  it("显式传入非法 maxIterations（如负数）时应被兜底截断，而非直接导致循环立即失败", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    fetchSpy.mockResolvedValueOnce(makeTextResponse("done"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "test", maxIterations: -5 },
      sender
    );

    // 不应立即触发 max_iterations 错误：兜底截断为下限后循环至少能执行 1 次
    const events = sentMessages.map((m) => m.data);
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("点击继续对话后，历史中的 max_iterations 错误占位消息不应被重放给 LLM", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    // 历史中包含一条超过 max_iterations 时持久化的错误占位消息（content 为空字符串）
    mockRepo.getMessages.mockResolvedValue([
      { id: "u1", conversationId: "conv-1", role: "user", content: "第一条消息", createtime: 1 },
      {
        id: "a1",
        conversationId: "conv-1",
        role: "assistant",
        content: "",
        error: "Tool calling loop exceeded maximum iterations (50)",
        errorCode: "max_iterations",
        createtime: 2,
      },
    ]);

    fetchSpy.mockResolvedValueOnce(makeTextResponse("好的，继续"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "请继续。" }, sender);

    const reqInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(reqInit.body as string);

    // 出站请求中不应包含空 content 且无 tool_calls 的 assistant 消息（即错误占位消息）
    const emptyAssistantMsgs = body.messages.filter(
      (m: any) => m.role === "assistant" && m.content === "" && !m.tool_calls
    );
    expect(emptyAssistantMsgs).toHaveLength(0);

    // 正常的历史用户消息与新消息应仍然存在
    const userMsgs = body.messages.filter((m: any) => m.role === "user");
    expect(userMsgs.map((m: any) => m.content)).toEqual(["第一条消息", "请继续。"]);
  });

  it("上下文占用跨过裁剪阈值时应分批裁剪窗口外的旧 tool 结果，窗口内轮次保持原文", async () => {
    const { service, mockRepo, mockModelRepo } = createTestService();
    const { sender } = createMockSender();

    // 使用较小的 contextWindow，便于用少量 prompt_tokens 触发裁剪阈值
    mockModelRepo.getModel.mockResolvedValue({
      id: "test-openai",
      name: "Test",
      provider: "openai",
      apiBaseUrl: "",
      apiKey: "",
      model: "gpt-4o",
      contextWindow: 1000,
    });

    // 使用两个不同名称的工具交替调用，避免触发 tool_call_guard 的重复调用检测
    // （相同工具名连续出现会命中循环检测，暂停询问用户，与本测试无关）
    const registry = (service as any).toolRegistry;
    let callCount = 0;
    const execute = async () => {
      callCount++;
      return `count=${callCount}`;
    };
    registry.registerBuiltin(
      { name: "counterA", description: "Count A", parameters: { type: "object", properties: {} } },
      { execute }
    );
    registry.registerBuiltin(
      { name: "counterB", description: "Count B", parameters: { type: "object", properties: {} } },
      { execute }
    );

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 前 4 轮占用较低；第 5 轮跨过 0.4 阈值（此时恰好 5 轮，保留窗口内不裁剪）；
    // 第 6 轮跨过 0.6 阈值，触发第二次裁剪，第 1 轮此时已超出保留窗口
    const usages = [100, 100, 100, 100, 500, 700];
    for (let i = 0; i < usages.length; i++) {
      const toolName = i % 2 === 0 ? "counterA" : "counterB";
      // 每轮参数不同，避免触发 tool_call_guard 的“相同参数重复调用”检测
      fetchSpy.mockResolvedValueOnce(
        makeToolCallResponseWithUsage([{ id: `c${i + 1}`, name: toolName, arguments: `{"round":${i}}` }], usages[i])
      );
    }
    // 第 7 轮：最终文本，结束循环
    fetchSpy.mockResolvedValueOnce(makeTextResponse("done"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test" }, sender);

    expect(fetchSpy).toHaveBeenCalledTimes(7);

    // 最后一次 fetch（第 7 轮）请求体中，第 1 轮的 tool 结果应已被裁剪为占位文本，
    // 而保留窗口内（第 2~6 轮）应保持原文
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const lastBody = JSON.parse((lastCall[1] as RequestInit).body as string);
    const toolMessages = lastBody.messages.filter((m: any) => m.role === "tool");

    expect(toolMessages).toHaveLength(6);
    expect(toolMessages[0].content).toContain("elided");
    expect(toolMessages[1].content).toBe("count=2");
    expect(toolMessages[toolMessages.length - 1].content).toBe("count=6");

    registry.unregisterBuiltin("counterA");
    registry.unregisterBuiltin("counterB");
  });

  it("工具执行后附件回写：toolCalls 被更新", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    const registry = (service as any).toolRegistry;
    // 注册返回带附件结果的工具
    registry.registerBuiltin(
      { name: "screenshot", description: "Screenshot", parameters: { type: "object", properties: {} } },
      {
        execute: async () => ({
          content: "Screenshot taken",
          attachments: [{ type: "image", name: "shot.png", mimeType: "image/png", data: "base64data" }],
        }),
      }
    );
    // 注入 mock chatRepo 到 registry 用于保存附件
    registry.setChatRepo({
      saveAttachment: vi.fn().mockResolvedValue(1024),
    });

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);
    // appendMessage 后 getMessages 返回含 toolCalls 的 assistant 消息
    const storedMessages: any[] = [];
    mockRepo.appendMessage.mockImplementation(async (msg: any) => {
      storedMessages.push(msg);
    });
    mockRepo.getMessages.mockImplementation(async () => [...storedMessages]);

    // 第一次：tool_call
    fetchSpy.mockResolvedValueOnce(makeToolCallResponse([{ id: "sc1", name: "screenshot", arguments: "{}" }]));
    // 第二次：文本
    fetchSpy.mockResolvedValueOnce(makeTextResponse("done"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "截图" }, sender);

    const events = sentMessages.map((m) => m.data);
    const completeEvent = events.find((e: any) => e.type === "tool_call_complete");
    expect(completeEvent).toBeDefined();
    expect(completeEvent.result).toBe("Screenshot taken");
    expect(completeEvent.attachments).toHaveLength(1);
    expect(completeEvent.attachments[0].type).toBe("image");

    registry.unregisterBuiltin("screenshot");
  });

  it("工具执行完成后：持久化消息的 toolCall.status 应为 completed（否则刷新/重载后图标一直转圈）", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    const registry = (service as any).toolRegistry;
    // 普通工具（无附件），走不到附件回写分支
    registry.registerBuiltin(
      { name: "echo", description: "Echo", parameters: { type: "object", properties: { msg: { type: "string" } } } },
      { execute: async (args: Record<string, unknown>) => `echo: ${args.msg}` }
    );

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);

    // 真实持久化语义：存深拷贝，与内存对象解耦——status 只能靠真正写库变成 completed
    const storedMessages: any[] = [];
    mockRepo.appendMessage.mockImplementation(async (msg: any) => {
      storedMessages.push(structuredClone(msg));
    });
    mockRepo.getMessages.mockImplementation(async () => storedMessages.map((m) => structuredClone(m)));
    mockRepo.saveMessages.mockImplementation(async (_id: string, msgs: any[]) => {
      storedMessages.length = 0;
      storedMessages.push(...msgs.map((m) => structuredClone(m)));
    });

    fetchSpy.mockResolvedValueOnce(makeToolCallResponse([{ id: "call_1", name: "echo", arguments: '{"msg":"hi"}' }]));
    fetchSpy.mockResolvedValueOnce(makeTextResponse("done"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test" }, sender);

    const assistantWithTools = storedMessages.find((m) => m.role === "assistant" && m.toolCalls?.length);
    expect(assistantWithTools).toBeDefined();
    expect(assistantWithTools.toolCalls[0].status).toBe("completed");

    registry.unregisterBuiltin("echo");
  });

  it("同一轮返回多个 tool_call：两个工具都被执行", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    const registry = (service as any).toolRegistry;
    const executedTools: string[] = [];
    registry.registerBuiltin(
      { name: "tool_a", description: "Tool A", parameters: { type: "object", properties: { x: { type: "string" } } } },
      {
        execute: async (args: Record<string, unknown>) => {
          executedTools.push("tool_a");
          return `a: ${args.x}`;
        },
      }
    );
    registry.registerBuiltin(
      { name: "tool_b", description: "Tool B", parameters: { type: "object", properties: { y: { type: "string" } } } },
      {
        execute: async (args: Record<string, unknown>) => {
          executedTools.push("tool_b");
          return `b: ${args.y}`;
        },
      }
    );

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 第一次：同时返回两个 tool_call
    fetchSpy.mockResolvedValueOnce(
      makeToolCallResponse([
        { id: "call_a", name: "tool_a", arguments: '{"x":"hello"}' },
        { id: "call_b", name: "tool_b", arguments: '{"y":"world"}' },
      ])
    );
    // 第二次：纯文本
    fetchSpy.mockResolvedValueOnce(makeTextResponse("完成"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test" }, sender);

    // 两个工具都应被执行
    expect(executedTools).toEqual(["tool_a", "tool_b"]);

    const events = sentMessages.map((m) => m.data);

    // 应有两个 tool_call_start
    const startEvents = events.filter((e: any) => e.type === "tool_call_start");
    expect(startEvents).toHaveLength(2);
    expect(startEvents[0].toolCall.name).toBe("tool_a");
    expect(startEvents[1].toolCall.name).toBe("tool_b");

    // 应有两个 tool_call_complete
    const completeEvents = events.filter((e: any) => e.type === "tool_call_complete");
    expect(completeEvents).toHaveLength(2);
    expect(completeEvents.find((e: any) => e.id === "call_a").result).toBe("a: hello");
    expect(completeEvents.find((e: any) => e.id === "call_b").result).toBe("b: world");

    // 持久化的 assistant 消息应包含两个 toolCalls
    const assistantMsgs = mockRepo.appendMessage.mock.calls
      .map((c: any) => c[0])
      .filter((m: any) => m.role === "assistant" && m.toolCalls);
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0].toolCalls).toHaveLength(2);

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    registry.unregisterBuiltin("tool_a");
    registry.unregisterBuiltin("tool_b");
  });
});
