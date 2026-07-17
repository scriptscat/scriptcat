import { vi } from "vitest";
import { AgentService } from "./agent";
import type { SkillRecord, SkillScriptRecord } from "@App/app/service/agent/core/types";

// mock agent_chat repo 单例：让所有 import { agentChatRepo } 的子服务拿到同一个 mock 对象
// 该对象在 createTestService() 中被重置，测试通过 mockRepo 断言
// vi.mock 和 vi.hoisted 都会被 vitest 提升到文件顶部，确保子服务 import 前 mock 已就绪
const { mockChatRepo } = vi.hoisted(() => ({
  mockChatRepo: {} as any,
}));

vi.mock("@App/app/repo/agent_chat", () => ({
  AgentChatRepo: class {},
  agentChatRepo: mockChatRepo,
}));

// mock offscreen/client — isolate: false 下会影响其他测试文件，
// extract 函数需要委托到 sender.sendMessage 以保持与其他测试的兼容性
vi.mock("@App/app/service/offscreen/client", () => {
  // 通用的 sendMessage 委托实现
  const delegateToSender = (action: string, defaultValue: any) =>
    vi.fn().mockImplementation(async (sender: any, data: any) => {
      const res = await sender.sendMessage({ action, data });
      return res?.data ?? defaultValue;
    });
  return {
    createObjectURL: vi.fn().mockResolvedValue("blob:chrome-extension://test/mock-blob-url"),
    executeSkillScript: vi.fn(),
    extractHtmlContent: delegateToSender("offscreen/htmlExtractor/extractHtmlContent", null),
    extractHtmlWithSelectors: delegateToSender("offscreen/htmlExtractor/extractHtmlWithSelectors", null),
    extractBingResults: delegateToSender("offscreen/htmlExtractor/extractBingResults", []),
    extractBaiduResults: delegateToSender("offscreen/htmlExtractor/extractBaiduResults", []),
    extractSearchResults: delegateToSender("offscreen/htmlExtractor/extractSearchResults", []),
  };
});

// 创建 mock AgentService 实例
export function createTestService() {
  const mockGroup = { on: vi.fn() } as any;
  const mockSender = {} as any;

  // 重置 agent_chat 单例 mock 方法（保持对象身份不变，只替换 vi.fn）
  Object.assign(mockChatRepo, {
    appendMessage: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
    listConversations: vi.fn().mockResolvedValue([]),
    saveConversation: vi.fn().mockResolvedValue(undefined),
    saveMessages: vi.fn().mockResolvedValue(undefined),
    getTasks: vi.fn().mockResolvedValue([]),
    saveTasks: vi.fn().mockResolvedValue(undefined),
    getAttachment: vi.fn().mockResolvedValue(null),
    saveAttachment: vi.fn().mockResolvedValue(0),
  });

  const service = new AgentService(mockGroup, mockSender);

  // 替换 modelRepo（避免 chrome.storage 调用）
  const mockModelRepo = {
    listModels: vi
      .fn()
      .mockResolvedValue([
        { id: "test-openai", name: "Test", provider: "openai", apiBaseUrl: "", apiKey: "", model: "gpt-4o" },
      ]),
    getModel: vi.fn().mockImplementation((id: string) => {
      if (id === "test-openai") {
        return Promise.resolve({
          id: "test-openai",
          name: "Test",
          provider: "openai",
          apiBaseUrl: "",
          apiKey: "",
          model: "gpt-4o",
        });
      }
      return Promise.resolve(undefined);
    }),
    getDefaultModelId: vi.fn().mockResolvedValue("test-openai"),
    saveModel: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
    setDefaultModelId: vi.fn().mockResolvedValue(undefined),
  };
  (service as any).modelService.modelRepo = mockModelRepo;

  // 替换 skillRepo（避免 OPFS 调用）
  const mockSkillRepo = {
    listSkills: vi.fn().mockResolvedValue([]),
    getSkill: vi.fn().mockResolvedValue(null),
    saveSkill: vi.fn().mockResolvedValue(undefined),
    removeSkill: vi.fn().mockResolvedValue(true),
    getSkillScripts: vi.fn().mockResolvedValue([]),
    getSkillReferences: vi.fn().mockResolvedValue([]),
    getReference: vi.fn().mockResolvedValue(null),
    getConfigValues: vi.fn().mockResolvedValue(undefined),
  };
  (service as any).skillService.skillRepo = mockSkillRepo;

  return { service, mockRepo: mockChatRepo, mockSkillRepo, mockModelRepo };
}

export const VALID_SKILLSCRIPT_CODE = `// ==SkillScript==
// @name test-tool
// @description A test tool
// @param {string} input - The input
// ==/SkillScript==
module.exports = async function(params) { return params.input; }`;

// 辅助：创建 SkillRecord
export function makeSkillRecord(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: "test-skill",
    description: "A test skill",
    toolNames: [],
    referenceNames: [],
    prompt: "You are a test skill assistant.",
    installtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

// 辅助：创建 SkillScriptRecord
export function makeSkillScriptRecord(overrides: Partial<SkillScriptRecord> = {}): SkillScriptRecord {
  return {
    id: "tool-id-1",
    name: "test-script",
    description: "A test skill script",
    params: [{ name: "input", type: "string", description: "The input", required: true }],
    grants: [],
    code: "module.exports = async (p) => p.input;",
    installtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

// 辅助：创建 mock sender（简单版，只收集消息）
export function createMockSender() {
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

// 辅助：创建 mock sender（带 message/disconnect 模拟回调）
export function createMockSenderWithCallbacks() {
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

// 辅助：创建最简 OpenAI SSE 文本响应
export function makeTextResponse(text: string): Response {
  const encoder = new TextEncoder();
  const chunks = [
    `data: {"choices":[{"delta":{"content":"${text}"}}]}\n\n`,
    `data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`,
  ];
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

// 辅助：创建 OpenAI SSE 响应（自定义 chunks）
export function makeSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
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

// 辅助：创建 RunningConversation 快照对象
export function createRunningConversation(overrides: Record<string, any> = {}) {
  return {
    conversationId: "conv-bg",
    abortController: new AbortController(),
    listeners: new Set<any>(),
    streamingState: { content: "", thinking: "", toolCalls: [] as any[] },
    pendingAskUser: undefined as any,
    askResolvers: new Map<string, (answer: string) => void>(),
    tasks: [] as any[],
    status: "running" as string,
    ...overrides,
  };
}
