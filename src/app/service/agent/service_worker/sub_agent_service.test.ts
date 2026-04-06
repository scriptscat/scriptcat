import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubAgentService } from "./sub_agent_service";
import type { SubAgentOrchestrator } from "./sub_agent_service";
import type { AgentModelConfig, ChatStreamEvent } from "@App/app/service/agent/core/types";
import type { ToolExecutorLike } from "@App/app/service/agent/core/tool_registry";

// mock subAgentContextRepo 单例
const { mockContextRepo } = vi.hoisted(() => ({
  mockContextRepo: {
    getContext: vi.fn(),
    saveContext: vi.fn(),
    removeContexts: vi.fn(),
  },
}));

vi.mock("@App/app/repo/sub_agent_context", () => ({
  subAgentContextRepo: mockContextRepo,
  SubAgentContextRepo: class {},
}));

// 简单 mock toolRegistry，返回空工具列表
function makeMockToolRegistry(): ToolExecutorLike {
  return {
    getDefinitions: vi.fn().mockReturnValue([]),
    execute: vi.fn().mockResolvedValue([]),
  };
}

// 构建最简 AgentModelConfig
const MODEL: AgentModelConfig = {
  id: "test-model",
  name: "Test",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4o",
};

// 构建 mock orchestrator，通过 sendEvent 回调发送简单文本结果
function makeMockOrchestrator(): SubAgentOrchestrator {
  return {
    callLLMWithToolLoop: vi.fn().mockImplementation(async ({ sendEvent }) => {
      sendEvent({ type: "content_delta", delta: "result" } as ChatStreamEvent);
      sendEvent({ type: "done" } as ChatStreamEvent);
    }),
  };
}

describe("SubAgentService OPFS 持久化", () => {
  let orchestrator: SubAgentOrchestrator;
  let service: SubAgentService;
  let toolRegistry: ToolExecutorLike;
  let sendEvent: (event: ChatStreamEvent) => void;
  let signal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContextRepo.saveContext.mockResolvedValue(undefined);
    mockContextRepo.getContext.mockResolvedValue(undefined);
    mockContextRepo.removeContexts.mockResolvedValue(undefined);

    orchestrator = makeMockOrchestrator();
    service = new SubAgentService(orchestrator);
    toolRegistry = makeMockToolRegistry();
    sendEvent = vi.fn<(event: ChatStreamEvent) => void>();
    signal = new AbortController().signal;
  });

  it("a) 新建子代理后 saveContext 被调用", async () => {
    const result = await service.runSubAgent({
      options: { prompt: "做个任务", description: "测试任务" },
      model: MODEL,
      parentConversationId: "conv-1",
      toolRegistry,
      sendEvent,
      signal,
    });

    expect(result.agentId).toBeTruthy();
    expect(result.result).toBe("result");
    expect(mockContextRepo.saveContext).toHaveBeenCalledOnce();
    const [calledConvId, calledEntry] = mockContextRepo.saveContext.mock.calls[0];
    expect(calledConvId).toBe("conv-1");
    expect(calledEntry.agentId).toBe(result.agentId);
    expect(calledEntry.description).toBe("测试任务");
    expect(calledEntry.status).toBe("completed");
  });

  it("b) resume 时内存命中，不调用 OPFS getContext", async () => {
    // 先新建，使其进入内存缓存
    const created = await service.runSubAgent({
      options: { prompt: "初始任务", description: "初始" },
      model: MODEL,
      parentConversationId: "conv-2",
      toolRegistry,
      sendEvent,
      signal,
    });

    vi.clearAllMocks();
    mockContextRepo.saveContext.mockResolvedValue(undefined);

    // resume，内存中已有
    await service.runSubAgent({
      options: { prompt: "继续任务", description: "继续", to: created.agentId },
      model: MODEL,
      parentConversationId: "conv-2",
      toolRegistry,
      sendEvent,
      signal,
    });

    // 内存命中，不应调用 getContext
    expect(mockContextRepo.getContext).not.toHaveBeenCalled();
    // 但应持久化更新
    expect(mockContextRepo.saveContext).toHaveBeenCalledOnce();
  });

  it("c) resume 时内存未命中，从 OPFS 恢复，getContext 被调用且结果恢复到内存", async () => {
    const agentId = "agent-from-opfs";
    const persistedEntry = {
      agentId,
      typeName: "general",
      description: "OPFS 中的代理",
      messages: [
        { role: "system" as const, content: "system prompt" },
        { role: "user" as const, content: "原始任务" },
      ],
      status: "completed" as const,
      result: "原始结果",
    };
    mockContextRepo.getContext.mockResolvedValue(persistedEntry);

    // 直接 resume（内存中没有）
    const result = await service.runSubAgent({
      options: { prompt: "继续", description: "继续", to: agentId },
      model: MODEL,
      parentConversationId: "conv-3",
      toolRegistry,
      sendEvent,
      signal,
    });

    expect(mockContextRepo.getContext).toHaveBeenCalledWith("conv-3", agentId);
    expect(result.agentId).toBe(agentId);
    expect(result.result).toBe("result");

    // 恢复后应更新持久化
    expect(mockContextRepo.saveContext).toHaveBeenCalledOnce();

    // 再次 resume 同一 agent，内存已有，不再调 getContext
    vi.clearAllMocks();
    mockContextRepo.saveContext.mockResolvedValue(undefined);
    await service.runSubAgent({
      options: { prompt: "再继续", description: "再继续", to: agentId },
      model: MODEL,
      parentConversationId: "conv-3",
      toolRegistry,
      sendEvent,
      signal,
    });
    expect(mockContextRepo.getContext).not.toHaveBeenCalled();
  });

  it("d) resume 时内存和 OPFS 都未命中，返回 error 消息", async () => {
    mockContextRepo.getContext.mockResolvedValue(undefined);

    const result = await service.runSubAgent({
      options: { prompt: "继续", description: "继续", to: "nonexistent-agent" },
      model: MODEL,
      parentConversationId: "conv-4",
      toolRegistry,
      sendEvent,
      signal,
    });

    expect(result.agentId).toBe("nonexistent-agent");
    expect(result.result).toContain("Error");
    expect(result.result).toContain("nonexistent-agent");
    // 未执行 LLM，也未持久化
    expect(orchestrator.callLLMWithToolLoop).not.toHaveBeenCalled();
    expect(mockContextRepo.saveContext).not.toHaveBeenCalled();
  });

  it("e) cleanup 调用 removeContexts", () => {
    service.cleanup("conv-5");

    // removeContexts 异步调用，不 await，但应已触发
    expect(mockContextRepo.removeContexts).toHaveBeenCalledWith("conv-5");
  });
});
