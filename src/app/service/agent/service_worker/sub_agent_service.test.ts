import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubAgentService } from "./sub_agent_service";
import type { SubAgentOrchestrator } from "./sub_agent_service";
import type { AgentModelConfig, ChatStreamEvent } from "@App/app/service/agent/core/types";
import type { ToolExecutorLike } from "@App/app/service/agent/core/tool_registry";

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

describe("SubAgentService", () => {
  let orchestrator: SubAgentOrchestrator;
  let service: SubAgentService;
  let toolRegistry: ToolExecutorLike;
  let sendEvent: (event: ChatStreamEvent) => void;
  let signal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = makeMockOrchestrator();
    service = new SubAgentService(orchestrator);
    toolRegistry = makeMockToolRegistry();
    sendEvent = vi.fn<(event: ChatStreamEvent) => void>();
    signal = new AbortController().signal;
  });

  it("新建子代理并返回结果", async () => {
    const result = await service.runSubAgent({
      options: { prompt: "做个任务", description: "测试任务" },
      agentId: "test-agent-1",
      model: MODEL,
      parentConversationId: "conv-1",
      toolRegistry,
      sendEvent,
      signal,
    });

    expect(result.agentId).toBe("test-agent-1");
    expect(result.result).toBe("result");
    expect(orchestrator.callLLMWithToolLoop).toHaveBeenCalledOnce();
  });

  it("cleanup 不抛异常", () => {
    expect(() => service.cleanup("conv-1")).not.toThrow();
  });
});
