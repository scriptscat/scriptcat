import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentService } from "./agent";
import { createTestService, makeSkillRecord, makeSkillScriptRecord } from "./test-helpers";

// ---- handleConversationChat skill 动态工具清理测试 ----

describe("handleConversationChat skill 动态工具清理", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // 辅助：创建 mock sender
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

  it("对话结束后应清理 meta-tools", async () => {
    const { service, mockRepo, mockSkillRepo } = createTestService();
    const { sender } = createMockSender();

    // 设置 skill 带工具
    const scriptRecord = makeSkillScriptRecord({
      name: "my-tool",
      description: "A tool",
      params: [],
    });
    const skill = makeSkillRecord({
      name: "test-skill",
      toolNames: ["my-tool"],
      referenceNames: [],
      prompt: "Test prompt.",
    });
    (service as any).skillService.skillCache.set("test-skill", skill);

    // mock conversation 存在且带 skills
    mockRepo.listConversations.mockResolvedValue([
      {
        id: "conv-1",
        title: "Test",
        modelId: "test-openai",
        skills: "auto",
        createtime: Date.now(),
        updatetime: Date.now(),
      },
    ]);

    // load_skill 调用时返回脚本记录
    mockSkillRepo.getSkillScripts.mockResolvedValueOnce([scriptRecord]);

    // 构造 SSE：LLM 调用 load_skill，然后纯文本结束
    const encoder = new TextEncoder();
    // 第一次 fetch：返回 load_skill tool call
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          const chunks = [
            `data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"load_skill","arguments":""}}]}}]}\n\n`,
            `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"skill_name\\":\\"test-skill\\"}"}}]}}]}\n\n`,
            `data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`,
          ];
          let i = 0;
          return {
            read: async () => {
              if (i >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: encoder.encode(chunks[i++]) };
            },
            releaseLock: () => {},
            cancel: async () => {},
            closed: Promise.resolve(undefined),
          };
        },
      },
      text: async () => "",
    } as unknown as Response);

    // 第二次 fetch：纯文本结束
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          const chunks = [
            `data: {"choices":[{"delta":{"content":"完成"}}]}\n\n`,
            `data: {"usage":{"prompt_tokens":20,"completion_tokens":8}}\n\n`,
          ];
          let i = 0;
          return {
            read: async () => {
              if (i >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: encoder.encode(chunks[i++]) };
            },
            releaseLock: () => {},
            cancel: async () => {},
            closed: Promise.resolve(undefined),
          };
        },
      },
      text: async () => "",
    } as unknown as Response);

    const registry = (service as any).toolRegistry;

    // 对话前 registry 不应有 load_skill 和 execute_skill_script
    expect(registry.getDefinitions().find((d: any) => d.name === "load_skill")).toBeUndefined();
    expect(registry.getDefinitions().find((d: any) => d.name === "execute_skill_script")).toBeUndefined();

    await (service as any).handleConversationChat({ conversationId: "conv-1", message: "test" }, sender);

    // 对话后 meta-tools 应已清理
    expect(registry.getDefinitions().find((d: any) => d.name === "load_skill")).toBeUndefined();
    expect(registry.getDefinitions().find((d: any) => d.name === "execute_skill_script")).toBeUndefined();
  });
});

// ---- init() 消息注册测试 ----

describe("AgentService init() 消息注册", () => {
  it("应注册 installSkill 和 removeSkill 消息处理", () => {
    const mockGroup = { on: vi.fn() } as any;
    const mockSender = {} as any;

    const service = new AgentService(mockGroup, mockSender);

    // 替换 repos 避免 OPFS 调用
    (service as any).skillService.skillRepo = { listSkills: vi.fn().mockResolvedValue([]) };

    service.init();

    // 收集所有 group.on 注册的消息名
    const registeredNames = mockGroup.on.mock.calls.map((call: any[]) => call[0]);

    expect(registeredNames).toContain("installSkill");
    expect(registeredNames).toContain("removeSkill");
  });

  it("installSkill 消息处理应正确转发参数", async () => {
    const mockGroup = { on: vi.fn() } as any;
    const mockSender = {} as any;

    const service = new AgentService(mockGroup, mockSender);

    const mockSkillRepo = {
      listSkills: vi.fn().mockResolvedValue([]),
      getSkill: vi.fn().mockResolvedValue(null),
      saveSkill: vi.fn().mockResolvedValue(undefined),
    };
    (service as any).skillService.skillRepo = mockSkillRepo;

    service.init();

    // 找到 installSkill 处理函数
    const installSkillCall = mockGroup.on.mock.calls.find((call: any[]) => call[0] === "installSkill");
    expect(installSkillCall).toBeDefined();

    const handler = installSkillCall[1];
    const skillMd = `---
name: msg-test
description: Test via message
---
Prompt content.`;

    const result = await handler({ skillMd });

    expect(result.name).toBe("msg-test");
    expect(mockSkillRepo.saveSkill).toHaveBeenCalledTimes(1);
  });

  it("removeSkill 消息处理应正确转发参数", async () => {
    const mockGroup = { on: vi.fn() } as any;
    const mockSender = {} as any;

    const service = new AgentService(mockGroup, mockSender);

    const mockSkillRepo = {
      listSkills: vi.fn().mockResolvedValue([]),
      removeSkill: vi.fn().mockResolvedValue(true),
    };
    (service as any).skillService.skillRepo = mockSkillRepo;

    service.init();

    // 找到 removeSkill 处理函数
    const removeSkillCall = mockGroup.on.mock.calls.find((call: any[]) => call[0] === "removeSkill");
    expect(removeSkillCall).toBeDefined();

    const handler = removeSkillCall[1];
    const result = await handler("msg-test-skill");

    expect(result).toBe(true);
    expect(mockSkillRepo.removeSkill).toHaveBeenCalledWith("msg-test-skill");
  });
});
