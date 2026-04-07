import { describe, it, expect, vi } from "vitest";
import { createExecuteScriptTool, type ExecuteScriptDeps } from "./execute_script";

function makeDeps(overrides?: Partial<ExecuteScriptDeps>): ExecuteScriptDeps {
  return {
    executeInPage: vi.fn().mockResolvedValue({ result: "page_result", tabId: 1 }),
    executeInSandbox: vi.fn().mockResolvedValue("sandbox_result"),
    ...overrides,
  };
}

describe("execute_script 工具", () => {
  describe("参数校验", () => {
    it.concurrent("缺少 code 应抛错", async () => {
      const deps = makeDeps();
      const { executor } = createExecuteScriptTool(deps);
      await expect(executor.execute({ target: "page" })).rejects.toThrow('缺少必填参数 "code"');
    });

    it.concurrent("缺少 target 应抛错", async () => {
      const deps = makeDeps();
      const { executor } = createExecuteScriptTool(deps);
      await expect(executor.execute({ code: "return 1" })).rejects.toThrow('缺少必填参数 "target"');
    });

    it.concurrent("无效 target 应抛错", async () => {
      const deps = makeDeps();
      const { executor } = createExecuteScriptTool(deps);
      await expect(executor.execute({ code: "return 1", target: "invalid" })).rejects.toThrow(
        "Invalid target: invalid"
      );
    });
  });

  describe("page 模式", () => {
    it.concurrent("应调用 executeInPage 并返回结果", async () => {
      const mockExecuteInPage = vi.fn().mockResolvedValue({ result: { count: 5 }, tabId: 42 });
      const deps = makeDeps({ executeInPage: mockExecuteInPage });
      const { executor } = createExecuteScriptTool(deps);

      const result = await executor.execute({ code: "return document.title", target: "page" });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({ result: { count: 5 }, target: "page", tab_id: 42 });
      expect(mockExecuteInPage).toHaveBeenCalledWith("return document.title", {
        tabId: undefined,
      });
    });

    it.concurrent("应传递 tab_id 参数", async () => {
      const mockExecuteInPage = vi.fn().mockResolvedValue({ result: null, tabId: 10 });
      const deps = makeDeps({ executeInPage: mockExecuteInPage });
      const { executor } = createExecuteScriptTool(deps);

      await executor.execute({ code: "return 1", target: "page", tab_id: 10 });

      expect(mockExecuteInPage).toHaveBeenCalledWith("return 1", { tabId: 10 });
    });

    it.concurrent("返回值为 undefined 时应转为 null", async () => {
      const mockExecuteInPage = vi.fn().mockResolvedValue({ result: undefined, tabId: 1 });
      const deps = makeDeps({ executeInPage: mockExecuteInPage });
      const { executor } = createExecuteScriptTool(deps);

      const result = await executor.execute({ code: "void 0", target: "page" });
      const parsed = JSON.parse(result as string);

      expect(parsed.result).toBe(null);
    });
  });

  describe("sandbox 模式", () => {
    it.concurrent("应调用 executeInSandbox 并返回结果", async () => {
      const mockExecuteInSandbox = vi.fn().mockResolvedValue({ sum: 42 });
      const deps = makeDeps({ executeInSandbox: mockExecuteInSandbox });
      const { executor } = createExecuteScriptTool(deps);

      const result = await executor.execute({ code: "return 1+2", target: "sandbox" });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({ result: { sum: 42 }, target: "sandbox" });
      expect(parsed).not.toHaveProperty("tab_id");
      expect(mockExecuteInSandbox).toHaveBeenCalledWith("return 1+2");
    });

    it.concurrent("返回值为 undefined 时应转为 null", async () => {
      const mockExecuteInSandbox = vi.fn().mockResolvedValue(undefined);
      const deps = makeDeps({ executeInSandbox: mockExecuteInSandbox });
      const { executor } = createExecuteScriptTool(deps);

      const result = await executor.execute({ code: "void 0", target: "sandbox" });
      const parsed = JSON.parse(result as string);

      expect(parsed.result).toBe(null);
    });
  });

  describe("超时", () => {
    it.concurrent("page 模式超时应报错", async () => {
      const mockExecuteInPage = vi.fn().mockReturnValue(new Promise(() => {}));
      const deps = makeDeps({ executeInPage: mockExecuteInPage, timeoutMs: 50 });
      const { executor } = createExecuteScriptTool(deps);

      await expect(executor.execute({ code: "while(true){}", target: "page" })).rejects.toThrow(
        "execute_script timed out after 0.05s"
      );
    });

    it.concurrent("sandbox 模式超时应报错", async () => {
      const mockExecuteInSandbox = vi.fn().mockReturnValue(new Promise(() => {}));
      const deps = makeDeps({ executeInSandbox: mockExecuteInSandbox, timeoutMs: 50 });
      const { executor } = createExecuteScriptTool(deps);

      await expect(executor.execute({ code: "while(true){}", target: "sandbox" })).rejects.toThrow(
        "execute_script timed out after 0.05s"
      );
    });
  });

  describe("错误传播", () => {
    it.concurrent("page 模式执行错误应传播", async () => {
      const mockExecuteInPage = vi.fn().mockRejectedValue(new Error("No active tab found"));
      const deps = makeDeps({ executeInPage: mockExecuteInPage });
      const { executor } = createExecuteScriptTool(deps);

      await expect(executor.execute({ code: "return 1", target: "page" })).rejects.toThrow("No active tab found");
    });

    it.concurrent("sandbox 模式执行错误应传播", async () => {
      const mockExecuteInSandbox = vi.fn().mockRejectedValue(new Error("Sandbox execution failed"));
      const deps = makeDeps({ executeInSandbox: mockExecuteInSandbox });
      const { executor } = createExecuteScriptTool(deps);

      await expect(executor.execute({ code: "throw new Error()", target: "sandbox" })).rejects.toThrow(
        "Sandbox execution failed"
      );
    });
  });
});
