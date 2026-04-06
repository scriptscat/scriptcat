import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestService, makeTextResponse, createRunningConversation } from "./test-helpers";

// ---- updateStreamingState 快照状态管理 ----

describe("updateStreamingState 快照状态管理", () => {
  it("content_delta 累积文本内容", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    (service as any).bgSessionManager.updateStreamingState(rc, { type: "content_delta", delta: "Hello" });
    (service as any).bgSessionManager.updateStreamingState(rc, { type: "content_delta", delta: " World" });

    expect(rc.streamingState.content).toBe("Hello World");
  });

  it("thinking_delta 累积思考内容", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    (service as any).bgSessionManager.updateStreamingState(rc, { type: "thinking_delta", delta: "Let me " });
    (service as any).bgSessionManager.updateStreamingState(rc, { type: "thinking_delta", delta: "think..." });

    expect(rc.streamingState.thinking).toBe("Let me think...");
  });

  it("tool_call_start/delta/complete 完整追踪工具调用", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    // 开始
    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "tool_call_start",
      toolCall: { id: "tc1", name: "web_search", arguments: "" },
    });
    expect(rc.streamingState.toolCalls).toHaveLength(1);
    expect(rc.streamingState.toolCalls[0].status).toBe("running");

    // 参数增量
    (service as any).bgSessionManager.updateStreamingState(rc, { type: "tool_call_delta", id: "tc1", delta: '{"q":' });
    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "tool_call_delta",
      id: "tc1",
      delta: '"test"}',
    });
    expect(rc.streamingState.toolCalls[0].arguments).toBe('{"q":"test"}');

    // 完成
    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "tool_call_complete",
      id: "tc1",
      result: "search results",
      attachments: [{ id: "att1", type: "file", name: "result.txt", mimeType: "text/plain" }],
    });
    expect(rc.streamingState.toolCalls[0].status).toBe("completed");
    expect(rc.streamingState.toolCalls[0].result).toBe("search results");
    expect(rc.streamingState.toolCalls[0].attachments).toHaveLength(1);
  });

  it("new_message 重置流式状态", () => {
    const { service } = createTestService();
    const rc = createRunningConversation({
      streamingState: {
        content: "old content",
        thinking: "old thinking",
        toolCalls: [{ id: "tc1", name: "t", arguments: "{}", status: "completed" }],
      },
    });

    (service as any).bgSessionManager.updateStreamingState(rc, { type: "new_message" });

    expect(rc.streamingState.content).toBe("");
    expect(rc.streamingState.thinking).toBe("");
    expect(rc.streamingState.toolCalls).toEqual([]);
  });

  it("ask_user 设置 pendingAskUser 状态", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "ask_user",
      id: "ask-1",
      question: "选择颜色",
      options: ["红", "蓝"],
      multiple: false,
    });

    expect(rc.pendingAskUser).toEqual({
      id: "ask-1",
      question: "选择颜色",
      options: ["红", "蓝"],
      multiple: false,
    });
  });

  it("task_update 更新任务列表", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    const tasks = [
      { id: "t1", subject: "步骤1", status: "completed" as const },
      { id: "t2", subject: "步骤2", status: "in_progress" as const, description: "进行中" },
    ];
    (service as any).bgSessionManager.updateStreamingState(rc, { type: "task_update", tasks });

    expect(rc.tasks).toEqual(tasks);
  });

  it("done 设置状态并清除 pendingAskUser", () => {
    const { service } = createTestService();
    const rc = createRunningConversation({
      pendingAskUser: { id: "ask-1", question: "test" },
    });

    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    expect(rc.status).toBe("done");
    expect(rc.pendingAskUser).toBeUndefined();
  });

  it("error 设置状态并清除 pendingAskUser", () => {
    const { service } = createTestService();
    const rc = createRunningConversation({
      pendingAskUser: { id: "ask-1", question: "test" },
    });

    (service as any).bgSessionManager.updateStreamingState(rc, { type: "error", message: "API error" });

    expect(rc.status).toBe("error");
    expect(rc.pendingAskUser).toBeUndefined();
  });

  it("tool_call_complete 对不存在的 id 不报错", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    // 不应抛异常
    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "tool_call_complete",
      id: "nonexistent",
      result: "result",
    });
    expect(rc.streamingState.toolCalls).toHaveLength(0);
  });

  it("tool_call_delta 无工具时不报错", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    // 空 toolCalls 列表时不应报错
    (service as any).bgSessionManager.updateStreamingState(rc, { type: "tool_call_delta", id: "tc1", delta: "data" });
    expect(rc.streamingState.toolCalls).toHaveLength(0);
  });

  it("subAgent 事件不更新父会话的流式状态", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "content_delta",
      delta: "sub-agent text",
      subAgent: { agentId: "sa-1", description: "test" },
    });
    expect(rc.streamingState.content).toBe("");

    (service as any).bgSessionManager.updateStreamingState(rc, {
      type: "tool_call_start",
      toolCall: { id: "tc1", name: "search", arguments: "" },
      subAgent: { agentId: "sa-1", description: "test" },
    });
    expect(rc.streamingState.toolCalls).toHaveLength(0);
  });
});

