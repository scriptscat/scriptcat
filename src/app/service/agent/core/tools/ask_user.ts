import type { ToolDefinition, ChatStreamEvent } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import { requireString } from "./param_utils";

export const ASK_USER_DEFINITION: ToolDefinition = {
  name: "ask_user",
  description:
    "Ask the user a question and wait for their response. " +
    "Text response only (no image support). Times out after 5 minutes. " +
    "The user can always type a custom response even when options are provided.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask the user" },
      options: {
        type: "array",
        items: { type: "string" },
        description: "List of choices. User selects from these but can also type a custom response.",
      },
      multiple: {
        type: "boolean",
        description: "Allow selecting multiple options (default: false).",
      },
    },
    required: ["question"],
  },
};

// 5 分钟超时
const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000;

export function createAskUserTool(
  sendEvent: (event: ChatStreamEvent) => void,
  resolvers: Map<string, (answer: string) => void>,
  signal: AbortSignal = new AbortController().signal
): { definition: ToolDefinition; executor: ToolExecutor } {
  let askCounter = 0;

  const executor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const question = requireString(args, "question");

      const options = args.options as string[] | undefined;
      const multiple = args.multiple as boolean | undefined;

      const askId = `ask_${Date.now()}_${++askCounter}`;

      if (signal.aborted) return JSON.stringify({ answer: null, reason: "aborted" });

      // 通知 UI 显示提问
      sendEvent({ type: "ask_user", id: askId, question, options, multiple });

      // 等待用户回复
      return new Promise<string>((resolve) => {
        let settled = false;
        const finish = (result: string, event: ChatStreamEvent) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          resolvers.delete(askId);
          sendEvent(event);
          resolve(result);
        };
        const onAbort = () => {
          finish(JSON.stringify({ answer: null, reason: "aborted" }), { type: "ask_user_expired", id: askId });
        };
        const timer = setTimeout(() => {
          finish(JSON.stringify({ answer: null, reason: "timeout" }), { type: "ask_user_expired", id: askId });
        }, ASK_USER_TIMEOUT_MS);
        signal.addEventListener("abort", onAbort, { once: true });
        resolvers.set(askId, (answer: string) => {
          finish(JSON.stringify({ answer }), { type: "ask_user_resolved", id: askId });
        });
        if (signal.aborted) onAbort();
      });
    },
  };

  return { definition: ASK_USER_DEFINITION, executor };
}
