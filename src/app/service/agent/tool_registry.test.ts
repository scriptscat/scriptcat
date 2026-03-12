import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "./tool_registry";
import type { ToolExecutor } from "./tool_registry";
import type { ToolCall, ToolDefinition } from "./types";

// 创建一个简单的 mock executor
function createExecutor(fn: (args: Record<string, unknown>) => Promise<unknown>): ToolExecutor {
  return { execute: fn };
}

const weatherDef: ToolDefinition = {
  name: "get_weather",
  description: "获取天气",
  parameters: { type: "object", properties: { city: { type: "string" } } },
};

const calcDef: ToolDefinition = {
  name: "calc",
  description: "计算器",
  parameters: { type: "object", properties: { expr: { type: "string" } } },
};

describe("ToolRegistry", () => {
  describe("registerBuiltin / unregisterBuiltin", () => {
    it("应正确注册和注销内置工具", () => {
      const registry = new ToolRegistry();
      const executor = createExecutor(async () => "ok");
      registry.registerBuiltin(weatherDef, executor);

      expect(registry.getDefinitions()).toHaveLength(1);
      expect(registry.getDefinitions()[0].name).toBe("get_weather");

      const removed = registry.unregisterBuiltin("get_weather");
      expect(removed).toBe(true);
      expect(registry.getDefinitions()).toHaveLength(0);
    });

    it("注销不存在的工具应返回 false", () => {
      const registry = new ToolRegistry();
      expect(registry.unregisterBuiltin("nonexistent")).toBe(false);
    });

    it("重复注册同名工具应覆盖", () => {
      const registry = new ToolRegistry();
      const executor1 = createExecutor(async () => "v1");
      const executor2 = createExecutor(async () => "v2");

      registry.registerBuiltin(weatherDef, executor1);
      registry.registerBuiltin(weatherDef, executor2);

      expect(registry.getDefinitions()).toHaveLength(1);
    });
  });

  describe("getDefinitions", () => {
    it("应合并内置和额外的工具定义", () => {
      const registry = new ToolRegistry();
      registry.registerBuiltin(
        weatherDef,
        createExecutor(async () => "")
      );

      const defs = registry.getDefinitions([calcDef]);
      expect(defs).toHaveLength(2);
      expect(defs.map((d) => d.name)).toEqual(["get_weather", "calc"]);
    });

    it("没有注册工具时返回空数组", () => {
      const registry = new ToolRegistry();
      expect(registry.getDefinitions()).toHaveLength(0);
    });

    it("extraTools 为 undefined 时只返回内置工具", () => {
      const registry = new ToolRegistry();
      registry.registerBuiltin(
        weatherDef,
        createExecutor(async () => "")
      );
      const defs = registry.getDefinitions(undefined);
      expect(defs).toHaveLength(1);
    });
  });

  describe("execute", () => {
    it("应正确执行内置工具", async () => {
      const registry = new ToolRegistry();
      const executor = createExecutor(async (args) => `${args.city}的天气：晴`);
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: '{"city":"北京"}' }]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("tc_1");
      expect(results[0].result).toBe("北京的天气：晴");
    });

    it("内置工具返回非字符串时应 JSON.stringify", async () => {
      const registry = new ToolRegistry();
      const executor = createExecutor(async () => ({ temp: 25, unit: "C" }));
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: '{"city":"上海"}' }]);

      expect(results[0].result).toBe('{"temp":25,"unit":"C"}');
    });

    it("空 arguments 时应传入空对象", async () => {
      const registry = new ToolRegistry();
      const executeSpy = vi.fn().mockResolvedValue("ok");
      registry.registerBuiltin(weatherDef, { execute: executeSpy });

      await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "" }]);

      expect(executeSpy).toHaveBeenCalledWith({});
    });

    it("内置工具抛出异常时应返回错误信息", async () => {
      const registry = new ToolRegistry();
      const executor = createExecutor(async () => {
        throw new Error("API 请求失败");
      });
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: '{"city":"error"}' }]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toBe("API 请求失败");
    });

    it("内置工具抛出无 message 的异常时应返回默认错误", async () => {
      const registry = new ToolRegistry();
      const executor = createExecutor(async () => {
        throw {};
      });
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toBe("Tool execution failed");
    });

    it("未找到的工具应转发给 scriptCallback", async () => {
      const registry = new ToolRegistry();
      const scriptCallback = vi.fn().mockResolvedValue([{ id: "tc_1", result: "script result" }]);

      const results = await registry.execute([{ id: "tc_1", name: "unknown_tool", arguments: "{}" }], scriptCallback);

      expect(scriptCallback).toHaveBeenCalledWith([{ id: "tc_1", name: "unknown_tool", arguments: "{}" }]);
      expect(results[0].result).toBe("script result");
    });

    it("无 scriptCallback 时未找到的工具返回错误", async () => {
      const registry = new ToolRegistry();

      const results = await registry.execute([{ id: "tc_1", name: "unknown_tool", arguments: "{}" }]);

      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toContain("unknown_tool");
      expect(parsed.error).toContain("not found");
    });

    it("scriptCallback 为 null 时未找到的工具返回错误", async () => {
      const registry = new ToolRegistry();

      const results = await registry.execute([{ id: "tc_1", name: "unknown_tool", arguments: "{}" }], null);

      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toContain("not found");
    });

    it("应正确分离内置和脚本工具并分别执行", async () => {
      const registry = new ToolRegistry();
      const builtinExecutor = createExecutor(async () => "builtin_result");
      registry.registerBuiltin(weatherDef, builtinExecutor);

      const scriptCallback = vi.fn().mockResolvedValue([{ id: "tc_2", result: "script_result" }]);

      const toolCalls: ToolCall[] = [
        { id: "tc_1", name: "get_weather", arguments: '{"city":"杭州"}' },
        { id: "tc_2", name: "custom_tool", arguments: '{"key":"val"}' },
      ];

      const results = await registry.execute(toolCalls, scriptCallback);

      expect(results).toHaveLength(2);
      // 内置工具结果
      expect(results.find((r) => r.id === "tc_1")?.result).toBe("builtin_result");
      // 脚本工具结果
      expect(results.find((r) => r.id === "tc_2")?.result).toBe("script_result");
      // scriptCallback 只收到脚本工具
      expect(scriptCallback).toHaveBeenCalledWith([toolCalls[1]]);
    });

    it("空 toolCalls 数组时应返回空结果", async () => {
      const registry = new ToolRegistry();
      const results = await registry.execute([]);
      expect(results).toHaveLength(0);
    });

    it("JSON 解析失败时应返回错误", async () => {
      const registry = new ToolRegistry();
      const executor = createExecutor(async () => "ok");
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "invalid json{" }]);

      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toBeDefined();
    });
  });
});