// ---- broadcastEvent 广播与容错 ----

describe("broadcastEvent 广播与容错", () => {
  it("广播事件到所有 listener", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    const received1: any[] = [];
    const received2: any[] = [];
    rc.listeners.add({ sendEvent: (e: any) => received1.push(e) });
    rc.listeners.add({ sendEvent: (e: any) => received2.push(e) });

    const event = { type: "content_delta" as const, delta: "hi" };
    (service as any).bgSessionManager.broadcastEvent(rc, event);

    expect(received1).toEqual([event]);
    expect(received2).toEqual([event]);
  });

  it("某个 listener 抛异常不影响其他 listener 接收", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    const received: any[] = [];
    rc.listeners.add({
      sendEvent: () => {
        throw new Error("listener disconnected");
      },
    });
    rc.listeners.add({ sendEvent: (e: any) => received.push(e) });

    const event = { type: "content_delta" as const, delta: "hi" };
    // 不应抛异常
    (service as any).bgSessionManager.broadcastEvent(rc, event);

    // 第二个 listener 应正常收到
    expect(received).toEqual([event]);
  });

  it("无 listener 时不报错", () => {
    const { service } = createTestService();
    const rc = createRunningConversation();

    // 空 listeners，不应报错
    (service as any).bgSessionManager.broadcastEvent(rc, { type: "done" as const });
  });
});

// ---- handleAttachToConversation 重连逻辑 ----

