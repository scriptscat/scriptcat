import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolLoopOrchestrator, type ToolLoopDeps } from "./tool_loop_orchestrator";
import type { ToolExecutorLike, ToolExecuteResult } from "@App/app/service/agent/core/tool_registry";
import type { ToolCall, AgentModelConfig, ChatRequest, ChatStreamEvent } from "@App/app/service/agent/core/types";
import type { LLMCallResult } from "./llm_client";

const MODEL: AgentModelConfig = {
  id: "m1",
  name: "Test",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4o",
};

function makeFakeChatRepo() {
  return {
    appendMessage: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
    saveMessages: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeFakeToolRegistry(): ToolExecutorLike {
  return {
    getDefinitions: () => [{ name: "dup", description: "dup", parameters: { type: "object", properties: {} } }],
    execute: async (toolCalls: ToolCall[]): Promise<ToolExecuteResult[]> =>
      toolCalls.map((tc) => ({ id: tc.id, result: "ok" })),
  };
}

// 连续 4 轮调用同一工具 dup 且参数完全相同（触发两次重复调用告警：第 2、4 轮）
function dupToolCallResult(id: string): LLMCallResult {
  return { content: "", toolCalls: [{ id, name: "dup", arguments: "{}" }] } as LLMCallResult;
}

function finalTextResult(text: string): LLMCallResult {
  return { content: text } as LLMCallResult;
}

describe("ToolLoopOrchestrator 循环检测升级（loop-guard escalation）", () => {
  let chatRepo: ReturnType<typeof makeFakeChatRepo>;
  let toolRegistry: ToolExecutorLike;
  let callLLM: ReturnType<typeof vi.fn<ToolLoopDeps["callLLM"]>>;
  let autoCompact: ReturnType<typeof vi.fn<ToolLoopDeps["autoCompact"]>>;
  let deps: ToolLoopDeps;
  let orchestrator: ToolLoopOrchestrator;
  let sendEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    chatRepo = makeFakeChatRepo();
    toolRegistry = makeFakeToolRegistry();
    callLLM = vi.fn();
    autoCompact = vi.fn().mockResolvedValue(undefined);
    deps = { callLLM, autoCompact };
    orchestrator = new ToolLoopOrchestrator(deps, chatRepo);
    sendEvent = vi.fn();
  });

  function baseParams(overrides: Record<string, unknown> = {}) {
    return {
      toolRegistry,
      model: MODEL,
      messages: [{ role: "user", content: "开始" }] as ChatRequest["messages"],
      maxIterations: 10,
      sendEvent: sendEvent as (event: ChatStreamEvent) => void,
      signal: new AbortController().signal,
      scriptToolCallback: null,
      conversationId: "conv-1",
      ...overrides,
    };
  }

  it("未提供 askUserForGuard 时，重复调用告警照常触发但不暂停循环", async () => {
    callLLM
      .mockResolvedValueOnce(dupToolCallResult("c1"))
      .mockResolvedValueOnce(dupToolCallResult("c2"))
      .mockResolvedValueOnce(dupToolCallResult("c3"))
      .mockResolvedValueOnce(dupToolCallResult("c4"))
      .mockResolvedValueOnce(finalTextResult("done"));

    await orchestrator.callLLMWithToolLoop(baseParams());

    expect(callLLM).toHaveBeenCalledTimes(5);
    const warningEvents = sendEvent.mock.calls.filter((c) => c[0].type === "system_warning");
    expect(warningEvents).toHaveLength(2);
    const doneEvents = sendEvent.mock.calls.filter((c) => c[0].type === "done");
    expect(doneEvents).toHaveLength(1);
  });

  it("第 2 次触发告警时应暂停并询问用户；回答非 Stop 时应继续循环", async () => {
    callLLM
      .mockResolvedValueOnce(dupToolCallResult("c1"))
      .mockResolvedValueOnce(dupToolCallResult("c2"))
      .mockResolvedValueOnce(dupToolCallResult("c3"))
      .mockResolvedValueOnce(dupToolCallResult("c4"))
      .mockResolvedValueOnce(finalTextResult("done"));

    const askUserForGuard = vi.fn().mockResolvedValue("Continue");

    await orchestrator.callLLMWithToolLoop(baseParams({ askUserForGuard }));

    expect(askUserForGuard).toHaveBeenCalledTimes(1);
    const [question, options] = askUserForGuard.mock.calls[0];
    expect(question).toContain("2");
    expect(options).toContain("Stop");

    expect(callLLM).toHaveBeenCalledTimes(5);
    const doneEvents = sendEvent.mock.calls.filter((c) => c[0].type === "done");
    expect(doneEvents).toHaveLength(1);
  });

  it("回答 Stop 时应提前结束循环，以 done（而非 error）收尾", async () => {
    callLLM
      .mockResolvedValueOnce(dupToolCallResult("c1"))
      .mockResolvedValueOnce(dupToolCallResult("c2"))
      .mockResolvedValueOnce(dupToolCallResult("c3"))
      .mockResolvedValueOnce(dupToolCallResult("c4"))
      .mockResolvedValueOnce(finalTextResult("done")); // 若未提前结束，不应被调用到

    const askUserForGuard = vi.fn().mockResolvedValue("Stop");

    await orchestrator.callLLMWithToolLoop(baseParams({ askUserForGuard }));

    // 应在第 4 轮后立即停止，不再发起第 5 次 LLM 调用
    expect(callLLM).toHaveBeenCalledTimes(4);

    const errorEvents = sendEvent.mock.calls.filter((c) => c[0].type === "error");
    expect(errorEvents).toHaveLength(0);
    const doneEvents = sendEvent.mock.calls.filter((c) => c[0].type === "done");
    expect(doneEvents).toHaveLength(1);

    // 停止信息应被持久化
    const assistantCalls = chatRepo.appendMessage.mock.calls.map((c: any) => c[0]).filter((m: any) => m.error == null);
    const stopMessage = assistantCalls.find((m: any) => typeof m.content === "string" && m.content.includes("Stop"));
    expect(stopMessage).toBeDefined();
  });
});
