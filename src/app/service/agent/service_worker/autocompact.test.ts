import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestService, makeSSEResponse } from "./test-helpers";

// ---- Compact 功能测试 ----

describe("Compact 功能", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function makeTextResponseWithTokens(text: string, promptTokens = 10): Response {
    return makeSSEResponse([
      `data: {"choices":[{"delta":{"content":${JSON.stringify(text)}}}]}\n\n`,
      `data: {"usage":{"prompt_tokens":${promptTokens},"completion_tokens":5}}\n\n`,
    ]);
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

  it("手动 compact：LLM 返回带 <summary> 的摘要", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([
      { id: "m1", conversationId: "conv-1", role: "user", content: "Hello", createtime: 1 },
      { id: "m2", conversationId: "conv-1", role: "assistant", content: "Hi there!", createtime: 2 },
    ]);

    const summaryText =
      "<analysis>Some analysis</analysis>\n<summary>User said hello. Assistant greeted back.</summary>";
    fetchSpy.mockResolvedValueOnce(makeTextResponseWithTokens(summaryText));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "", compact: true }, sender);

    // 验证 saveMessages 被调用，替换为摘要消息
    expect(mockRepo.saveMessages).toHaveBeenCalledTimes(1);
    const savedMessages = mockRepo.saveMessages.mock.calls[0][1];
    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].content).toContain("[Conversation Summary]");
    expect(savedMessages[0].content).toContain("User said hello. Assistant greeted back.");
    expect(savedMessages[0].role).toBe("user");

    // 验证发送了 compact_done 和 done 事件
    const events = sentMessages.map((m) => m.data);
    const compactDone = events.find((e: any) => e.type === "compact_done");
    expect(compactDone).toBeDefined();
    expect(compactDone.summary).toBe("User said hello. Assistant greeted back.");
    expect(compactDone.originalCount).toBe(2);
    expect(events.some((e: any) => e.type === "done")).toBe(true);
  });

  it("手动 compact：带自定义指令", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([
      { id: "m1", conversationId: "conv-1", role: "user", content: "Test", createtime: 1 },
    ]);

    fetchSpy.mockResolvedValueOnce(makeTextResponseWithTokens("<summary>Custom summary</summary>"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "", compact: true, compactInstruction: "只保留代码" },
      sender
    );

    // 验证 LLM 请求中包含自定义指令
    const fetchCall = fetchSpy.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    const lastUserMsg = body.messages[body.messages.length - 1];
    expect(lastUserMsg.content).toContain("只保留代码");
  });

  it("手动 compact：空消息时返回错误", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "", compact: true }, sender);

    // 不应调用 saveMessages
    expect(mockRepo.saveMessages).not.toHaveBeenCalled();
    // 不应调用 fetch
    expect(fetchSpy).not.toHaveBeenCalled();
    // 应发送 error 事件
    const events = sentMessages.map((m) => m.data);
    const errorEvent = events.find((e: any) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toBe("No messages to compact");
  });

  it("手动 compact：会话不存在时返回错误", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([]);

    await (service as any).handleConversationChat(
      { conversationId: "nonexistent", message: "", compact: true },
      sender
    );

    const events = sentMessages.map((m) => m.data);
    expect(events.some((e: any) => e.type === "error" && e.message === "Conversation not found")).toBe(true);
  });

  it("自动 compact：usage 超过 80% 阈值时触发", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // gpt-4o contextWindow = 128000
    // 第一次 LLM 调用：返回文本但 inputTokens 超过 80% (110000/128000 ≈ 86%)
    fetchSpy.mockResolvedValueOnce(
      makeSSEResponse([
        `data: {"choices":[{"delta":{"content":"Some response"}}]}\n\n`,
        `data: {"usage":{"prompt_tokens":110000,"completion_tokens":100}}\n\n`,
      ])
    );

    // 第二次 LLM 调用：autoCompact 的摘要请求
    fetchSpy.mockResolvedValueOnce(makeTextResponseWithTokens("<summary>Auto compacted summary</summary>"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test message" }, sender);

    // 验证 autoCompact 被触发：saveMessages 应被调用（用摘要替换历史）
    expect(mockRepo.saveMessages).toHaveBeenCalled();
    const savedMessages = mockRepo.saveMessages.mock.calls[0][1];
    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0].content).toContain("[Conversation Summary]");

    // 验证发送了 compact_done 事件
    const events = sentMessages.map((m) => m.data);
    const compactDone = events.find((e: any) => e.type === "compact_done");
    expect(compactDone).toBeDefined();
    expect(compactDone.originalCount).toBe(-1); // 自动 compact 标记
  });

  it("自动 compact：usage 低于 80% 阈值不触发", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);

    // inputTokens = 50000, contextWindow(gpt-4o) = 128000, 39% < 80%
    fetchSpy.mockResolvedValueOnce(
      makeSSEResponse([
        `data: {"choices":[{"delta":{"content":"OK"}}]}\n\n`,
        `data: {"usage":{"prompt_tokens":50000,"completion_tokens":5}}\n\n`,
      ])
    );

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test" }, sender);

    // saveMessages 不应被调用（没有 compact）
    expect(mockRepo.saveMessages).not.toHaveBeenCalled();
    // fetch 只调用 1 次（正常 LLM 调用）
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
