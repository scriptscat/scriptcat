import type { ToolDefinition, ChatStreamEvent } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";

export const ASK_USER_DEFINITION: ToolDefinition = {
  name: "ask_user",
  description:
    "Ask the user a question and wait for their response (text only, no image support). " +
    "Use options for structured choices (single/multi-select). Times out after 5 minutes.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask the user" },
      options: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of choices for the user. If provided, user selects from these instead of free text input.",
      },
      multiple: {
        type: "boolean",
        description: "Allow selecting multiple options (default: false, single-select).",
      },
    },
    required: ["question"],
  },
};

// 5 分钟超时
const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000;

export function createAskUserTool(
  sendEvent: (event: ChatStreamEvent) => void,
  resolvers: Map<string, (answer: string) => void>
): { definition: ToolDefinition; executor: ToolExecutor } {
  let askCounter = 0;

  const executor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const question = args.question as string;
      if (!question) {
        throw new Error("question is required");
      }

      const options = args.options as string[] | undefined;
      const multiple = args.multiple as boolean | undefined;

      const askId = `ask_${Date.now()}_${++askCounter}`;

      // 通知 UI 显示提问
      sendEvent({ type: "ask_user", id: askId, question, options, multiple });

      // 等待用户回复
      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          resolvers.delete(askId);
          resolve(JSON.stringify({ answer: null, reason: "timeout" }));
        }, ASK_USER_TIMEOUT_MS);

        resolvers.set(askId, (answer: string) => {
          clearTimeout(timer);
          resolvers.delete(askId);
          resolve(JSON.stringify({ answer }));
        });
      });
    },
  };

  return { definition: ASK_USER_DEFINITION, executor };
}
