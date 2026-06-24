import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestService, makeSkillRecord, makeSkillScriptRecord, makeTextResponse } from "./test-helpers";

// ---- handleConversationChat skipSaveUserMessage（重新生成 bug 修复验证）----

describe("handleConversationChat skipSaveUserMessage", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function createMockSender() {
    const sentMessages: any[] = [];
    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const sender = {
      isType: (type: any) => type === 1, // GetSenderType.CONNECT
      getConnect: () => mockConn,
    };
    return { sender, sentMessages };
  }

  // 已存在于 storage 中的用户消息（模拟重新生成场景）
  const EXISTING_USER_MSG = {
    id: "existing-u1",
    conversationId: "conv-1",
    role: "user" as const,
    content: "你好",
    createtime: 1000,
  };

  const BASE_CONV = {
    id: "conv-1",
    title: "Test",
    modelId: "test-openai",
    createtime: Date.now(),
    updatetime: Date.now(),
  };

  it("【默认行为】不传 skipSaveUserMessage：用户消息应被保存到 storage", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]); // 空历史
    fetchSpy.mockResolvedValueOnce(makeTextResponse("你好！"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "你好", modelId: "test-openai" },
      sender
    );

    const appendCalls: any[][] = mockRepo.appendMessage.mock.calls;
    const userCall = appendCalls.find((c) => c[0].role === "user");
    expect(userCall).toBeDefined();
    expect(userCall![0].content).toBe("你好");
  });

  it("【bug 回归】skipSaveUserMessage=true：用户消息不应再次保存到 storage", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    // storage 中已有用户消息（重新生成场景）
    mockRepo.getMessages.mockResolvedValue([EXISTING_USER_MSG]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("你好！"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "你好", modelId: "test-openai", skipSaveUserMessage: true },
      sender
    );

    const appendCalls: any[][] = mockRepo.appendMessage.mock.calls;
    // user 角色消息不应被再次保存
    const userCall = appendCalls.find((c) => c[0].role === "user");
    expect(userCall).toBeUndefined();

    // assistant 回复仍应被保存
    const assistantCall = appendCalls.find((c) => c[0].role === "assistant");
    expect(assistantCall).toBeDefined();
    expect(assistantCall![0].content).toBe("你好！");
  });

  it("【bug 回归】skipSaveUserMessage=true：LLM 请求中用户消息不应出现两次", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    // storage 中已有用户消息
    mockRepo.getMessages.mockResolvedValue([EXISTING_USER_MSG]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("你好！"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "你好", modelId: "test-openai", skipSaveUserMessage: true },
      sender
    );

    // 检查发往 LLM 的请求 body
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const userMessages = requestBody.messages.filter((m: any) => m.role === "user");

    // 用户消息只应出现一次（来自 existingMessages，不应被重复追加）
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("你好");
  });

  it("skipSaveUserMessage=false（默认）：LLM 收到 user message（来自 params.message 追加）", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]); // 空历史
    fetchSpy.mockResolvedValueOnce(makeTextResponse("你好！"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "你好", modelId: "test-openai" },
      sender
    );

    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const userMessages = requestBody.messages.filter((m: any) => m.role === "user");

    // 历史为空时，用户消息应来自 params.message 追加，只出现一次
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("你好");
  });

  it("skipSaveUserMessage=true：对话标题不应被更新（用户消息已在历史中）", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    const conv = { ...BASE_CONV, title: "New Chat" };
    mockRepo.listConversations.mockResolvedValue([conv]);
    // existingMessages 非空 → 标题更新条件（length === 0）不满足
    mockRepo.getMessages.mockResolvedValue([EXISTING_USER_MSG]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("你好！"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "你好", modelId: "test-openai", skipSaveUserMessage: true },
      sender
    );

    // saveConversation 不应以更新标题为目的被调用（title 仍应为 "New Chat"）
    const saveConvCalls: any[][] = mockRepo.saveConversation.mock.calls;
    const titleUpdated = saveConvCalls.some((c) => c[0].title !== "New Chat");
    expect(titleUpdated).toBe(false);
  });

  it("多轮对话中 skipSaveUserMessage=true：历史消息完整传入 LLM", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    // 两轮历史 + 第三条用户消息待重新生成
    mockRepo.getMessages.mockResolvedValue([
      { id: "u1", conversationId: "conv-1", role: "user", content: "第一条", createtime: 1000 },
      { id: "a1", conversationId: "conv-1", role: "assistant", content: "回复一", createtime: 1001 },
      { id: "u2", conversationId: "conv-1", role: "user", content: "第二条", createtime: 1002 },
    ]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("回复二"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "第二条", modelId: "test-openai", skipSaveUserMessage: true },
      sender
    );

    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    // 过滤 system 消息
    const nonSystem = requestBody.messages.filter((m: any) => m.role !== "system");

    // 应有 user("第一条"), assistant("回复一"), user("第二条") — 共 3 条，无重复
    expect(nonSystem).toHaveLength(3);
    expect(nonSystem[0]).toMatchObject({ role: "user", content: "第一条" });
    expect(nonSystem[1]).toMatchObject({ role: "assistant", content: "回复一" });
    expect(nonSystem[2]).toMatchObject({ role: "user", content: "第二条" });
  });
});

