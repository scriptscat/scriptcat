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
      getSender: () => ({ url: chrome.runtime.getURL("src/options.html#/agent/chat") }),
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

  it("仅 UI 明确声明的新上传附件应随用户消息持久化所有权", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();
    mockRepo.listConversations.mockResolvedValue([BASE_CONV]);
    mockRepo.getMessages.mockResolvedValue([]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("收到"));

    await (service as any).handleConversationChat(
      {
        conversationId: "conv-1",
        message: [{ type: "image", attachmentId: "upload.png", mimeType: "image/png" }],
        ownedAttachmentIds: ["upload.png"],
      },
      sender
    );

    const userMessage = mockRepo.appendMessage.mock.calls.find((call: any[]) => call[0].role === "user")?.[0];
    expect(userMessage.ownedAttachmentIds).toEqual(["upload.png"]);
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

describe("userscript 会话工具隔离", () => {
  it("携带 scriptUuid 时不注册无法交互的 ask_user 工具", async () => {
    const { service } = createTestService();
    const chatService = (service as any).chatService;
    const result = await chatService.buildSessionToolRegistry({
      conv: {
        id: "conv-script",
        title: "Script",
        modelId: "test-openai",
        createtime: 1,
        updatetime: 1,
      },
      model: {
        id: "test-openai",
        name: "Test",
        provider: "openai",
        apiBaseUrl: "",
        apiKey: "",
        model: "gpt-4o",
      },
      params: { conversationId: "conv-script", message: "hi", scriptUuid: "script-1" },
      sendEvent: vi.fn(),
      abortController: new AbortController(),
      askResolvers: new Map(),
    });

    expect(result.sessionRegistry.getDefinitions().some((tool: any) => tool.name === "ask_user")).toBe(false);
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
      getSender: () => ({ url: chrome.runtime.getURL("src/options.html#/agent/chat") }),
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

    await (service as any).handleConversationChat(
      { conversationId: "not-exist", message: "hi", ownedAttachmentIds: ["provisional.png"] },
      sender
    );

    const events = sentMessages.map((m) => m.data);
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].message).toContain("Conversation not found");
    expect(mockRepo.deleteAttachment).toHaveBeenCalledWith("provisional.png");
  });

  it("调用方持有的 generation 与当前存储不一致时应拒绝 chat，而不是作用于新一代会话", async () => {
    const { service, mockRepo } = createTestService();
    const { sender, sentMessages } = createMockSender();

    // conv-1 的 ID 被删除重建，当前存储的 generation 已经变成 "gen-b"
    const conv = {
      id: "conv-1",
      title: "Test",
      modelId: "test-openai",
      generation: "gen-b",
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    mockRepo.listConversations.mockResolvedValue([conv]);
    mockRepo.getMessages.mockResolvedValue([]);

    // 陈旧的 ConversationInstance 仍持有创建时的 generation "gen-a"
    await (service as any).handleConversationChat(
      { conversationId: "conv-1", generation: "gen-a", message: "hi" },
      sender
    );

    const events = sentMessages.map((m) => m.data);
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].errorCode).toBe("conversation_generation_mismatch");
    // 不应触发任何 LLM 调用或持久化写入
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRepo.appendMessage).not.toHaveBeenCalled();
  });

  it("handleConversation 的 getMessages/clearMessages 在 generation 不一致时应拒绝而非作用于新一代会话", async () => {
    const { service, mockRepo } = createTestService();

    const conv = {
      id: "conv-1",
      title: "Test",
      modelId: "test-openai",
      generation: "gen-b",
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    mockRepo.listConversations.mockResolvedValue([conv]);
    // 模拟真实 repo 行为：generation 提供且与当前存储不一致时拒绝
    mockRepo.getMessageSnapshot.mockImplementation(async (_conversationId: string, generation?: string) => {
      if (generation !== undefined && generation !== "gen-b") {
        throw new Error(`Conversation "conv-1" changed or was deleted`);
      }
      return { generation: "gen-b", revision: 3, messages: [] };
    });

    await expect(
      (service as any).handleConversation({
        action: "getMessages",
        conversationId: "conv-1",
        generation: "gen-a",
        scriptUuid: "script-1",
      })
    ).rejects.toThrow();

    await expect(
      (service as any).handleConversation({
        action: "clearMessages",
        conversationId: "conv-1",
        generation: "gen-a",
        scriptUuid: "script-1",
      })
    ).rejects.toThrow();

    // 拒绝路径不应触及持久化写入
    expect(mockRepo.saveMessages).not.toHaveBeenCalled();
  });

  it("用户消息 append 报错但确认读证实已落盘时，不应删除刚上传的附件", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();

    const conv = {
      id: "conv-1",
      title: "Test",
      modelId: "test-openai",
      generation: "gen-1",
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    mockRepo.listConversations.mockResolvedValue([conv]);
    mockRepo.getMessages.mockResolvedValue([]);
    fetchSpy.mockResolvedValueOnce(makeTextResponse("收到"));

    let appended: any;
    mockRepo.appendMessage.mockImplementationOnce(async (message: any) => {
      // 写入其实已经落盘（模拟 OPFS close 报告二义性错误前已经 commit）
      appended = message;
      throw new Error("ambiguous close failure");
    });
    mockRepo.getMessageSnapshot.mockImplementation(async () => ({
      generation: "gen-1",
      revision: 1,
      messages: appended ? [appended] : [],
    }));

    await (service as any).handleConversationChat(
      {
        conversationId: "conv-1",
        message: [{ type: "image", attachmentId: "upload.png", mimeType: "image/png" }],
        ownedAttachmentIds: ["upload.png"],
      },
      sender
    );

    // 已确认落盘：不能把二义性错误当作"未持久化"从而删除消息实际引用的附件
    expect(mockRepo.deleteAttachment).not.toHaveBeenCalledWith("upload.png");
  });

  it("用户消息 append 报错且确认读也失败时，不应删除可能已被消息引用的附件", async () => {
    const { service, mockRepo } = createTestService();
    const { sender } = createMockSender();
    mockRepo.listConversations.mockResolvedValue([
      {
        id: "conv-1",
        title: "Test",
        modelId: "test-openai",
        generation: "gen-1",
        createtime: Date.now(),
        updatetime: Date.now(),
      },
    ]);
    mockRepo.getMessages.mockResolvedValue([]);
    mockRepo.appendMessage.mockRejectedValueOnce(new Error("ambiguous close failure"));
    mockRepo.getMessageSnapshot.mockRejectedValueOnce(new Error("confirmation read failed"));

    await (service as any).handleConversationChat(
      {
        conversationId: "conv-1",
        message: [{ type: "image", attachmentId: "upload-uncertain.png", mimeType: "image/png" }],
        ownedAttachmentIds: ["upload-uncertain.png"],
      },
      sender
    );

    expect(mockRepo.deleteAttachment).not.toHaveBeenCalledWith("upload-uncertain.png");
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

// ---- 脚本工具回调：abort/disconnect/超时应结束等待，而不是永远挂起 ----

describe("scriptToolCallback 的 abort/disconnect/超时处理", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // 带 message/disconnect 模拟回调的 mock sender（脚本工具不会主动回复 toolResults）
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
      getSender: () => ({ url: chrome.runtime.getURL("src/options.html#/agent/chat") }),
    };
    return {
      sender,
      sentMessages,
      simulateMessage: (msg: any) => messageHandler?.(msg),
      simulateDisconnect: () => disconnectHandler?.(),
    };
  }

  // 构造带脚本自定义工具调用（非内置工具，走 scriptCallback）的 OpenAI SSE 响应
  function makeScriptToolCallResponse(toolId: string, toolName: string, args: string): Response {
    const encoder = new TextEncoder();
    const chunks = [
      `data: {"choices":[{"delta":{"tool_calls":[{"id":"${toolId}","function":{"name":"${toolName}","arguments":""}}]}}]}\n\n`,
      `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":${JSON.stringify(args)}}}]}, "finish_reason":"tool_calls"}]}\n\n`,
      `data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`,
    ];
    let i = 0;
    return {
      ok: true,
      status: 200,
      body: {
        getReader() {
          return {
            async read() {
              if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]) };
              return { done: true, value: undefined };
            },
            cancel: async () => {},
          };
        },
      },
    } as unknown as Response;
  }

  function setupConversation(mockRepo: any) {
    mockRepo.listConversations.mockResolvedValue([
      { id: "conv-script", title: "Chat", modelId: "test-openai", createtime: Date.now(), updatetime: Date.now() },
    ]);
    mockRepo.getMessages.mockResolvedValue([]);
  }

  it("脚本工具返回结果时，应继续工具循环并完成对话", async () => {
    const { service, mockRepo } = createTestService();
    setupConversation(mockRepo);
    const { sender, sentMessages, simulateMessage } = createMockSender();

    fetchSpy
      .mockResolvedValueOnce(makeScriptToolCallResponse("call-success", "my_tool", "{}"))
      .mockResolvedValueOnce(makeTextResponse("最终回复"));

    const chatPromise = (service as any).handleConversationChat(
      {
        conversationId: "conv-script",
        message: "使用工具",
        tools: [{ name: "my_tool", description: "d", parameters: { type: "object", properties: {} } }],
      },
      sender
    );

    await vi.waitFor(() => {
      expect(sentMessages.some((message) => message.action === "executeTools")).toBe(true);
    });
    const executeMessage = sentMessages.find((message) => message.action === "executeTools");
    simulateMessage({
      action: "toolResults",
      requestId: executeMessage.requestId,
      data: [{ id: "call-success", result: "ok" }],
    });

    await expect(chatPromise).resolves.toBeUndefined();
    expect(sentMessages.some((message) => message.data?.type === "done")).toBe(true);
  });

  it("非后台会话断开（触发 abort）时，等待中的脚本工具调用应立即结束，而不是永远挂起", async () => {
    const { service, mockRepo } = createTestService();
    setupConversation(mockRepo);
    const { sender, simulateDisconnect } = createMockSender();

    fetchSpy.mockResolvedValueOnce(makeScriptToolCallResponse("call-1", "my_tool", "{}"));

    const chatPromise = (service as any).handleConversationChat(
      {
        conversationId: "conv-script",
        message: "使用工具",
        tools: [{ name: "my_tool", description: "d", parameters: { type: "object", properties: {} } }],
      },
      sender
    );

    // 等待 SSE 响应被消费、executeTools 消息发出，进入"等待 toolResults"状态
    await new Promise((r) => setTimeout(r, 20));
    simulateDisconnect();

    // 若脚本工具回调未结束，chatPromise 永远不会 resolve，下面的 race 会超时
    const TIMEOUT = Symbol("timeout");
    const result = await Promise.race([
      chatPromise.then(() => "done"),
      new Promise((r) => setTimeout(() => r(TIMEOUT), 500)),
    ]);
    expect(result).toBe("done");
  });

  it("脚本连接长时间无响应（超时）时，应主动结束该轮脚本工具调用而不是无限期等待", async () => {
    vi.useFakeTimers();
    try {
      const { service, mockRepo } = createTestService();
      setupConversation(mockRepo);
      const { sender, sentMessages } = createMockSender();

      fetchSpy
        .mockResolvedValueOnce(makeScriptToolCallResponse("call-2", "my_tool", "{}"))
        .mockResolvedValueOnce(makeTextResponse("最终回复"));

      const chatPromise = (service as any).handleConversationChat(
        {
          conversationId: "conv-script",
          message: "使用工具",
          tools: [{ name: "my_tool", description: "d", parameters: { type: "object", properties: {} } }],
        },
        sender
      );

      // 推进到脚本工具调用的超时阈值（5 分钟），期间脚本从未回复 toolResults
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      await chatPromise;

      const doneEvents = sentMessages.filter((m) => m.data?.type === "done");
      expect(doneEvents).toHaveLength(1);

      // 超时批次必须向客户端发送带 requestId 的作废通知：客户端可能仍在串行执行
      // 该批次剩余 handler，不通知会让其副作用与下一批次交叠
      const executeMessage = sentMessages.find((m) => m.action === "executeTools");
      const cancelMessage = sentMessages.find((m) => m.action === "cancelToolBatch");
      expect(cancelMessage).toBeDefined();
      expect(cancelMessage.requestId).toBe(executeMessage.requestId);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("同一 conversationId 的 chat/compact/clear 必须串行执行", () => {
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

  it("clearMessages 与另一个并发的 clearMessages 请求不应交叉执行（按 conversationId 排队）", async () => {
    const { service, mockRepo } = createTestService();

    const order: string[] = [];
    mockRepo.saveMessages.mockImplementation(async (_id: string, _msgs: any[]) => {
      order.push("start");
      // 人为延迟第一次调用，暴露"若未排队，第二次调用会在第一次完成前插入"的竞态
      await new Promise((r) => setTimeout(r, 20));
      order.push("end");
    });

    const call1 = (service as any).handleConversation({ action: "clearMessages", conversationId: "conv-race" });
    const call2 = (service as any).handleConversation({ action: "clearMessages", conversationId: "conv-race" });

    await Promise.all([call1, call2]);

    // 排队生效：必须是 start,end,start,end，而不是 start,start,end,end（交叉执行）
    expect(order).toEqual(["start", "end", "start", "end"]);
  });

  it("不同 conversationId 之间不应互相阻塞排队", async () => {
    const { service, mockRepo } = createTestService();

    const order: string[] = [];
    mockRepo.saveMessages.mockImplementation(async (id: string) => {
      order.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`end:${id}`);
    });

    const call1 = (service as any).handleConversation({ action: "clearMessages", conversationId: "conv-a" });
    const call2 = (service as any).handleConversation({ action: "clearMessages", conversationId: "conv-b" });

    await Promise.all([call1, call2]);

    // 不同会话应并发执行，两个 start 都先于任意一个 end 出现
    expect(order.indexOf("start:conv-a")).toBeLessThan(order.indexOf("end:conv-a"));
    expect(order.indexOf("start:conv-b")).toBeLessThan(order.indexOf("end:conv-b"));
    expect(order.slice(0, 2).sort()).toEqual(["start:conv-a", "start:conv-b"]);
  });

  it("正在进行的 chat 与随后到达的 clearMessages 不应交叉：clear 必须等 chat 落库完成", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const { service, mockRepo } = createTestService();
      mockRepo.listConversations.mockResolvedValue([
        { id: "conv-lock", title: "Chat", modelId: "test-openai", createtime: Date.now(), updatetime: Date.now() },
      ]);
      mockRepo.getMessages.mockResolvedValue([]);

      const order: string[] = [];
      mockRepo.appendMessage.mockImplementation(async () => {
        order.push("chat-write");
      });
      mockRepo.saveMessages.mockImplementation(async () => {
        order.push("clear-write");
      });

      fetchSpy.mockImplementation(async () => {
        // 模拟一次有延迟的 LLM 响应，给 clearMessages 制造"抢在 chat 落库前执行"的窗口
        await new Promise((r) => setTimeout(r, 20));
        return makeTextResponse("ok");
      });

      const { sender } = createMockSender();
      const chatPromise = (service as any).handleConversationChat(
        { conversationId: "conv-lock", message: "hi" },
        sender
      );
      const clearPromise = (service as any).handleConversation({
        action: "clearMessages",
        conversationId: "conv-lock",
      });

      await Promise.all([chatPromise, clearPromise]);

      // chat 的落库（appendMessage）必须先于随后到达的 clear 的落库（saveMessages）完成，
      // 而不是被 clear 抢先覆盖掉正在写入的历史
      expect(order.indexOf("chat-write")).toBeLessThan(order.indexOf("clear-write"));
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("会话队列的连接感知与重入策略", () => {
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
      getSender: () => ({ url: chrome.runtime.getURL("src/options.html#/agent/chat") }),
    };
    return {
      sender,
      sentMessages,
      simulateMessage: (msg: any) => messageHandler?.(msg),
      simulateDisconnect: () => disconnectHandler?.(),
    };
  }

  function conv(id: string) {
    return { id, title: "Chat", modelId: "test-openai", createtime: Date.now(), updatetime: Date.now() };
  }

  it("排队等待期间收到 stop 的请求：入锁后直接以取消收尾，不再调用 LLM", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-q")]);
    mockRepo.getMessages.mockResolvedValue([]);

    // chat1 占住会话队列（fetch 挂起直到手动放行）
    let release!: (response: Response) => void;
    fetchSpy.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)));

    const s1 = createMockSender();
    const p1 = (service as any).handleConversationChat({ conversationId: "conv-q", message: "第一条" }, s1.sender);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // chat2 入队等待；等待期间用户点了 Stop——回调必须在入队前就已注册，否则这次 stop 会被丢掉
    const s2 = createMockSender();
    const p2 = (service as any).handleConversationChat({ conversationId: "conv-q", message: "第二条" }, s2.sender);
    s2.simulateMessage({ action: "stop" });

    release(makeTextResponse("第一条回复"));
    await Promise.all([p1, p2]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const events2 = s2.sentMessages.filter((m: any) => m.action === "event").map((m: any) => m.data);
    expect(events2.find((e: any) => e.type === "error")?.errorCode).toBe("cancelled");
  });

  it("删除会话应取消已入队但尚未开始的请求", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-delete-queued")]);
    mockRepo.getMessages.mockResolvedValue([]);

    let rejectFirst!: (error: Error) => void;
    fetchSpy.mockImplementationOnce(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          rejectFirst = reject;
          (init?.signal as AbortSignal).addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );

    const first = (service as any).handleConversationChat(
      { conversationId: "conv-delete-queued", message: "第一条" },
      createMockSender().sender
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const second = (service as any).handleConversationChat(
      { conversationId: "conv-delete-queued", message: "第二条" },
      createMockSender().sender
    );

    const deletion = (service as any).handleConversation({
      action: "delete",
      conversationId: "conv-delete-queued",
      generation: "legacy:conv-delete-queued",
    });
    await Promise.all([first, second, deletion]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockRepo.deleteConversation).toHaveBeenCalledWith("conv-delete-queued", {
      generation: "legacy:conv-delete-queued",
    });
    void rejectFirst;
  });

  it("排队前快速拒绝应清理尚未被消息采用的上传附件", async () => {
    const { service, mockRepo } = createTestService();
    (service as any).chatService.conversationsAwaitingScriptTools.add("conv-busy-upload");

    await (service as any).handleConversationChat(
      {
        conversationId: "conv-busy-upload",
        message: [{ type: "image", attachmentId: "busy-upload.png", mimeType: "image/png" }],
        ownedAttachmentIds: ["busy-upload.png"],
      },
      createMockSender().sender
    );

    expect(mockRepo.deleteAttachment).toHaveBeenCalledWith("busy-upload.png");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("非 Options 调用方不得借 ownedAttachmentIds 删除借用附件", async () => {
    const { service, mockRepo } = createTestService();
    (service as any).chatService.conversationsAwaitingScriptTools.add("conv-untrusted-upload");
    const connection = createMockSender();
    (connection.sender as any).getSender = () => ({ url: chrome.runtime.getURL("src/content.html") });

    await (service as any).handleConversationChat(
      {
        conversationId: "conv-untrusted-upload",
        message: [{ type: "image", attachmentId: "victim.png", mimeType: "image/png" }],
        ownedAttachmentIds: ["victim.png"],
      },
      connection.sender
    );

    expect(mockRepo.deleteAttachment).not.toHaveBeenCalledWith("victim.png");
  });

  it("排队等待期间客户端已断开的前台请求：不启动、不调用 LLM、不发送事件", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-q2")]);
    mockRepo.getMessages.mockResolvedValue([]);

    let release!: (response: Response) => void;
    fetchSpy.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)));

    const s1 = createMockSender();
    const p1 = (service as any).handleConversationChat({ conversationId: "conv-q2", message: "第一条" }, s1.sender);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const s2 = createMockSender();
    const p2 = (service as any).handleConversationChat({ conversationId: "conv-q2", message: "第二条" }, s2.sender);
    s2.simulateDisconnect();

    release(makeTextResponse("第一条回复"));
    await Promise.all([p1, p2]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(s2.sentMessages.filter((m: any) => m.action === "event")).toHaveLength(0);
  });

  it("端口在入队前已死（注册回调即抛错）：请求安全返回，不留下卡死的后台会话记录", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-dead")]);
    mockRepo.getMessages.mockResolvedValue([]);
    const mockConn = {
      sendMessage: vi.fn(),
      onMessage: vi.fn(() => {
        throw new Error("onMessage Invalid Port");
      }),
      onDisconnect: vi.fn(() => {
        throw new Error("onDisconnect Invalid Port");
      }),
    };
    const sender = { isType: () => true, getConnect: () => mockConn };

    await expect(
      (service as any).handleConversationChat({ conversationId: "conv-dead", message: "hi", background: true }, sender)
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    // 不能把后台会话记录留在 running/cancelling 占位状态
    expect((service as any).bgSessionManager.has("conv-dead")).toBe(false);
  });

  it("会话等待脚本工具结果期间 clearMessages 应显式拒绝（重入死锁窗口），工具完成后恢复可用", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-reent")]);
    mockRepo.getMessages.mockResolvedValue([]);

    const encoder = new TextEncoder();
    const toolCallChunks = [
      `data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","function":{"name":"my_tool","arguments":""}}]}}]}\n\n`,
      `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}"}}]}, "finish_reason":"tool_calls"}]}\n\n`,
      `data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`,
    ];
    let i = 0;
    const toolCallResponse = {
      ok: true,
      status: 200,
      body: {
        getReader() {
          return {
            async read() {
              if (i < toolCallChunks.length) return { done: false, value: encoder.encode(toolCallChunks[i++]) };
              return { done: true, value: undefined };
            },
            cancel: async () => {},
          };
        },
      },
    } as unknown as Response;

    fetchSpy.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(makeTextResponse("最终回复"));

    const s = createMockSender();
    const chatPromise = (service as any).handleConversationChat(
      {
        conversationId: "conv-reent",
        message: "使用工具",
        tools: [{ name: "my_tool", description: "d", parameters: { type: "object", properties: {} } }],
      },
      s.sender
    );

    await vi.waitFor(() => {
      expect(s.sentMessages.some((message: any) => message.action === "executeTools")).toBe(true);
    });

    // 死锁窗口：chat 持有会话队列锁等待 toolResults；此刻的 clear 若排队会形成相互等待
    await expect(
      (service as any).handleConversation({ action: "clearMessages", conversationId: "conv-reent" })
    ).rejects.toThrow();

    const executeMessage = s.sentMessages.find((message: any) => message.action === "executeTools");
    s.simulateMessage({
      action: "toolResults",
      requestId: executeMessage.requestId,
      data: [{ id: "call-1", result: "ok" }],
    });
    await chatPromise;

    // 工具等待结束后，clear 恢复正常排队语义
    await expect(
      (service as any).handleConversation({ action: "clearMessages", conversationId: "conv-reent" })
    ).resolves.toBe(true);
  });

  it("会话等待脚本工具结果期间，同会话的重入 chat 应立即拒绝而不是排队死锁", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-reent-chat")]);
    mockRepo.getMessages.mockResolvedValue([]);

    const encoder = new TextEncoder();
    let index = 0;
    const chunks = [
      `data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","function":{"name":"my_tool","arguments":""}}]}}]}\n\n`,
      `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n`,
      `data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`,
    ];
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () =>
              index < chunks.length
                ? { done: false, value: encoder.encode(chunks[index++]) }
                : { done: true, value: undefined },
            cancel: async () => {},
          }),
        },
      } as unknown as Response)
      .mockResolvedValueOnce(makeTextResponse("最终回复"))
      .mockResolvedValueOnce(makeTextResponse("不应执行的重入回复"));

    const outer = createMockSender();
    const outerPromise = (service as any).handleConversationChat(
      {
        conversationId: "conv-reent-chat",
        message: "使用工具",
        tools: [{ name: "my_tool", description: "d", parameters: { type: "object", properties: {} } }],
      },
      outer.sender
    );
    await vi.waitFor(() =>
      expect(outer.sentMessages.some((message: any) => message.action === "executeTools")).toBe(true)
    );

    const nested = createMockSender();
    const nestedPromise = (service as any).handleConversationChat(
      { conversationId: "conv-reent-chat", message: "nested" },
      nested.sender
    );
    const nestedOutcome = await Promise.race([
      nestedPromise.then(() => "returned"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 20)),
    ]);

    const executeMessage = outer.sentMessages.find((message: any) => message.action === "executeTools");
    outer.simulateMessage({
      action: "toolResults",
      requestId: executeMessage.requestId,
      data: [{ id: "call-1", result: "ok" }],
    });
    await Promise.all([outerPromise, nestedPromise]);

    expect(nestedOutcome).toBe("returned");
    expect(nested.sentMessages).toContainEqual({
      action: "event",
      data: expect.objectContaining({ type: "error" }),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("手动 compact 在 LLM 调用期间 Stop 时应恰好发送一次 cancelled 终态", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-compact-stop")]);
    mockRepo.getMessages.mockResolvedValue([
      { id: "m1", conversationId: "conv-compact-stop", role: "user", content: "history", createtime: 1 },
    ]);
    fetchSpy.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );

    const connection = createMockSender();
    const compactPromise = (service as any).handleConversationChat(
      { conversationId: "conv-compact-stop", message: "", compact: true },
      connection.sender
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    connection.simulateMessage({ action: "stop" });
    await compactPromise;

    const terminals = connection.sentMessages
      .filter((message: any) => message.action === "event")
      .map((message: any) => message.data)
      .filter((event: any) => event.type === "done" || event.type === "error");
    expect(terminals).toEqual([expect.objectContaining({ type: "error", errorCode: "cancelled" })]);
  });

  it("手动 compact 忽略模型生成 block 时应清理对应附件", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-compact-block")]);
    mockRepo.getMessages.mockResolvedValue([
      { id: "m1", conversationId: "conv-compact-block", role: "user", content: "history", createtime: 1 },
    ]);
    const chatService = (service as any).chatService;
    chatService.llmDeps.callLLM = vi.fn().mockResolvedValue({
      content: "<summary>摘要</summary>",
      contentBlocks: [{ type: "image", attachmentId: "manual-orphan.png", mimeType: "image/png" }],
    });

    await (service as any).handleConversationChat(
      { conversationId: "conv-compact-block", message: "", compact: true },
      createMockSender().sender
    );

    expect(mockRepo.deleteAttachment).toHaveBeenCalledWith("manual-orphan.png");
  });

  it("子代理终态不应吞掉父对话自己的终态", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-sub-terminal")]);
    mockRepo.getMessages.mockResolvedValue([]);
    const chatService = (service as any).chatService;
    chatService.llmDeps.callLLMWithToolLoop = vi.fn(async ({ sendEvent }: any) => {
      sendEvent({
        type: "done",
        subAgent: { agentId: "child-1", description: "子任务" },
      });
      sendEvent({ type: "done", usage: { inputTokens: 3, outputTokens: 2 } });
    });

    const connection = createMockSender();
    await (service as any).handleConversationChat(
      { conversationId: "conv-sub-terminal", message: "run" },
      connection.sender
    );

    const terminals = connection.sentMessages
      .filter((message: any) => message.action === "event")
      .map((message: any) => message.data)
      .filter((event: any) => event.type === "done" || event.type === "error");
    expect(terminals).toEqual([
      expect.objectContaining({ type: "done", subAgent: expect.objectContaining({ agentId: "child-1" }) }),
      expect.objectContaining({ type: "done", usage: { inputTokens: 3, outputTokens: 2 } }),
    ]);
  });

  it("删除活动会话应先取消执行并等待落定，再删除对应 generation", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.listConversations.mockResolvedValue([conv("conv-delete-active")]);
    mockRepo.getMessages.mockResolvedValue([]);
    fetchSpy.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const connection = createMockSender();
    const chat = (service as any).handleConversationChat(
      { conversationId: "conv-delete-active", message: "run" },
      connection.sender
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());

    const deletion = (service as any).handleConversation({
      action: "delete",
      conversationId: "conv-delete-active",
      generation: "legacy:conv-delete-active",
    });
    await Promise.all([chat, deletion]);

    expect(mockRepo.deleteConversation).toHaveBeenCalledWith("conv-delete-active", {
      generation: "legacy:conv-delete-active",
    });
  });
});
