import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";

export const EXECUTE_SCRIPT_DEFINITION: ToolDefinition = {
  name: "execute_script",
  description:
    "Execute JavaScript code. Use target='page' to run in a web page (DOM access). Use target='sandbox' for isolated computation.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript code to execute. Use `return` to return a value." },
      target: {
        type: "string",
        enum: ["page", "sandbox"],
        description: "'page' runs in a tab, 'sandbox' runs in isolated env.",
      },
      tab_id: {
        type: "number",
        description: "Target tab ID for page execution. Defaults to active tab. Ignored for sandbox.",
      },
      world: {
        type: "string",
        enum: ["MAIN", "ISOLATED"],
        description:
          "JS execution world for page target. MAIN shares page globals, ISOLATED is extension-isolated. Default: ISOLATED. Ignored for sandbox.",
      },
    },
    required: ["code", "target"],
  },
};

const EXECUTE_SCRIPT_TIMEOUT_MS = 30_000;

// 带自动清理的超时包装，避免 Promise.race 导致的 unhandled rejection
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("execute_script timed out after 30s")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export type ExecuteScriptDeps = {
  executeInPage: (
    code: string,
    options?: { tabId?: number; world?: "MAIN" | "ISOLATED" }
  ) => Promise<{ result: unknown; tabId: number }>;
  executeInSandbox: (code: string) => Promise<unknown>;
  timeoutMs?: number; // 可选超时（ms），默认 30s，测试用
};

export function createExecuteScriptTool(deps: ExecuteScriptDeps): {
  definition: ToolDefinition;
  executor: ToolExecutor;
} {
  const timeoutMs = deps.timeoutMs ?? EXECUTE_SCRIPT_TIMEOUT_MS;

  const executor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const code = args.code as string | undefined;
      if (!code) {
        throw new Error("code is required");
      }

      const target = args.target as string | undefined;
      if (!target) {
        throw new Error("target is required");
      }
      if (target !== "page" && target !== "sandbox") {
        throw new Error(`Invalid target: ${target}. Must be 'page' or 'sandbox'.`);
      }

      if (target === "page") {
        const tabId = args.tab_id as number | undefined;
        const world = (args.world as "MAIN" | "ISOLATED" | undefined) || undefined;
        const { result, tabId: actualTabId } = await withTimeout(deps.executeInPage(code, { tabId, world }), timeoutMs);
        return JSON.stringify({ result: result ?? null, target: "page", tab_id: actualTabId });
      }

      // sandbox
      const result = await withTimeout(deps.executeInSandbox(code), timeoutMs);
      return JSON.stringify({ result: result ?? null, target: "sandbox" });
    },
  };

  return { definition: EXECUTE_SCRIPT_DEFINITION, executor };
}
