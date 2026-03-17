import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";

export const SUB_AGENT_DEFINITION: ToolDefinition = {
  name: "agent",
  description:
    "Spawn a sub-agent to handle a complex, independent subtask. The sub-agent has its own conversation context and can use web_fetch, web_search, task tools, skills, and MCP tools. Use this for tasks that can be done independently without user interaction.",
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
    },
    required: ["prompt", "description"],
  },
};

export function createSubAgentTool(params: { runSubAgent: (prompt: string, description: string) => Promise<string> }): {
  definition: ToolDefinition;
  executor: ToolExecutor;
} {
  const executor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const prompt = args.prompt as string;
      const description = (args.description as string) || "Sub-agent task";

      if (!prompt) {
        throw new Error("prompt is required");
      }

      const result = await params.runSubAgent(prompt, description);
      return result;
    },
  };

  return { definition: SUB_AGENT_DEFINITION, executor };
}
