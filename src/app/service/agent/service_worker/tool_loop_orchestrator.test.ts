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
      rehydratedHistory: true,
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

  it("auto compact 失败时抛出包含累计 usage 与 conversationId 的结构化错误", async () => {
    callLLM.mockResolvedValue({ content: "继续", usage: { inputTokens: 9000, outputTokens: 5 } });
    autoCompact.mockRejectedValue(new Error("compact failed"));

    await expect(
      orchestrator.callLLMWithToolLoop(
        baseParams({ model: { ...MODEL, contextWindow: 10000 }, messages: [{ role: "user", content: "开始" }] })
      )
    ).rejects.toMatchObject({
      message: "compact failed",
      conversationId: "conv-1",
      usage: { inputTokens: 9000, outputTokens: 5 },
    });
  });

  it("触发 autoCompact 时应保留原始模型，而不是把 contextWindow 预先缩小", async () => {
    callLLM.mockResolvedValue({ content: "done", usage: { inputTokens: 6000, outputTokens: 5 } });

    await orchestrator.callLLMWithToolLoop(
      baseParams({ model: { ...MODEL, contextWindow: 10_000, maxTokens: 2_000 } })
    );

    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM.mock.calls[0][0]).toMatchObject({ contextWindow: 10_000, maxTokens: 2_000 });
    expect(autoCompact).toHaveBeenCalledTimes(1);
    expect(autoCompact.mock.calls[0][1]).toMatchObject({ contextWindow: 10_000, maxTokens: 2_000 });
  });

  it("续接长历史时，首个 LLM 请求使用裁剪后的副本且不修改原始历史", async () => {
    const oldToolResult = "完整工具结果".repeat(100);
    const messages: ChatRequest["messages"] = [];
    for (let i = 0; i < 6; i++) {
      messages.push({
        role: "assistant",
        content: "",
        toolCalls: [{ id: `tc${i}`, name: "dup", arguments: "{}" }],
      });
      messages.push({ role: "tool", content: oldToolResult, toolCallId: `tc${i}` });
    }
    callLLM.mockImplementation(async (_model, request) => {
      expect(request.messages[1].content).toBe(
        "[tool result elided to save context — re-run the tool if you need this data again]"
      );
      expect(messages[1].content).toBe(oldToolResult);
      return finalTextResult("done");
    });

    await orchestrator.callLLMWithToolLoop(baseParams({ messages, model: { ...MODEL, contextWindow: 1000 } }));
  });

  it("续接短历史时，估算上下文未达到 40% 不应预先裁剪工具结果", async () => {
    const messages: ChatRequest["messages"] = [];
    for (let i = 0; i < 6; i++) {
      messages.push({
        role: "assistant",
        content: "",
        toolCalls: [{ id: `short${i}`, name: "dup", arguments: "{}" }],
      });
      messages.push({ role: "tool", content: "短结果", toolCallId: `short${i}` });
    }
    callLLM.mockImplementation(async (_model, request) => {
      expect(request.messages[1].content).toBe("短结果");
      return finalTextResult("done");
    });

    await orchestrator.callLLMWithToolLoop(baseParams({ messages }));
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
    expect(askUserForGuard.mock.calls[0][0]).toBe(2);

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
    const stopMessage = assistantCalls.find((m: any) => typeof m.content === "string");
    expect(stopMessage).toBeDefined();
  });

  it("回答 Continue 后应重置命中计数，之后需再次连续命中 2 次才会重新暂停询问", async () => {
    // 第 1~4 轮：触发前两次命中（第 2、4 轮），第 4 轮暂停询问，回答 Continue
    // 第 5~6 轮：命中第 3 次（重置后的第 1 次），不应再次暂停
    // 第 7~8 轮：命中第 4 次（重置后的第 2 次），应再次暂停询问
    // 第 9 轮：最终文本，结束循环
    for (let i = 1; i <= 8; i++) {
      callLLM.mockResolvedValueOnce(dupToolCallResult(`c${i}`));
    }
    callLLM.mockResolvedValueOnce(finalTextResult("done"));

    const askUserForGuard = vi.fn().mockResolvedValue("Continue");

    await orchestrator.callLLMWithToolLoop(baseParams({ askUserForGuard }));

    // 仅在第 4 轮和第 8 轮各暂停一次，中间第 6 轮的命中（重置后第 1 次）不应触发暂停
    expect(askUserForGuard).toHaveBeenCalledTimes(2);
    expect(askUserForGuard.mock.calls[0][0]).toBe(2);
    expect(askUserForGuard.mock.calls[1][0]).toBe(2);

    expect(callLLM).toHaveBeenCalledTimes(9);
    const doneEvents = sendEvent.mock.calls.filter((c) => c[0].type === "done");
    expect(doneEvents).toHaveLength(1);
  });
});

describe("ToolLoopOrchestrator 请求前预算检查（防止 tool 结果把下一次请求撑爆）", () => {
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
      model: { ...MODEL, contextWindow: 1000 },
      messages: [{ role: "user", content: "开始" }] as ChatRequest["messages"],
      maxIterations: 10,
      sendEvent: sendEvent as (event: ChatStreamEvent) => void,
      signal: new AbortController().signal,
      scriptToolCallback: null,
      conversationId: "conv-1",
      ...overrides,
    };
  }

  it("上一轮 tool 结果把下一次请求撑爆时，应在发送前裁剪，而不是等 usage 反馈后再处理", async () => {
    // 第 1 轮：无 usage 反馈（模拟未携带 usage 的响应），但工具返回一段远超上下文窗口的巨大结果。
    // 若没有“发送前预算检查”，第 2 轮请求会直接带着这段巨大文本发出去。
    const hugeResult = "巨大的工具结果".repeat(2000);
    toolRegistry = {
      getDefinitions: () => [{ name: "dup", description: "dup", parameters: { type: "object", properties: {} } }],
      execute: async (toolCalls: ToolCall[]): Promise<ToolExecuteResult[]> =>
        toolCalls.map((tc) => ({ id: tc.id, result: hugeResult })),
    };
    deps = { callLLM, autoCompact };
    orchestrator = new ToolLoopOrchestrator(deps, chatRepo);

    callLLM
      .mockResolvedValueOnce({ content: "", toolCalls: [{ id: "c1", name: "dup", arguments: "{}" }] } as LLMCallResult)
      .mockImplementationOnce(async (_model, request) => {
        // 第 2 次请求发出前应已裁剪掉巨大的 tool 结果
        const toolMsg = request.messages.find((m) => m.role === "tool");
        expect(toolMsg?.content).not.toBe(hugeResult);
        return finalTextResult("done");
      });

    await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry }));

    expect(callLLM).toHaveBeenCalledTimes(2);
  });
});
