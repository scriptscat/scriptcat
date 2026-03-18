import type { ToolDefinition, ChatStreamEvent } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";

export const ASK_USER_DEFINITION: ToolDefinition = {
  name: "ask_user",
  description:
    "Ask the user a question and wait for their response. Use this when you need clarification, a decision, or user input before proceeding. The user will see the question in the chat UI and can type a response.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask the user" },
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

      const askId = `ask_${Date.now()}_${++askCounter}`;

      // 通知 UI 显示提问
      sendEvent({ type: "ask_user", id: askId, question });

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
