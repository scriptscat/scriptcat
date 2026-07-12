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

function makeCurrentMessages(): ChatRequest["messages"] {
  for (let len = 1; len < 20_000; len++) {
    const currentMessages: ChatRequest["messages"] = [{ role: "user", content: "x".repeat(len) }];
    const summaryMessages: ChatRequest["messages"] = [
      { role: "system", content: COMPACT_SYSTEM_PROMPT },
      ...currentMessages,
      { role: "user", content: buildCompactUserPrompt() },
    ];
    const estimate = estimateRequestTokens(summaryMessages, undefined, undefined, MODEL);
    if (estimate > getInputTokenBudget(MODEL) && estimate < getContextWindow(MODEL) * 0.9) {
      return currentMessages;
    }
  }
  throw new Error("未能构造出位于输入预算与 90% 预检之间的 compact 测试样例");
}

describe("CompactService 自动压缩", () => {
  it("摘要请求超过输出保留预算时应返回 context_too_large", async () => {
    const modelService = {} as any;
    const orchestrator = { callLLM: vi.fn() };
    const chatRepo = {
      getAttachment: vi.fn().mockResolvedValue(null),
      saveMessages: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new CompactService(modelService, orchestrator, chatRepo);
    const sendEvent = vi.fn();
    const signal = new AbortController().signal;
    const currentMessages = makeCurrentMessages();

    await expect(service.autoCompact("conv-1", MODEL, currentMessages, sendEvent, signal)).rejects.toMatchObject({
      errorCode: "context_too_large",
    });

    expect(orchestrator.callLLM).not.toHaveBeenCalled();
    expect(chatRepo.saveMessages).not.toHaveBeenCalled();
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
    });

    expect(orchestrator.callLLM).not.toHaveBeenCalled();
  });
});