describe("handleAttachToConversation 重连逻辑", () => {
  function createMockSender() {
    const sentMessages: any[] = [];
    let messageHandler: ((msg: any) => void) | null = null;
    let disconnectHandler: (() => void) | null = null;
    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: vi.fn((handler: any) => {
        messageHandler = handler;
      }),
      onDisconnect: vi.fn((handler: any) => {
        disconnectHandler = handler;
      }),
    };
    const sender = {
      isType: (type: any) => type === 1,
      getConnect: () => mockConn,
    };
    return {
      sender,
      sentMessages,
      simulateMessage: (msg: any) => messageHandler?.(msg),
      simulateDisconnect: () => disconnectHandler?.(),
    };
  }

  it("会话不在运行中时返回 sync { status: 'done' }", async () => {
    const { service } = createTestService();
    const { sender, sentMessages } = createMockSender();

    await (service as any).handleAttachToConversation({ conversationId: "nonexistent" }, sender);

    const syncEvent = sentMessages.find((m: any) => m.action === "event" && m.data.type === "sync");
    expect(syncEvent).toBeDefined();
    expect(syncEvent.data.status).toBe("done");
    expect(syncEvent.data.tasks).toEqual([]);
    expect(syncEvent.data.streamingMessage).toBeUndefined();
    expect(syncEvent.data.pendingAskUser).toBeUndefined();
  });

  it("运行中的会话发送完整 sync 快照（含 streamingMessage / pendingAskUser / tasks）", async () => {
    const { service } = createTestService();
    const rc = createRunningConversation({
      streamingState: {
        content: "正在分析...",
        thinking: "考虑方案",
        toolCalls: [{ id: "tc1", name: "search", arguments: "{}", status: "completed", result: "ok" }],
      },
      pendingAskUser: { id: "ask-1", question: "请选择", options: ["A", "B"] },
      tasks: [{ id: "t1", subject: "第一步", status: "in_progress" }],
      status: "running",
    });
    (service as any).bgSessionManager.set("conv-sync", rc);

    const { sender, sentMessages } = createMockSender();
    await (service as any).handleAttachToConversation({ conversationId: "conv-sync" }, sender);

    const syncEvent = sentMessages.find((m: any) => m.action === "event" && m.data.type === "sync");
    expect(syncEvent).toBeDefined();
    expect(syncEvent.data.status).toBe("running");
    expect(syncEvent.data.streamingMessage).toEqual({
      content: "正在分析...",
      thinking: "考虑方案",
      toolCalls: [{ id: "tc1", name: "search", arguments: "{}", status: "completed", result: "ok" }],
    });
    expect(syncEvent.data.pendingAskUser).toEqual({ id: "ask-1", question: "请选择", options: ["A", "B"] });
    expect(syncEvent.data.tasks).toEqual([{ id: "t1", subject: "第一步", status: "in_progress" }]);

    // 清理
    (service as any).bgSessionManager.delete("conv-sync");
  });

  it("已完成的会话不添加 listener", async () => {
    const { service } = createTestService();
    const rc = createRunningConversation({ status: "done" });
    (service as any).bgSessionManager.set("conv-done", rc);

    const { sender } = createMockSender();
    await (service as any).handleAttachToConversation({ conversationId: "conv-done" }, sender);

    // listener 不应被添加
    expect(rc.listeners.size).toBe(0);

    (service as any).bgSessionManager.delete("conv-done");
  });

  it("运行中的会话添加 listener，断开时移除", async () => {
    const { service } = createTestService();
    const rc = createRunningConversation({ status: "running" });
    (service as any).bgSessionManager.set("conv-run", rc);

    const { sender, simulateDisconnect } = createMockSender();
    await (service as any).handleAttachToConversation({ conversationId: "conv-run" }, sender);

    expect(rc.listeners.size).toBe(1);

    // 断开后移除
    simulateDisconnect();
    expect(rc.listeners.size).toBe(0);

    (service as any).bgSessionManager.delete("conv-run");
  });

  it("通过 attach 发送 askUserResponse 能正确 resolve", async () => {
    const { service } = createTestService();
    const rc = createRunningConversation({ status: "running" });

    // 注册一个 askResolver
    let resolvedAnswer: string | undefined;
    rc.askResolvers.set("ask-1", (answer: string) => {
      resolvedAnswer = answer;
    });
    rc.pendingAskUser = { id: "ask-1", question: "选择" };
    (service as any).bgSessionManager.set("conv-ask", rc);

    const { sender, simulateMessage } = createMockSender();
    await (service as any).handleAttachToConversation({ conversationId: "conv-ask" }, sender);

    // 模拟 UI 回复 ask_user
    simulateMessage({ action: "askUserResponse", data: { id: "ask-1", answer: "红色" } });

    expect(resolvedAnswer).toBe("红色");
    expect(rc.pendingAskUser).toBeUndefined();
    expect(rc.askResolvers.has("ask-1")).toBe(false);

    (service as any).bgSessionManager.delete("conv-ask");
  });

  it("多个 listener 回复同一 ask_user 只有第一个生效", async () => {
    const { service } = createTestService();
    const rc = createRunningConversation({ status: "running" });

    let resolveCount = 0;
    let lastAnswer = "";
    rc.askResolvers.set("ask-1", (answer: string) => {
      resolveCount++;
      lastAnswer = answer;
    });
    rc.pendingAskUser = { id: "ask-1", question: "选择" };
    (service as any).bgSessionManager.set("conv-multi", rc);

    const { sender: sender1, simulateMessage: sim1 } = createMockSender();
    const { sender: sender2, simulateMessage: sim2 } = createMockSender();
    await (service as any).handleAttachToConversation({ conversationId: "conv-multi" }, sender1);
    await (service as any).handleAttachToConversation({ conversationId: "conv-multi" }, sender2);

    // 两个 listener 同时回复
    sim1({ action: "askUserResponse", data: { id: "ask-1", answer: "第一个" } });
    sim2({ action: "askUserResponse", data: { id: "ask-1", answer: "第二个" } });

    expect(resolveCount).toBe(1);
    expect(lastAnswer).toBe("第一个");

    (service as any).bgSessionManager.delete("conv-multi");
  });

  it("通过 attach 发送 stop 能中止会话", async () => {
    const { service } = createTestService();
    const rc = createRunningConversation({ status: "running" });
    (service as any).bgSessionManager.set("conv-stop", rc);

    const { sender, simulateMessage } = createMockSender();
    await (service as any).handleAttachToConversation({ conversationId: "conv-stop" }, sender);

    simulateMessage({ action: "stop" });

    expect(rc.abortController.signal.aborted).toBe(true);

    (service as any).bgSessionManager.delete("conv-stop");
  });

  it("空 streamingState 的 sync 不包含 streamingMessage 字段", async () => {
    const { service } = createTestService();
    const rc = createRunningConversation({ status: "running" });
    (service as any).bgSessionManager.set("conv-empty", rc);

    const { sender, sentMessages } = createMockSender();
    await (service as any).handleAttachToConversation({ conversationId: "conv-empty" }, sender);

    const syncEvent = sentMessages.find((m: any) => m.action === "event" && m.data.type === "sync");
    expect(syncEvent.data.streamingMessage).toBeUndefined();

    (service as any).bgSessionManager.delete("conv-empty");
  });
});

// ---- 后台运行会话 集成测试 ----

