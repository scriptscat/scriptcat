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
    updateMessage: vi.fn().mockResolvedValue(undefined),
    commitToolRound: vi.fn().mockResolvedValue(undefined),
    getMessageSnapshot: vi.fn().mockResolvedValue({ generation: "gen-1", revision: 0, messages: [] }),
    getAttachment: vi.fn().mockResolvedValue(null),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
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
      sendEvent: sendEvent as (event: ChatStreamEvent) => void,
      signal: new AbortController().signal,
      scriptToolCallback: null,
      conversationId: "conv-1",
      conversationGeneration: "gen-1",
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

  it("成功工具的内部 usage 应累计到父会话终态", async () => {
    toolRegistry = {
      getDefinitions: makeFakeToolRegistry().getDefinitions,
      execute: async (toolCalls) =>
        toolCalls.map((toolCall) => ({
          id: toolCall.id,
          result: "child done",
          usage: { inputTokens: 100, outputTokens: 20 },
        })),
    };
    callLLM
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "child-1", name: "dup", arguments: "{}" }],
        usage: { inputTokens: 10, outputTokens: 2 },
      })
      .mockResolvedValueOnce(finalTextResult("done"));

    await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry }));

    const doneEvent = sendEvent.mock.calls.map((call) => call[0]).find((event) => event.type === "done");
    expect(doneEvent?.usage).toEqual(expect.objectContaining({ inputTokens: 110, outputTokens: 22 }));
  });

  it("auto compact 失败时抛出包含累计 usage 与 conversationId 的结构化错误", async () => {
    callLLM.mockResolvedValue({ content: "继续", usage: { inputTokens: 13000, outputTokens: 5 } });
    autoCompact.mockRejectedValue(
      Object.assign(new Error("compact failed"), { usage: { inputTokens: 120, outputTokens: 15 } })
    );

    await expect(
      orchestrator.callLLMWithToolLoop(
        // 13000/16000 > 80%，按完整上下文窗口触发自动压缩。
        baseParams({ model: { ...MODEL, contextWindow: 16000 }, messages: [{ role: "user", content: "开始" }] })
      )
    ).rejects.toMatchObject({
      message: "compact failed",
      conversationId: "conv-1",
      usage: { inputTokens: 13120, outputTokens: 20 },
    });
  });

  it("provider 非取消失败时，错误上挂载的本轮部分 usage 应并入累计 usage 后再抛出", async () => {
    // 第 1 轮正常返回 tool call（累计 usage 10/5），第 2 轮 provider 失败，
    // 失败错误上带有解析层已知的本轮部分 usage（如逐 chunk 附带 usage 的 OpenAI 兼容 API）
    callLLM
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "c1", name: "dup", arguments: "{}" }],
        usage: { inputTokens: 10, outputTokens: 5 },
      } as LLMCallResult)
      .mockRejectedValueOnce(
        Object.assign(new Error("stream truncated"), { usage: { inputTokens: 7, outputTokens: 3 } })
      );

    await expect(orchestrator.callLLMWithToolLoop(baseParams())).rejects.toMatchObject({
      message: "stream truncated",
      conversationId: "conv-1",
      // 之前的实现用上一轮累计覆盖错误自带的 usage，本轮已知的 7/3 会丢失
      usage: { inputTokens: 17, outputTokens: 8 },
    });
  });

  it("LLM 返回后立即取消时，已保存但未被任何消息引用的生成附件应被删除", async () => {
    const controller = new AbortController();
    callLLM.mockImplementation(async () => {
      // 取消恰好落在 provider 成功返回之后、消息持久化之前
      controller.abort();
      return {
        content: "生成了一张图",
        contentBlocks: [{ type: "image", attachmentId: "img_orphan.png", mimeType: "image/png" }],
        usage: { inputTokens: 10, outputTokens: 5 },
      } as LLMCallResult;
    });

    await orchestrator.callLLMWithToolLoop(baseParams({ signal: controller.signal }));

    // 终态是取消，assistant 消息不会持久化，生成的附件必须回收，否则成为孤儿文件
    expect(chatRepo.deleteAttachment).toHaveBeenCalledWith("img_orphan.png");
    const terminal = sendEvent.mock.calls.map((c) => c[0]).find((e) => e.type === "error");
    expect(terminal?.errorCode).toBe("cancelled");
  });

  it("模型生成附件应把所有权持久化到 assistant 消息", async () => {
    callLLM.mockResolvedValue({
      content: "生成完成",
      contentBlocks: [{ type: "image", attachmentId: "generated-owned.png", mimeType: "image/png" }],
    });

    await orchestrator.callLLMWithToolLoop(baseParams());

    expect(chatRepo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ownedAttachmentIds: ["generated-owned.png"] }),
      "gen-1"
    );
  });

  it("LLM 结果携带的图片保存 warning 应持久化到 assistant 消息并广播 system_warning", async () => {
    callLLM.mockResolvedValue({
      content: "",
      warning: "1 generated image(s) failed to save and were lost.",
    });

    await orchestrator.callLLMWithToolLoop(baseParams());

    expect(chatRepo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ warning: "1 generated image(s) failed to save and were lost." }),
      "gen-1"
    );
    expect(
      sendEvent.mock.calls.some(
        (call) =>
          call[0].type === "system_warning" && call[0].message === "1 generated image(s) failed to save and were lost."
      )
    ).toBe(true);
  });

  it("带工具调用的 assistant 消息携带 warning 时也应持久化并广播 system_warning，而不只是最终回复分支", async () => {
    toolRegistry = {
      getDefinitions: () => [
        { name: "image_tool", description: "image", parameters: { type: "object", properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue([{ id: "call-1", result: "ok" }]),
    };
    callLLM
      .mockResolvedValueOnce({
        content: "",
        warning: "1 generated image(s) failed to save and were lost.",
        toolCalls: [{ id: "call-1", name: "image_tool", arguments: "{}" }],
      })
      .mockResolvedValueOnce(finalTextResult("done"));

    await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry }));

    expect(chatRepo.commitToolRound).toHaveBeenCalledWith(
      expect.objectContaining({ warning: "1 generated image(s) failed to save and were lost." }),
      expect.anything(),
      "gen-1"
    );
    expect(
      sendEvent.mock.calls.some(
        (call) =>
          call[0].type === "system_warning" && call[0].message === "1 generated image(s) failed to save and were lost."
      )
    ).toBe(true);
  });

  it(
    "最终回复持久化失败（persist_failed）时应回收生成附件",
    // 持久化重试退避 200ms + 400ms，放宽超时
    { timeout: 3000 },
    async () => {
      chatRepo.appendMessage.mockRejectedValue(new Error("disk full"));
      callLLM.mockResolvedValue({
        content: "回复",
        contentBlocks: [{ type: "image", attachmentId: "img_lost.png", mimeType: "image/png" }],
        usage: { inputTokens: 3, outputTokens: 2 },
      } as LLMCallResult);

      await orchestrator.callLLMWithToolLoop(baseParams());

      const terminal = sendEvent.mock.calls.map((c) => c[0]).find((e) => e.type === "error");
      expect(terminal?.errorCode).toBe("persist_failed");
      expect(chatRepo.deleteAttachment).toHaveBeenCalledWith("img_lost.png");
    }
  );

  it("最终回复持久化报错且确认读也失败时，不应删除可能已被消息引用的生成附件", { timeout: 3000 }, async () => {
    chatRepo.appendMessage.mockRejectedValue(new Error("ambiguous close failure"));
    chatRepo.getMessageSnapshot.mockRejectedValue(new Error("confirmation read failed"));
    callLLM.mockResolvedValue({
      content: "回复",
      contentBlocks: [{ type: "image", attachmentId: "img_maybe_committed.png", mimeType: "image/png" }],
      usage: { inputTokens: 3, outputTokens: 2 },
    } as LLMCallResult);

    await orchestrator.callLLMWithToolLoop(baseParams());

    expect(chatRepo.deleteAttachment).not.toHaveBeenCalledWith("img_maybe_committed.png");
  });

  it("工具结果持久化期间被取消时应立即终态化，而不是带着已取消的信号进入下一轮", async () => {
    const controller = new AbortController();
    callLLM.mockResolvedValueOnce(dupToolCallResult("c1"));
    // 工具执行正常结束后，tool 结果消息落库完成的同时 Stop 到达（晚于 cancelledDuringTools 采样点）
    chatRepo.commitToolRound.mockImplementation(async () => {
      controller.abort();
    });

    await orchestrator.callLLMWithToolLoop(baseParams({ signal: controller.signal }));

    expect(callLLM).toHaveBeenCalledTimes(1);
    const events = sendEvent.mock.calls.map((c) => c[0]);
    expect(events.find((e) => e.type === "error")?.errorCode).toBe("cancelled");
    expect(events.some((e) => e.type === "new_message")).toBe(false);
  });

  it("脚本遗漏工具结果时应补齐完整结果组，并在原子提交后才发布事件", async () => {
    toolRegistry = {
      getDefinitions: () => [
        { name: "script_tool", description: "script", parameters: { type: "object", properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue([{ id: "call-1", result: "ok" }]),
    };
    callLLM
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [
          { id: "call-1", name: "script_tool", arguments: "{}" },
          { id: "call-2", name: "script_tool", arguments: "{}" },
        ],
      })
      .mockResolvedValueOnce(finalTextResult("done"));
    chatRepo.commitToolRound.mockImplementation(async () => {
      expect(sendEvent.mock.calls.some((call) => call[0].type === "tool_call_complete")).toBe(false);
    });

    await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry }));

    const [, toolMessages] = chatRepo.commitToolRound.mock.calls[0];
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages.map((message: any) => message.toolCallId)).toEqual(["call-1", "call-2"]);
    expect(toolMessages[1].content).toContain("missing");
    const secondRequest = callLLM.mock.calls[1][1];
    expect(secondRequest.messages.filter((message: any) => message.role === "tool")).toHaveLength(2);
    expect(sendEvent.mock.calls.filter((call) => call[0].type === "tool_call_complete")).toHaveLength(2);
  });

  it("工具结果组提交失败时应回收本轮新建附件且不发布完成事件", async () => {
    toolRegistry = {
      getDefinitions: () => [
        { name: "image_tool", description: "image", parameters: { type: "object", properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue([
        {
          id: "call-image",
          result: "image",
          attachments: [{ id: "owned.png", type: "image", name: "owned.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["owned.png"],
        },
      ]),
    };
    callLLM.mockResolvedValueOnce({
      content: "",
      contentBlocks: [{ type: "image", attachmentId: "generated.png", mimeType: "image/png" }],
      toolCalls: [{ id: "call-image", name: "image_tool", arguments: "{}" }],
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    chatRepo.commitToolRound.mockRejectedValueOnce(new Error("disk full"));

    const error = await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry })).catch((reason) => reason);

    expect(error).toMatchObject({
      message: "disk full",
      usage: expect.objectContaining({ inputTokens: 12, outputTokens: 4 }),
    });
    expect(chatRepo.deleteAttachment).toHaveBeenCalledWith("owned.png");
    expect(chatRepo.deleteAttachment).toHaveBeenCalledWith("generated.png");
    expect(sendEvent.mock.calls.some((call) => call[0].type === "tool_call_complete")).toBe(false);
  });

  it("工具结果组提交报错但读回确认已落盘时应保留附件并发布结果", async () => {
    toolRegistry = {
      getDefinitions: () => [
        { name: "image_tool", description: "image", parameters: { type: "object", properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue([
        {
          id: "call-image",
          result: "image",
          attachments: [{ id: "owned.png", type: "image", name: "owned.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["owned.png"],
        },
      ]),
    };
    callLLM
      .mockResolvedValueOnce({
        content: "",
        contentBlocks: [{ type: "image", attachmentId: "generated.png", mimeType: "image/png" }],
        toolCalls: [{ id: "call-image", name: "image_tool", arguments: "{}" }],
      })
      .mockResolvedValueOnce(finalTextResult("done"));
    chatRepo.commitToolRound.mockImplementationOnce(async (assistant: any, toolMessages: any[]) => {
      chatRepo.getMessageSnapshot.mockResolvedValueOnce({
        generation: "gen-1",
        revision: 1,
        messages: [assistant, ...toolMessages],
      });
      throw new Error("ambiguous close failure");
    });

    await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry }));

    expect(chatRepo.deleteAttachment).not.toHaveBeenCalledWith("owned.png");
    expect(chatRepo.deleteAttachment).not.toHaveBeenCalledWith("generated.png");
    expect(sendEvent.mock.calls.some((call) => call[0].type === "tool_call_complete")).toBe(true);
  });

  it("提交报错且确认读本身也失败（不确定态）时不应删除附件，而不是当作未落盘", async () => {
    toolRegistry = {
      getDefinitions: () => [
        { name: "image_tool", description: "image", parameters: { type: "object", properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue([
        {
          id: "call-image",
          result: "image",
          attachments: [{ id: "owned.png", type: "image", name: "owned.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["owned.png"],
        },
      ]),
    };
    callLLM
      .mockResolvedValueOnce({
        content: "",
        contentBlocks: [{ type: "image", attachmentId: "generated.png", mimeType: "image/png" }],
        toolCalls: [{ id: "call-image", name: "image_tool", arguments: "{}" }],
        usage: { inputTokens: 12, outputTokens: 4 },
      })
      .mockResolvedValueOnce(finalTextResult("done"));
    chatRepo.commitToolRound.mockRejectedValueOnce(new Error("disk full"));
    // 确认读也失败：无法证实写入是否落盘，属于不确定态，不能等同于"确实未落盘"
    chatRepo.getMessageSnapshot.mockRejectedValueOnce(new Error("read failed"));

    const error = await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry })).catch((reason) => reason);

    expect(error).toBeUndefined();
    expect(chatRepo.deleteAttachment).not.toHaveBeenCalledWith("owned.png");
    expect(chatRepo.deleteAttachment).not.toHaveBeenCalledWith("generated.png");
  });

  it("提交与幂等重试均报错、确认读本身也持续失败时应以 persist_indeterminate 终止，不发布也不删附件", async () => {
    toolRegistry = {
      getDefinitions: () => [
        { name: "image_tool", description: "image", parameters: { type: "object", properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue([
        {
          id: "call-image",
          result: "image",
          attachments: [{ id: "owned.png", type: "image", name: "owned.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["owned.png"],
        },
      ]),
    };
    callLLM.mockResolvedValueOnce({
      content: "",
      contentBlocks: [{ type: "image", attachmentId: "generated.png", mimeType: "image/png" }],
      toolCalls: [{ id: "call-image", name: "image_tool", arguments: "{}" }],
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    // 首次提交失败、确认读失败（不确定态）；幂等重试提交依旧失败、重试后的确认读依旧失败——
    // 无法在合理次数内确认落盘状态，必须终止而不是当作成功发布
    chatRepo.commitToolRound
      .mockRejectedValueOnce(new Error("disk full"))
      .mockRejectedValueOnce(new Error("disk full"));
    chatRepo.getMessageSnapshot
      .mockRejectedValueOnce(new Error("read failed"))
      .mockRejectedValueOnce(new Error("read failed"));

    const error = await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry })).catch((reason) => reason);

    expect(error).toMatchObject({ errorCode: "persist_indeterminate" });
    expect(chatRepo.commitToolRound).toHaveBeenCalledTimes(2);
    expect(chatRepo.deleteAttachment).not.toHaveBeenCalledWith("owned.png");
    expect(chatRepo.deleteAttachment).not.toHaveBeenCalledWith("generated.png");
    expect(sendEvent.mock.calls.some((call) => call[0].type === "tool_call_complete")).toBe(false);
  });

  it("工具内部摘要 LLM 的 usage 应恰好一次计入父对话终态", async () => {
    toolRegistry = {
      getDefinitions: () => [
        { name: "web_fetch", description: "fetch", parameters: { type: "object", properties: {} } },
      ],
      execute: vi
        .fn()
        .mockResolvedValue([{ id: "call-summary", result: "summary", usage: { inputTokens: 30, outputTokens: 8 } }]),
    };
    callLLM
      .mockResolvedValueOnce({
        content: "",
        toolCalls: [{ id: "call-summary", name: "web_fetch", arguments: "{}" }],
        usage: { inputTokens: 10, outputTokens: 2 },
      })
      .mockResolvedValueOnce({ content: "done", usage: { inputTokens: 5, outputTokens: 1 } });

    await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry }));

    const done = sendEvent.mock.calls.map((call) => call[0]).find((event) => event.type === "done");
    expect(done?.usage).toEqual(expect.objectContaining({ inputTokens: 45, outputTokens: 11 }));
  });

  it("触发 autoCompact 时应保留原始模型，而不是把 contextWindow 预先缩小", async () => {
    callLLM.mockResolvedValue({ content: "done", usage: { inputTokens: 8500, outputTokens: 5 } });

    await orchestrator.callLLMWithToolLoop(
      baseParams({ model: { ...MODEL, contextWindow: 10_000, maxTokens: 2_000 } })
    );

    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM.mock.calls[0][0]).toMatchObject({ contextWindow: 10_000, maxTokens: 2_000 });
    expect(autoCompact).toHaveBeenCalledTimes(1);
    expect(autoCompact.mock.calls[0][2]).toMatchObject({ contextWindow: 10_000, maxTokens: 2_000 });
  });

  it("输入占用未达到完整上下文窗口 80% 时不应提前自动压缩", async () => {
    callLLM.mockResolvedValue({ content: "done", usage: { inputTokens: 6000, outputTokens: 5 } });

    await orchestrator.callLLMWithToolLoop(
      baseParams({ model: { ...MODEL, contextWindow: 10_000, maxTokens: 2_000 } })
    );

    expect(autoCompact).not.toHaveBeenCalled();
  });

  it("自动压缩的 token 用量应计入最终 done 事件", async () => {
    callLLM.mockResolvedValue({ content: "done", usage: { inputTokens: 8500, outputTokens: 5 } });
    autoCompact.mockResolvedValue({
      inputTokens: 120,
      outputTokens: 30,
      cacheCreationInputTokens: 10,
      cacheReadInputTokens: 5,
    });

    await orchestrator.callLLMWithToolLoop(
      baseParams({ model: { ...MODEL, contextWindow: 10_000, maxTokens: 2_000 } })
    );

    const doneEvent = sendEvent.mock.calls.find((call) => call[0].type === "done")?.[0];
    expect(doneEvent).toMatchObject({
      usage: { inputTokens: 8620, outputTokens: 35, cacheCreationInputTokens: 10, cacheReadInputTokens: 5 },
    });
  });

  it("续接长历史时应完整透传旧工具结果且不修改原始历史", async () => {
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
      expect(request.messages[1].content).toBe(oldToolResult);
      expect(messages[1].content).toBe(oldToolResult);
      return finalTextResult("done");
    });

    await orchestrator.callLLMWithToolLoop(baseParams({ messages, model: { ...MODEL, contextWindow: 1000 } }));
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
    expect(chatRepo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant", conversationId: "conv-1" }),
      "gen-1"
    );
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

describe("ToolLoopOrchestrator 工具结果透传", () => {
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
      model: { ...MODEL, contextWindow: 20000 },
      messages: [{ role: "user", content: "开始" }] as ChatRequest["messages"],
      sendEvent: sendEvent as (event: ChatStreamEvent) => void,
      signal: new AbortController().signal,
      scriptToolCallback: null,
      conversationId: "conv-1",
      ...overrides,
    };
  }

  it("大型工具结果应完整传给下一轮模型调用", async () => {
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
        const toolMsg = request.messages.find((m) => m.role === "tool");
        expect(toolMsg?.content).toBe(hugeResult);
        return finalTextResult("done");
      });

    await orchestrator.callLLMWithToolLoop(baseParams({ toolRegistry }));

    expect(callLLM).toHaveBeenCalledTimes(2);
  });
});
