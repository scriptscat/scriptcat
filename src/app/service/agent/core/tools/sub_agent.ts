import type { SubAgentDetails, ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";

// 子代理运行选项
export type SubAgentRunOptions = {
  prompt: string;
  description: string;
  type?: string;
  to?: string; // 延续已有子代理
};

// 子代理运行结果
export type SubAgentRunResult = {
  agentId: string;
  result: string;
  details?: SubAgentDetails; // 执行详情（用于持久化）
};

export const SUB_AGENT_DEFINITION: ToolDefinition = {
  name: "agent",
  description:
    "Launch a sub-agent to handle a subtask autonomously. Sub-agents run in their own conversation context. Use the `type` parameter to select a specialized sub-agent, or use `to` to continue a previous sub-agent with follow-up instructions.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task description or follow-up message for the sub-agent. Be specific about what you need.",
      },
      description: {
        type: "string",
        description:
          "A short (3-5 word) description of what the sub-agent will do, shown in the UI. Optional when resuming a previous sub-agent via `to`.",
      },
      type: {
        type: "string",
        description:
          "Sub-agent type. Available types: 'researcher' (web search/fetch, data analysis, no tab interaction), 'page_operator' (browser tab interaction, page automation), 'general' (all tools, default). Choose the most specific type for better results.",
      },
      to: {
        type: "string",
        description:
          "agentId of a previously completed sub-agent. Sends a follow-up message while preserving the sub-agent's full conversation context.",
      },
    },
    required: ["prompt"],
  },
};

export function createSubAgentTool(params: {
  runSubAgent: (options: SubAgentRunOptions) => Promise<SubAgentRunResult>;
}): {
  definition: ToolDefinition;
  executor: ToolExecutor;
} {
  const executor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const prompt = args.prompt as string;
      const description = (args.description as string) || "Sub-agent task";
      const type = args.type as string | undefined;
      const to = args.to as string | undefined;

      if (!prompt) {
        throw new Error("prompt is required");
      }

      const result = await params.runSubAgent({ prompt, description, type, to });

      // 返回结构化结果，附带子代理执行详情用于持久化
      const content = `[agentId: ${result.agentId}]\n\n${result.result}`;
      if (result.details) {
        return { content, subAgentDetails: result.details };
      }
      return content;
    },
  };

  return { definition: SUB_AGENT_DEFINITION, executor };
}