describe("后台运行会话 集成测试", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function createMockSender() {
    const sentMessages: any[] = [];
    let messageHandler: ((msg: any) => void) | null = null;
    let disconnectHandler: (() => void) | null = null;
    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: vi.fn((handler: any) => {
        messageHandler = handler;
      }),
      onDisconnect: vi.fn((handler: any) => {
        disconnectHandler = handler;
      }),
    };
    const sender = {
      isType: (type: any) => type === 1,
      getConnect: () => mockConn,
    };
    return {
      sender,
      sentMessages,
      simulateMessage: (msg: any) => messageHandler?.(msg),
      simulateDisconnect: () => disconnectHandler?.(),
    };
  }

  function setupConversation(mockRepo: any) {
    const conv = {
      id: "conv-bg",
      title: "BG Chat",
      modelId: "test-openai",
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    mockRepo.listConversations.mockResolvedValue([conv]);
    return conv;
  }

  it("后台模式：listener 断开不中止会话，消息仍然持久化", async () => {
    const { service, mockRepo } = createTestService();
    setupConversation(mockRepo);

    const { sender, simulateDisconnect } = createMockSender();

    const encoder = new TextEncoder();
    let readCalled = 0;
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            readCalled++;
            if (readCalled === 1) {
              return {
                done: false,
                value: encoder.encode(`data: {"choices":[{"delta":{"content":"hello"}}]}\n\n`),
              };
            }
            if (readCalled === 2) {
              // 在第二次 read 前断开 listener
              simulateDisconnect();
              await new Promise((r) => setTimeout(r, 10));
              return {
                done: false,
                value: encoder.encode(`data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`),
              };
            }
            return { done: true, value: undefined };
          },
          releaseLock: () => {},
          cancel: async () => {},
          closed: Promise.resolve(undefined),
        }),
      },
      text: async () => "",
    } as unknown as Response);

    await (service as any).handleConversationChat(
      { conversationId: "conv-bg", message: "test", background: true },
      sender
    );

    // 会话应正常完成（消息已持久化）
    expect(mockRepo.appendMessage).toHaveBeenCalled();

    // runningConversations 应包含该会话（延迟清理中）
    const rc = (service as any).bgSessionManager.get("conv-bg");
    expect(rc).toBeDefined();
    expect(rc.status).toBe("done");
  });

  it("后台模式：同会话并发请求被拒绝", async () => {
    const { service, mockRepo } = createTestService();
    setupConversation(mockRepo);

    let resolveRead: () => void;
    const readPromise = new Promise<void>((r) => {
      resolveRead = r;
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            return readPromise.then(() => ({ done: true, value: undefined }));
          },
          releaseLock: () => {},
          cancel: async () => {},
          closed: Promise.resolve(undefined),
        }),
      },
      text: async () => "",
    } as unknown as Response);

    const { sender: sender1 } = createMockSender();
    const { sender: sender2, sentMessages: msgs2 } = createMockSender();

    const promise1 = (service as any).handleConversationChat(
      { conversationId: "conv-bg", message: "test", background: true },
      sender1
    );

    await new Promise((r) => setTimeout(r, 10));

    // 第二个请求应被拒绝
    await (service as any).handleConversationChat(
      { conversationId: "conv-bg", message: "test2", background: true },
      sender2
    );

    const errorEvent = msgs2.find((m: any) => m.action === "event" && m.data.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.message).toContain("正在运行中");

    resolveRead!();
    await promise1;
  });

  it("非后台模式：保持原有行为（不注册到 runningConversations）", async () => {
    const { service, mockRepo } = createTestService();
    setupConversation(mockRepo);

    const { sender, sentMessages } = createMockSender();

    fetchSpy.mockResolvedValueOnce(makeTextResponse("你好"));

    await (service as any).handleConversationChat({ conversationId: "conv-bg", message: "test" }, sender);

    expect((service as any).bgSessionManager.has("conv-bg")).toBe(false);

    const events = sentMessages.filter((m: any) => m.action === "event").map((m: any) => m.data);
    expect(events.some((e: any) => e.type === "done")).toBe(true);
  });

  it("后台模式：stop 指令中止会话后不抛未捕获异常", async () => {
    const { service, mockRepo } = createTestService();
    setupConversation(mockRepo);

    const { sender, simulateMessage } = createMockSender();

    fetchSpy.mockImplementation(async (_url: any, init: any) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      await new Promise((r) => setTimeout(r, 50));
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      return makeTextResponse("hello");
    });

    const chatPromise = (service as any).handleConversationChat(
      { conversationId: "conv-bg", message: "test", background: true },
      sender
    );

    await new Promise((r) => setTimeout(r, 10));
    simulateMessage({ action: "stop" });

    await chatPromise;
    // 不应抛异常
  });

  it("getRunningConversationIds 返回正确的 ID 列表", () => {
    const { service } = createTestService();

    expect(service.getRunningConversationIds()).toEqual([]);

    (service as any).bgSessionManager.set("conv-1", { status: "running" });
    (service as any).bgSessionManager.set("conv-2", { status: "done" });

    const ids = service.getRunningConversationIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain("conv-1");
    expect(ids).toContain("conv-2");

    (service as any).bgSessionManager.delete("conv-1");
    (service as any).bgSessionManager.delete("conv-2");
  });
});
