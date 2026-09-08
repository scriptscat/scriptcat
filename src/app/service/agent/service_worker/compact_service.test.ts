import { describe, expect, it, vi } from "vitest";
import { CompactService } from "./compact_service";
import type { AgentModelConfig, ChatRequest } from "@App/app/service/agent/core/types";
import { COMPACT_SYSTEM_PROMPT, buildCompactUserPrompt } from "@App/app/service/agent/core/compact_prompt";
import { estimateRequestTokens } from "@App/app/service/agent/core/context_elision";
import { getContextWindow, getInputTokenBudget } from "@App/app/service/agent/core/model_context";

const MODEL: AgentModelConfig = {
  id: "compact-model",
  name: "Compact",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4o",
  contextWindow: 10_000,
  maxTokens: 2_000,
};

// 二分查找最小长度而非逐字符递增：estimateRequestTokens 引入字节→token 折算后，
// 命中目标区间所需的字符数随之变大，逐字符线性扫描（每次都要 O(len) 的 JSON.stringify）
// 会在字符数翻倍后耗时成倍增长，曾在 CI 上导致该用例超时。
function makeCurrentMessages(): ChatRequest["messages"] {
  const buildMessages = (len: number): ChatRequest["messages"] => [{ role: "user", content: "x".repeat(len) }];
  const estimateFor = (len: number) => {
    const summaryMessages: ChatRequest["messages"] = [
      { role: "system", content: COMPACT_SYSTEM_PROMPT },
      ...buildMessages(len),
      { role: "user", content: buildCompactUserPrompt() },
    ];
    return estimateRequestTokens(summaryMessages, undefined, undefined, MODEL);
  };

  const budget = getInputTokenBudget(MODEL);
  const ceiling = getContextWindow(MODEL) * 0.9;

  let low = 1;
  let high = 20_000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (estimateFor(mid) > budget) high = mid;
    else low = mid + 1;
  }

  const estimate = estimateFor(low);
  if (estimate > budget && estimate < ceiling) return buildMessages(low);
  throw new Error("未能构造出位于输入预算与 90% 预检之间的 compact 测试样例");
}