// ---- handleConversationChat 场景补充 ----

describe("handleConversationChat 场景补充", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

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

  it("对话标题自动更新：第一条消息时 title 从 New Chat 变成消息截断", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    const conv = {
      id: "conv-1",
      title: "New Chat",
      modelId: "test-openai",
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    mockRepo.listConversations.mockResolvedValue([conv]);
    mockRepo.getMessages.mockResolvedValue([]); // 空历史 → 第一条消息
    fetchSpy.mockResolvedValueOnce(makeTextResponse("ok"));

    // 使用超过 30 个字符的消息（中文和英文混合确保超过 30 字符）
    const longMessage = "This is a very long message that is used for testing title truncation behavior";
    await (service as any).handleConversationChat({ conversationId: "conv-1", message: longMessage }, sender);

    // saveConversation 应被调用，标题为截断后的消息
    const saveCalls = mockRepo.saveConversation.mock.calls;
    const titleUpdate = saveCalls.find((c: any) => c[0].title !== "New Chat");
    expect(titleUpdate).toBeDefined();
    expect(titleUpdate![0].title).toBe(longMessage.slice(0, 30) + "...");
  });

  it("ephemeral 模式：不走 repo 持久化", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    fetchSpy.mockResolvedValueOnce(makeTextResponse("ephemeral reply"));

    await (service as any).handleConversationChat(
      {
        conversationId: "eph-1",
        message: "hi",
        ephemeral: true,
        messages: [{ role: "user", content: "hi" }],
        system: "You are a helper.",
      },
      sender
    );

    // ephemeral 模式不应查询 conversation
    expect(mockRepo.listConversations).not.toHaveBeenCalled();
    // 不应持久化消息
    expect(mockRepo.appendMessage).not.toHaveBeenCalled();

    // 但应收到 done 事件
    const events = sentMessages.map((m) => m.data);
    expect(events.some((e: any) => e.type === "done")).toBe(true);
  });

  it("modelId 覆盖：传入新 modelId 时更新 conversation", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    // 添加第二个 model
    const modelRepo = (service as any).modelService.modelRepo;
    modelRepo.getModel.mockImplementation((id: string) => {
      if (id === "test-openai")
        return Promise.resolve({
          id: "test-openai",
          name: "Test",
          provider: "openai",
          apiBaseUrl: "",
          apiKey: "",
          model: "gpt-4o",
        });
      if (id === "test-openai-2")
        return Promise.resolve({
          id: "test-openai-2",
          name: "Test2",
          provider: "openai",
          apiBaseUrl: "",
          apiKey: "",
          model: "gpt-4o-mini",
        });
      return Promise.resolve(undefined);
    });

    const conv = {
      id: "conv-1",
      title: "Test",
      modelId: "test-openai",
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    mockRepo.listConversations.mockResolvedValue([conv]);
    mockRepo.getMessages.mockResolvedValue([]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("ok"));

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "hi", modelId: "test-openai-2" },
      sender
    );

    // conversation 应被保存，modelId 更新为 test-openai-2
    const saveConvCalls = mockRepo.saveConversation.mock.calls;
    const modelUpdate = saveConvCalls.find((c: any) => c[0].modelId === "test-openai-2");
    expect(modelUpdate).toBeDefined();
  });

  it("conversation 不存在时 sendEvent error", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    mockRepo.listConversations.mockResolvedValue([]); // 空

    await (service as any).handleConversationChat({ conversationId: "not-exist", message: "hi" }, sender);

    const events = sentMessages.map((m) => m.data);
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].message).toContain("Conversation not found");
  });

  it("skill 预加载：历史消息含 load_skill 调用时预执行以标记 skill 已加载", async () => {
    const { service, mockRepo, mockSkillRepo } = createTestService();
    const { sender } = createMockSender();

    // 设置 skill
    const skill = makeSkillRecord({
      name: "web-skill",
      toolNames: ["web-tool"],
      prompt: "Web instructions.",
    });
    (service as any).skillService.skillCache.set("web-skill", skill);

    const toolRecord = makeSkillScriptRecord({
      name: "web-tool",
      description: "Web tool",
      params: [],
    });
    mockSkillRepo.getSkillScripts.mockResolvedValueOnce([toolRecord]);

    const conv = {
      id: "conv-1",
      title: "Test",
      modelId: "test-openai",
      skills: "auto" as const,
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    mockRepo.listConversations.mockResolvedValue([conv]);
    // 历史中含 load_skill 调用
    mockRepo.getMessages.mockResolvedValue([
      {
        id: "u1",
        conversationId: "conv-1",
        role: "user",
        content: "帮我查网页",
        createtime: 1000,
      },
      {
        id: "a1",
        conversationId: "conv-1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "load_skill", arguments: '{"skill_name":"web-skill"}' }],
        createtime: 1001,
      },
      {
        id: "t1",
        conversationId: "conv-1",
        role: "tool",
        content: "Web instructions.",
        toolCallId: "tc1",
        createtime: 1002,
      },
    ]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("ok"));

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "继续" }, sender);

    // getSkillScripts 应被调用以预加载 web-skill 的脚本描述
    expect(mockSkillRepo.getSkillScripts).toHaveBeenCalledWith("web-skill");

    // 发送给 LLM 的工具列表应包含 execute_skill_script（而非动态注册的独立工具）
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const toolNames = requestBody.tools?.map((t: any) => t.function?.name || t.name) || [];
    expect(toolNames).toContain("execute_skill_script");
    expect(toolNames).toContain("load_skill");
  });
});

