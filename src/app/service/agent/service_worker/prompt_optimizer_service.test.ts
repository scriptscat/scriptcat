import { describe, expect, it, vi } from "vitest";
import type { AgentModelConfig } from "../core/types";
import { PROMPT_OPTIMIZER_SYSTEM_PROMPT, PromptOptimizerService } from "./prompt_optimizer_service";

describe("提示词优化服务", () => {
  it("应使用所选模型并要求保留原意和输入语言", async () => {
    const model: AgentModelConfig = {
      id: "model-1",
      name: "Model 1",
      provider: "openai",
      apiBaseUrl: "https://example.com",
      apiKey: "test-key",
      model: "model-1",
    };
    const getModel = vi.fn().mockResolvedValue(model);
    const callLLM = vi.fn().mockResolvedValue({ content: "  优化后的提示词  " });
    const service = new PromptOptimizerService({ getModel }, { callLLM });

    await expect(
      service.optimizePrompt({ requestId: "request-1", prompt: "  帮我分析数据  ", modelId: "model-1" })
    ).resolves.toBe("优化后的提示词");

    expect(getModel).toHaveBeenCalledWith("model-1");
    expect(PROMPT_OPTIMIZER_SYSTEM_PROMPT).toContain("same language");
    expect(PROMPT_OPTIMIZER_SYSTEM_PROMPT).toContain("Preserve the original intent");
    expect(callLLM).toHaveBeenCalledWith(
      model,
      {
        messages: [
          { role: "system", content: PROMPT_OPTIMIZER_SYSTEM_PROMPT },
          { role: "user", content: "帮我分析数据" },
        ],
        cache: false,
      },
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it("空输入或空响应应报错", async () => {
    const getModel = vi.fn().mockResolvedValue({ id: "model-1" });
    const callLLM = vi.fn().mockResolvedValue({ content: "   " });
    const service = new PromptOptimizerService({ getModel }, { callLLM });

    await expect(service.optimizePrompt({ requestId: "empty", prompt: " ", modelId: "model-1" })).rejects.toThrow(
      "Prompt cannot be empty"
    );
    await expect(
      service.optimizePrompt({ requestId: "empty-response", prompt: "draft", modelId: "model-1" })
    ).rejects.toThrow("empty response");
  });

  it("取消请求时应中止进行中的模型调用", async () => {
    let signal: AbortSignal | undefined;
    const callLLM = vi.fn((_model, _params, _sendEvent, callSignal: AbortSignal) => {
      signal = callSignal;
      return new Promise<never>((_resolve, reject) => {
        callSignal.addEventListener("abort", () => reject(callSignal.reason), { once: true });
      });
    });
    const service = new PromptOptimizerService({ getModel: vi.fn().mockResolvedValue({ id: "model-1" }) }, { callLLM });

    const optimizing = service.optimizePrompt({ requestId: "request-to-cancel", prompt: "draft" });
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(service.cancelOptimization("request-to-cancel")).toBe(true);

    await expect(optimizing).rejects.toBeDefined();
    expect(signal?.aborted).toBe(true);
  });
});