describe("CompactService 自动压缩", () => {
  it("自动压缩应返回摘要请求的 token 用量", async () => {
    const usage = { inputTokens: 120, outputTokens: 30, cacheCreationInputTokens: 10, cacheReadInputTokens: 5 };
    const modelService = {} as any;
    const orchestrator = {
      callLLM: vi.fn().mockResolvedValue({
        content: "<summary>摘要</summary>",
        usage,
        contentBlocks: [{ type: "image", attachmentId: "auto-orphan.png", mimeType: "image/png" }],
      }),
    };
    const chatRepo = {
      getAttachment: vi.fn().mockResolvedValue(null),
      getMessageSnapshot: vi.fn().mockResolvedValue({ generation: "gen-1", revision: 2, messages: [] }),
      saveMessages: vi.fn().mockResolvedValue(undefined),
      deleteAttachment: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new CompactService(modelService, orchestrator, chatRepo);

    await expect(
      service.autoCompact(
        "conv-1",
        "gen-1",
        MODEL,
        [{ role: "user", content: "需要摘要的内容" }],
        vi.fn(),
        new AbortController().signal
      )
    ).resolves.toEqual(usage);
    expect(chatRepo.deleteAttachment).toHaveBeenCalledWith("auto-orphan.png");
  });

  it("摘要保留 uploads 路径时应把对应历史附件所有权转移给摘要消息", async () => {
    const orchestrator = {
      callLLM: vi.fn().mockResolvedValue({ content: "<summary>继续使用 uploads/retained.png</summary>" }),
    };
    const chatRepo = {
      getAttachment: vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" })),
      getMessageSnapshot: vi.fn().mockResolvedValue({
        generation: "gen-1",
        revision: 2,
        messages: [
          {
            id: "m1",
            conversationId: "conv-1",
            role: "user",
            content: [{ type: "image", attachmentId: "retained.png", mimeType: "image/png" }],
            ownedAttachmentIds: ["retained.png"],
            createtime: 1,
          },
        ],
      }),
      saveMessages: vi.fn().mockResolvedValue(undefined),
      deleteAttachment: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new CompactService({} as any, orchestrator, chatRepo);

    await service.autoCompact(
      "conv-1",
      "gen-1",
      MODEL,
      [{ role: "user", content: [{ type: "image", attachmentId: "retained.png", mimeType: "image/png" }] }],
      vi.fn(),
      new AbortController().signal
    );

    expect(chatRepo.saveMessages.mock.calls[0][1][0].ownedAttachmentIds).toEqual(["retained.png"]);
  });

  it("Stop 恰好落在摘要提交之后时不应以旧快照覆盖后续历史", async () => {
    const controller = new AbortController();
    const priorMessages = [{ id: "m1", conversationId: "conv-1", role: "user", content: "原始历史", createtime: 1 }];
    const modelService = {} as any;
    const orchestrator = { callLLM: vi.fn().mockResolvedValue({ content: "<summary>摘要</summary>" }) };
    const saveCalls: any[][] = [];
    const chatRepo = {
      getAttachment: vi.fn().mockResolvedValue(null),
      getMessageSnapshot: vi.fn().mockResolvedValue({ generation: "gen-1", revision: 2, messages: priorMessages }),
      saveMessages: vi.fn().mockImplementation(async (_id: string, messages: any[]) => {
        saveCalls.push(messages);
        // 模拟 abort 恰好落在 close() 提交窗口：写入已生效，signal 事后才被观察到
        if (saveCalls.length === 1) controller.abort();
      }),
    } as any;
    const service = new CompactService(modelService, orchestrator, chatRepo);
    const sendEvent = vi.fn();

    await expect(
      service.autoCompact("conv-1", "gen-1", MODEL, [{ role: "user", content: "内容" }], sendEvent, controller.signal)
    ).rejects.toThrow("Aborted");

    // 写入已经通过 revision CAS 线性化；不能再无条件回写旧历史覆盖之后的追加。
    expect(saveCalls).toHaveLength(1);
    expect(sendEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "compact_done" }));
  });

  it("摘要请求超过输出保留预算时应返回 context_too_large", async () => {
    const modelService = {} as any;
    const orchestrator = { callLLM: vi.fn() };
    const chatRepo = {
      getAttachment: vi.fn().mockResolvedValue(null),
      getMessageSnapshot: vi.fn().mockResolvedValue({ generation: "gen-1", revision: 0, messages: [] }),
      saveMessages: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new CompactService(modelService, orchestrator, chatRepo);
    const sendEvent = vi.fn();
    const signal = new AbortController().signal;
    const currentMessages = makeCurrentMessages();

    await expect(
      service.autoCompact("conv-1", "gen-1", MODEL, currentMessages, sendEvent, signal)
    ).rejects.toMatchObject({
      errorCode: "context_too_large",
    });

    expect(orchestrator.callLLM).not.toHaveBeenCalled();
    expect(chatRepo.saveMessages).not.toHaveBeenCalled();
  });

  it("摘要成功后持久化失败时异常应保留摘要调用 usage", async () => {
    const usage = { inputTokens: 44, outputTokens: 9 };
    const orchestrator = { callLLM: vi.fn().mockResolvedValue({ content: "<summary>摘要</summary>", usage }) };
    const chatRepo = {
      getAttachment: vi.fn().mockResolvedValue(null),
      getMessageSnapshot: vi.fn().mockResolvedValue({ generation: "gen-1", revision: 1, messages: [] }),
      saveMessages: vi.fn().mockRejectedValue(new Error("disk full")),
    } as any;
    const service = new CompactService({} as any, orchestrator, chatRepo);

    await expect(
      service.autoCompact(
        "conv-1",
        "gen-1",
        MODEL,
        [{ role: "user", content: "content" }],
        vi.fn(),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ message: "disk full", usage });
  });

  it("摘要内容超过摘要模型预算时应在调用 provider 前返回 context_too_large", async () => {
    const modelService = {
      getSummaryModel: vi.fn().mockResolvedValue(MODEL),
    } as any;
    const orchestrator = { callLLM: vi.fn().mockResolvedValue({ content: "ok" }) };
    const chatRepo = {
      getAttachment: vi.fn().mockResolvedValue(null),
      saveMessages: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new CompactService(modelService, orchestrator, chatRepo);
    const hugeContent = "x".repeat(20_000);

    await expect(service.summarizeContent(hugeContent, "extract")).rejects.toMatchObject({
      errorCode: "context_too_large",
      estimatedInputTokens: expect.any(Number),
    });

    expect(orchestrator.callLLM).not.toHaveBeenCalled();
  });

  it("网页摘要忽略模型生成 block 时应清理对应附件", async () => {
    const modelService = { getSummaryModel: vi.fn().mockResolvedValue(MODEL) } as any;
    const orchestrator = {
      callLLM: vi.fn().mockResolvedValue({
        content: "summary",
        contentBlocks: [{ type: "image", attachmentId: "summary-orphan.png", mimeType: "image/png" }],
      }),
    };
    const chatRepo = { deleteAttachment: vi.fn().mockResolvedValue(undefined) } as any;
    const service = new CompactService(modelService, orchestrator, chatRepo);

    await expect(service.summarizeContent("content", "extract")).resolves.toMatchObject({ content: "summary" });
    expect(chatRepo.deleteAttachment).toHaveBeenCalledWith("summary-orphan.png");
  });
});
