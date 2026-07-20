import type { ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import { withTimeout } from "@App/pkg/utils/with_timeout";
import { requireString } from "./param_utils";

const EXECUTE_SCRIPT_TARGETS = ["page", "sandbox"] as const;
type ExecuteScriptTarget = (typeof EXECUTE_SCRIPT_TARGETS)[number];

function createExecuteScriptDefinition(allowedTargets: ExecuteScriptTarget[]): ToolDefinition {
  const targetDescriptions: Record<ExecuteScriptTarget, string> = {
    page: "'page' runs in a browser tab (MAIN world) with full DOM access and shares the page's window and globals. It cannot access extension blob URLs.",
    sandbox: "'sandbox' runs in an isolated computation environment without DOM access.",
  };
  return {
    name: "execute_script",
    description: `Execute JavaScript code. ${allowedTargets.map((target) => targetDescriptions[target]).join(" ")} Use \`return\` to return a value. Timeout: 30 seconds.`,
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to execute. Use `return` to return a value." },
        target: {
          type: "string",
          enum: allowedTargets,
          description: allowedTargets.map((target) => targetDescriptions[target]).join(" "),
        },
        ...(allowedTargets.includes("page")
          ? {
              tab_id: {
                type: "number",
                description: "Target tab ID for page execution. Defaults to active tab.",
              },
            }
          : {}),
      },
      required: ["code", "target"],
    },
  };
}

export const EXECUTE_SCRIPT_DEFINITION: ToolDefinition = createExecuteScriptDefinition([...EXECUTE_SCRIPT_TARGETS]);

const EXECUTE_SCRIPT_TIMEOUT_MS = 30_000;

export type ExecuteScriptDeps = {
  executeInPage: (code: string, options?: { tabId?: number }) => Promise<{ result: unknown; tabId: number }>;
  executeInSandbox: (code: string) => Promise<unknown>;
  timeoutMs?: number; // 可选超时（ms），默认 30s，测试用
};

export function createExecuteScriptTool(
  deps: ExecuteScriptDeps,
  options?: { allowedTargets?: ExecuteScriptTarget[] }
): {
  definition: ToolDefinition;
  executor: ToolExecutor;
} {
  const timeoutMs = deps.timeoutMs ?? EXECUTE_SCRIPT_TIMEOUT_MS;
  const allowedTargets = options?.allowedTargets ?? [...EXECUTE_SCRIPT_TARGETS];

  const executor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const code = requireString(args, "code");

      const target = requireString(args, "target");
      if (target !== "page" && target !== "sandbox") {
        throw new Error(`Invalid target: ${target}. Must be 'page' or 'sandbox'.`);
      }
      if (!allowedTargets.includes(target)) {
        throw new Error(`execute_script target="${target}" is not available in this context`);
      }

      if (target === "page") {
        const tabId = args.tab_id as number | undefined;
        const { result, tabId: actualTabId } = await withTimeout(
          deps.executeInPage(code, { tabId }),
          timeoutMs,
          () => new Error(`execute_script timed out after ${timeoutMs / 1000}s`)
        );
        return JSON.stringify({ result: result ?? null, target: "page", tab_id: actualTabId });
      }

      // sandbox
      const result = await withTimeout(
        deps.executeInSandbox(code),
        timeoutMs,
        () => new Error(`execute_script timed out after ${timeoutMs / 1000}s`)
      );
      return JSON.stringify({ result: result ?? null, target: "sandbox" });
    },
  };

  return { definition: createExecuteScriptDefinition(allowedTargets), executor };
}
