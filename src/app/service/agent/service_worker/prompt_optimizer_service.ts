import type { AgentModelConfig, ChatRequest, ChatStreamEvent } from "../core/types";
import type { LLMCallResult } from "./llm_client";

export const PROMPT_OPTIMIZER_SYSTEM_PROMPT =
  "You are a prompt engineering expert. Rewrite the user's raw input into a clear, structured, and actionable prompt that an AI agent can execute. Preserve the original intent, requirements, constraints, and factual details. Always respond in the same language as the user's input. Output only the optimized prompt text, with no explanation, preamble, or markdown fence.";

interface PromptOptimizerModelSource {
  getModel(modelId?: string): Promise<AgentModelConfig>;
}

interface PromptOptimizerLLM {
  callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; cache?: boolean },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<LLMCallResult>;
}

export class PromptOptimizerService {
  private readonly activeRequests = new Map<string, AbortController>();

  constructor(
    private readonly modelSource: PromptOptimizerModelSource,
    private readonly llm: PromptOptimizerLLM
  ) {}

  async optimizePrompt(params: { requestId: string; prompt: string; modelId?: string }): Promise<string> {
    const prompt = params.prompt.trim();
    if (!prompt) throw new Error("Prompt cannot be empty");

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Prompt optimization timed out", "TimeoutError")),
      60_000
    );
    this.activeRequests.set(params.requestId, controller);

    try {
      const model = await this.modelSource.getModel(params.modelId);
      const result = await this.llm.callLLM(
        model,
        {
          messages: [
            { role: "system", content: PROMPT_OPTIMIZER_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          cache: false,
        },
        () => {},
        controller.signal
      );
      const optimized = result.content.trim();
      if (!optimized) throw new Error("Prompt optimizer returned an empty response");
      return optimized;
    } finally {
      clearTimeout(timeout);
      if (this.activeRequests.get(params.requestId) === controller) {
        this.activeRequests.delete(params.requestId);
      }
    }
  }

  cancelOptimization(requestId: string): boolean {
    const controller = this.activeRequests.get(requestId);
    if (!controller) return false;
    controller.abort(new DOMException("Prompt optimization cancelled", "AbortError"));
    this.activeRequests.delete(requestId);
    return true;
  }
}
