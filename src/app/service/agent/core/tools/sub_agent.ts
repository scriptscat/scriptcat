import type { SubAgentDetails, ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import { SUB_AGENT_TYPES } from "@App/app/service/agent/core/sub_agent_types";
import { requireString } from "./param_utils";

// 子代理运行选项
export type SubAgentRunOptions = {
  prompt: string;
  description: string;
  type?: string;
  tabId?: number; // 父代理传递的标签页上下文
};

// 子代理运行结果
export type SubAgentRunResult = {
  agentId: string;
  result: string;
  details?: SubAgentDetails; // 执行详情（用于持久化）
};

// 在模块加载时固化一次可用 type 列表，供 provider 做 JSON Schema 强校验
// 后续若把 SUB_AGENT_TYPES 改为运行时 registry（#9），这里改为动态构建
const SUB_AGENT_TYPE_NAMES = Object.keys(SUB_AGENT_TYPES);

export const SUB_AGENT_DEFINITION: ToolDefinition = {
  name: "agent",
  description:
    "Launch a sub-agent to handle a subtask autonomously. Sub-agents run in their own conversation context. Use the `type` parameter to select a specialized sub-agent.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task description for the sub-agent. Be specific about what you need.",
      },
      description: {
        type: "string",
        description: "A short (3-5 word) description of what the sub-agent will do, shown in the UI.",
      },
      type: {
        type: "string",
        enum: SUB_AGENT_TYPE_NAMES,
        description:
          "Sub-agent type. 'researcher' (web search/fetch, page reading — read-only, no DOM interaction), 'page_operator' (browser tab interaction, DOM manipulation, page automation), 'general' (all tools, default). Choose the most specific type for better results.",
      },
      tab_id: {
        type: "number",
        description:
          "Tab ID to pass as context. The sub-agent will work on this existing tab instead of opening a new one.",
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
      const prompt = requireString(args, "prompt");
      const description = (args.description as string) || "Sub-agent task";
      const type = args.type as string | undefined;
      const tabId = args.tab_id as number | undefined;

      const result = await params.runSubAgent({ prompt, description, type, tabId });

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
