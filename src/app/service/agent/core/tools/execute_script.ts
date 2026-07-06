import type { ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import { withTimeout } from "@App/pkg/utils/with_timeout";
import { requireString } from "./param_utils";

export const EXECUTE_SCRIPT_DEFINITION: ToolDefinition = {
  name: "execute_script",
  description:
    "Execute JavaScript code. " +
    "target='page': run in a browser tab (MAIN world) with full DOM access, shares page's window/globals — can access page JS variables and call page functions. Cannot access extension blob URLs. " +
    "target='sandbox': isolated computation environment, no DOM. " +
    "Use `return` to return a value. Timeout: 30 seconds.",
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
    },
    required: ["code", "target"],
  },
};

const EXECUTE_SCRIPT_TIMEOUT_MS = 30_000;

// 返回值过大时（如 DOM dump、模块映射）截断，避免其在后续每轮 tool loop 中被完整重复计费
const MAX_RESULT_CHARS = 30_000;
const HEAD_CHARS = 15_000;
const TAIL_CHARS = 15_000;

/** 将 result 序列化，超过阈值时截断为首尾各一部分并标注 truncated */
function buildResultPayload(result: unknown, extra: Record<string, unknown>): string {
  const rawResult = result ?? null;
  const resultStr = JSON.stringify(rawResult);
  if (resultStr.length <= MAX_RESULT_CHARS) {
    return JSON.stringify({ result: rawResult, ...extra });
  }
  const omitted = resultStr.length - HEAD_CHARS - TAIL_CHARS;
  const truncatedText =
    resultStr.slice(0, HEAD_CHARS) +
    `\n…[truncated ${omitted} chars — return a smaller value or write large data to OPFS via opfs_write]…\n` +
    resultStr.slice(resultStr.length - TAIL_CHARS);
  return JSON.stringify({ result: truncatedText, ...extra, truncated: true, original_length: resultStr.length });
}

export type ExecuteScriptDeps = {
  executeInPage: (code: string, options?: { tabId?: number }) => Promise<{ result: unknown; tabId: number }>;
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
      const code = requireString(args, "code");

      const target = requireString(args, "target");
      if (target !== "page" && target !== "sandbox") {
        throw new Error(`Invalid target: ${target}. Must be 'page' or 'sandbox'.`);
      }

      if (target === "page") {
        const tabId = args.tab_id as number | undefined;
        const { result, tabId: actualTabId } = await withTimeout(
          deps.executeInPage(code, { tabId }),
          timeoutMs,
          () => new Error(`execute_script timed out after ${timeoutMs / 1000}s`)
        );
        return buildResultPayload(result, { target: "page", tab_id: actualTabId });
      }

      // sandbox
      const result = await withTimeout(
        deps.executeInSandbox(code),
        timeoutMs,
        () => new Error(`execute_script timed out after ${timeoutMs / 1000}s`)
      );
      return buildResultPayload(result, { target: "sandbox" });
    },
  };

  return { definition: EXECUTE_SCRIPT_DEFINITION, executor };
}
