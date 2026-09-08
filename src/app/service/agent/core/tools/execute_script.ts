import type { ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import { withTimeout } from "@App/pkg/utils/with_timeout";
import { createAbortError, throwIfAborted } from "../abort_utils";
import { requireString } from "./param_utils";

export const EXECUTE_SCRIPT_DEFINITION: ToolDefinition = {
  name: "execute_script",
  description:
    "Execute JavaScript code. " +
    "target='page': run in a browser tab (MAIN world) with full DOM access, shares page's window/globals — can access page JS variables and call page functions. Cannot access extension blob URLs. " +
    "chrome.scripting.executeScript has no cancellation API: on timeout/stop this tool stops WAITING and returns an error, " +
    "but the injected page code keeps running to completion in the tab (it is not actually terminated). " +
    "Avoid long-running or blocking code with target='page'. " +
    "target='sandbox': isolated computation environment, no DOM, and IS genuinely cancelled on timeout/stop. " +
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

function executeSandboxWithTimeout<T>(
  execute: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  if (parentSignal?.aborted) controller.abort();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const cleanup = () => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      parentSignal?.removeEventListener("abort", onParentAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const timeoutError = () => new Error(`execute_script timed out after ${timeoutMs / 1000}s`);
    const onAbort = () => finish(() => reject(timedOut ? timeoutError() : createAbortError()));

    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    if (controller.signal.aborted) {
      onAbort();
      return;
    }

    let execution: Promise<T>;
    try {
      execution = execute(controller.signal);
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    execution.then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error))
    );
  });
}

export type ExecuteScriptDeps = {
  executeInPage: (code: string, options?: { tabId?: number }) => Promise<{ result: unknown; tabId: number }>;
  executeInSandbox: (code: string, signal?: AbortSignal) => Promise<unknown>;
  timeoutMs?: number; // 可选超时（ms），默认 30s，测试用
};

export function createExecuteScriptTool(deps: ExecuteScriptDeps): {
  definition: ToolDefinition;
  executor: ToolExecutor;
} {
  const timeoutMs = deps.timeoutMs ?? EXECUTE_SCRIPT_TIMEOUT_MS;

  const executor: ToolExecutor = {
    execute: async (args: Record<string, unknown>, signal?: AbortSignal) => {
      throwIfAborted(signal);
      const code = requireString(args, "code");

      const target = requireString(args, "target");
      if (target !== "page" && target !== "sandbox") {
        throw new Error(`Invalid target: ${target}. Must be 'page' or 'sandbox'.`);
      }

      if (target === "page") {
        // chrome.scripting.executeScript 无法被真正中止：withTimeout 只能让调用方停止等待，
        // 注入到页面的代码仍会在 tab 内继续跑到自然结束。错误信息必须说明"调用方停止等待"
        // 与"页面脚本已停止"是两回事，避免误导上层以为页面副作用已经终止。
        const tabId = args.tab_id as number | undefined;
        const { result, tabId: actualTabId } = await withTimeout(
          deps.executeInPage(code, { tabId }),
          timeoutMs,
          () =>
            new Error(
              `execute_script (target=page) timed out after ${timeoutMs / 1000}s waiting for a response. ` +
                `The page code cannot be forcibly terminated and may still be running in the tab.`
            ),
          signal
        );
        return JSON.stringify({ result: result ?? null, target: "page", tab_id: actualTabId });
      }

      // sandbox
      const result = await executeSandboxWithTimeout(
        (executionSignal) => deps.executeInSandbox(code, executionSignal),
        signal,
        timeoutMs
      );
      return JSON.stringify({ result: result ?? null, target: "sandbox" });
    },
  };

  return { definition: EXECUTE_SCRIPT_DEFINITION, executor };
}
