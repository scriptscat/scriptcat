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

  it("max_iterations 错误事件也累计 usage", async () => {
    const subOrchestrator = makeMockOrchestrator();
    (subOrchestrator.callLLMWithToolLoop as ReturnType<typeof vi.fn>).mockImplementationOnce(async ({ sendEvent }) => {
      sendEvent({
        type: "error",
        message: "达到上限",
        errorCode: "max_iterations",
        usage: { inputTokens: 12, outputTokens: 4 },
      });
    });
    service = new SubAgentService(subOrchestrator);

    const result = await service.runSubAgent({
      options: { prompt: "做个任务", description: "测试任务" },
      agentId: "test-agent-2",
      model: MODEL,
      parentConversationId: "conv-1",
      toolRegistry,
      sendEvent,
      signal,
    });

    expect(result.details?.usage).toEqual(expect.objectContaining({ inputTokens: 12, outputTokens: 4 }));
  });

  it("终态异常保留子代理的部分消息与 usage", async () => {
    const subOrchestrator = makeMockOrchestrator();
    (subOrchestrator.callLLMWithToolLoop as ReturnType<typeof vi.fn>).mockImplementationOnce(async ({ sendEvent }) => {
      sendEvent({ type: "content_delta", delta: "部分结果" });
      throw Object.assign(new Error("达到上限"), {
        errorCode: "max_iterations",
        usage: { inputTokens: 20, outputTokens: 6 },
      });
    });
    service = new SubAgentService(subOrchestrator);

    await expect(
      service.runSubAgent({
        options: { prompt: "做个任务", description: "失败任务" },
        agentId: "test-agent-failed",
        model: MODEL,
        parentConversationId: "conv-1",
        toolRegistry,
        sendEvent,
        signal,
      })
    ).rejects.toMatchObject({
      subAgentDetails: {
        messages: [{ content: "部分结果" }],
        usage: { inputTokens: 20, outputTokens: 6 },
      },
    });
  });

  it("编排器抛出的原始异常未经 sendEvent 上报终态时，应补发一次子代理 error 事件，避免 UI 卡在 running", async () => {
    const subOrchestrator = makeMockOrchestrator();
    (subOrchestrator.callLLMWithToolLoop as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      // 模拟 callLLM/autoCompact 的原始失败：orchestrator 直接 throw，从未调用 sendEvent
      throw Object.assign(new Error("网络错误"), { usage: { inputTokens: 5, outputTokens: 1 } });
    });
    service = new SubAgentService(subOrchestrator);

    await expect(
      service.runSubAgent({
        options: { prompt: "做个任务", description: "失败任务" },
        agentId: "test-agent-raw-fail",
        model: MODEL,
        parentConversationId: "conv-1",
        toolRegistry,
        sendEvent,
        signal,
      })
    ).rejects.toThrow("网络错误");

    // 必须补发一次终态事件，否则实时 UI 收不到 done/error，会一直显示 running
    const errorEvents = (sendEvent as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].message).toBe("网络错误");
  });

  it("已通过 sendEvent 上报终态（如 max_iterations）的异常不应重复补发 error 事件", async () => {
    const subOrchestrator = makeMockOrchestrator();
    (subOrchestrator.callLLMWithToolLoop as ReturnType<typeof vi.fn>).mockImplementationOnce(async ({ sendEvent }) => {
      sendEvent({ type: "error", message: "达到上限", errorCode: "max_iterations" });
      throw Object.assign(new Error("达到上限"), { errorCode: "max_iterations" });
    });
    service = new SubAgentService(subOrchestrator);

    await expect(
      service.runSubAgent({
        options: { prompt: "做个任务", description: "失败任务" },
        agentId: "test-agent-reported-fail",
        model: MODEL,
        parentConversationId: "conv-1",
        toolRegistry,
        sendEvent,
        signal,
      })
    ).rejects.toThrow("达到上限");

    const errorEvents = (sendEvent as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
  });

  it("tool_call_complete 应使用事件自身的 status，失败的嵌套工具重载后仍应显示为 error", async () => {
    const subOrchestrator = makeMockOrchestrator();
    (subOrchestrator.callLLMWithToolLoop as ReturnType<typeof vi.fn>).mockImplementationOnce(async ({ sendEvent }) => {
      sendEvent({ type: "tool_call_start", toolCall: { id: "t1", name: "web_fetch", arguments: "" } });
      sendEvent({ type: "tool_call_complete", id: "t1", result: "失败原因", status: "error" });
      sendEvent({ type: "done" });
    });
    service = new SubAgentService(subOrchestrator);

    const result = await service.runSubAgent({
      options: { prompt: "做个任务", description: "测试任务" },
      agentId: "test-agent-tool-error",
      model: MODEL,
      parentConversationId: "conv-1",
      toolRegistry,
      sendEvent,
      signal,
    });

    const toolCall = result.details?.messages[0]?.toolCalls[0];
    expect(toolCall?.status).toBe("error");
  });
});