// ---- AgentService.handleDomApi 测试 ----

describe.concurrent("AgentService.handleDomApi", () => {
  it.concurrent("应将请求转发到 domService.handleDomApi", async () => {
    const { service } = createTestService();
    const mockResult = [{ id: 1, title: "Test Tab", url: "https://example.com" }];
    const mockHandleDomApi = vi.fn().mockResolvedValue(mockResult);
    (service as any).domService = { handleDomApi: mockHandleDomApi };

    const request = { action: "listTabs" as const, scriptUuid: "test" };
    const result = await service.handleDomApi(request);

    expect(mockHandleDomApi).toHaveBeenCalledWith(request);
    expect(result).toEqual(mockResult);
  });

  it.concurrent("应正确传递 domService 的错误", async () => {
    const { service } = createTestService();
    const mockHandleDomApi = vi.fn().mockRejectedValue(new Error("DOM action failed"));
    (service as any).domService = { handleDomApi: mockHandleDomApi };

    await expect(service.handleDomApi({ action: "listTabs", scriptUuid: "test" })).rejects.toThrow("DOM action failed");
  });
});

// ---- handleModelApi 测试 ----

describe.concurrent("handleModelApi", () => {
  it.concurrent("list 应返回去掉 apiKey 的模型列表", async () => {
    const { service, mockModelRepo } = createTestService();
    mockModelRepo.listModels.mockResolvedValueOnce([
      {
        id: "m1",
        name: "GPT-4o",
        provider: "openai",
        apiBaseUrl: "https://api.openai.com",
        apiKey: "sk-secret",
        model: "gpt-4o",
      },
      {
        id: "m2",
        name: "Claude",
        provider: "anthropic",
        apiBaseUrl: "https://api.anthropic.com",
        apiKey: "ant-secret",
        model: "claude-sonnet-4-20250514",
        maxTokens: 4096,
      },
    ]);

    const result = await service.handleModelApi({ action: "list", scriptUuid: "test" });
    expect(Array.isArray(result)).toBe(true);
    const models = result as any[];
    expect(models).toHaveLength(2);

    // apiKey 必须被剥离
    for (const m of models) {
      expect(m).not.toHaveProperty("apiKey");
    }

    // 其他字段保留
    expect(models[0]).toEqual({
      id: "m1",
      name: "GPT-4o",
      provider: "openai",
      apiBaseUrl: "https://api.openai.com",
      model: "gpt-4o",
      supportsVision: true,
      supportsImageOutput: true,
    });
    expect(models[1]).toEqual({
      id: "m2",
      name: "Claude",
      provider: "anthropic",
      apiBaseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      supportsVision: true,
      supportsImageOutput: false,
    });
  });

  it.concurrent("get 存在的模型应返回去掉 apiKey 的结果", async () => {
    const { service, mockModelRepo } = createTestService();
    mockModelRepo.getModel.mockResolvedValueOnce({
      id: "m1",
      name: "GPT-4o",
      provider: "openai",
      apiBaseUrl: "https://api.openai.com",
      apiKey: "sk-secret",
      model: "gpt-4o",
    });

    const result = await service.handleModelApi({ action: "get", id: "m1", scriptUuid: "test" });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("apiKey");
    expect((result as any).id).toBe("m1");
  });

  it.concurrent("get 不存在的模型应返回 null", async () => {
    const { service, mockModelRepo } = createTestService();
    mockModelRepo.getModel.mockResolvedValueOnce(undefined);

    const result = await service.handleModelApi({ action: "get", id: "nonexistent", scriptUuid: "test" });
    expect(result).toBeNull();
  });

  it.concurrent("getDefault 应返回默认模型 ID", async () => {
    const { service, mockModelRepo } = createTestService();
    mockModelRepo.getDefaultModelId.mockResolvedValueOnce("m1");

    const result = await service.handleModelApi({ action: "getDefault", scriptUuid: "test" });
    expect(result).toBe("m1");
  });

  it.concurrent("未知 action 应抛出错误", async () => {
    const { service } = createTestService();

    await expect(service.handleModelApi({ action: "unknown" as any, scriptUuid: "test" })).rejects.toThrow(
      "Unknown model API action"
    );
  });
});
