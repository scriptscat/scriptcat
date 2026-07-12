import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import { getInputTokenBudget } from "@App/app/service/agent/core/model_context";
import { ToolLoopOrchestrator as BaseToolLoopOrchestrator, type ToolLoopDeps } from "./tool_loop_orchestrator_base";

export type { ToolLoopDeps } from "./tool_loop_orchestrator_base";

/** 在原编排器外层统一预留输出 token 预算。 */
export class ToolLoopOrchestrator {
  constructor(
    private deps: ToolLoopDeps,
    private chatRepo: AgentChatRepo
  ) {}

  async callLLMWithToolLoop(params: Parameters<BaseToolLoopOrchestrator["callLLMWithToolLoop"]>[0]) {
    const inputBudget = getInputTokenBudget(params.model);
    const orchestrator = new BaseToolLoopOrchestrator(this.deps, this.chatRepo);
    return orchestrator.callLLMWithToolLoop({ ...params, inputTokenBudget: inputBudget });
  }
}
