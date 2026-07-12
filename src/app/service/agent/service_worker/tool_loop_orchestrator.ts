import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { getContextWindow, getInputTokenBudget } from "@App/app/service/agent/core/model_context";
import { ToolLoopOrchestrator as BaseToolLoopOrchestrator, type ToolLoopDeps } from "./tool_loop_orchestrator_base";

export type { ToolLoopDeps } from "./tool_loop_orchestrator_base";

/** 在原编排器外层统一预留输出 token，并补齐终态上下文错误的 usage 持久化。 */
export class ToolLoopOrchestrator {
  constructor(
    private deps: ToolLoopDeps,
    private chatRepo: AgentChatRepo
  ) {}

  async callLLMWithToolLoop(params: Parameters<BaseToolLoopOrchestrator["callLLMWithToolLoop"]>[0]) {
    const actualWindow = getContextWindow(params.model);
    const inputBudget = getInputTokenBudget(params.model);
    const effectiveWindow = Math.max(1, Math.floor(inputBudget / 0.9));
    const model: AgentModelConfig = {
      ...params.model,
      contextWindow: Math.min(actualWindow, effectiveWindow),
    };
    const totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    const deps: ToolLoopDeps = {
      ...this.deps,
      callLLM: async (...args) => {
        const result = await this.deps.callLLM(...args);
        if (result.usage) {
          totalUsage.inputTokens += result.usage.inputTokens;
          totalUsage.outputTokens += result.usage.outputTokens;
          totalUsage.cacheCreationInputTokens += result.usage.cacheCreationInputTokens || 0;
          totalUsage.cacheReadInputTokens += result.usage.cacheReadInputTokens || 0;
        }
        return result;
      },
    };
    const repo = new Proxy(this.chatRepo, {
      get: (target, property, receiver) => {
        if (property !== "appendMessage") return Reflect.get(target, property, receiver);
        return (message: any) =>
          target.appendMessage(
            message.errorCode === "context_too_large" && !message.usage
              ? { ...message, usage: { ...totalUsage } }
              : message
          );
      },
    });
    const orchestrator = new BaseToolLoopOrchestrator(deps, repo);
    return orchestrator.callLLMWithToolLoop({ ...params, model });
  }
}
