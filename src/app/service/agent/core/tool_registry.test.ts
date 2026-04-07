import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "./tool_registry";
import type { ToolExecutor } from "./tool_registry";
import type { ToolCall, ToolDefinition, ToolResultWithAttachments } from "./types";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";

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
      expect(parsed.error).toBeDefined();
    });

    it("内置工具抛出字符串时应正确提取错误消息", async () => {
      const registry = new ToolRegistry();
      // 模拟 message 层 throw res.message（直接抛出字符串）
      const executor = createExecutor(async () => {
        throw "连接超时：无法访问 sandbox";
      });
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toBe("连接超时：无法访问 sandbox");
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

    describe("excludeTools 强校验（后端能力隔离）", () => {
      it("命中 excludeTools 的工具应返回 error，不实际执行", async () => {
        const registry = new ToolRegistry();
        const executeSpy = vi.fn().mockResolvedValue("should_not_be_called");
        registry.registerBuiltin(weatherDef, { execute: executeSpy });

        const results = await registry.execute(
          [{ id: "tc_1", name: "get_weather", arguments: '{"city":"北京"}' }],
          null,
          new Set(["get_weather"])
        );

        expect(results).toHaveLength(1);
        const parsed = JSON.parse(results[0].result);
        expect(parsed.error).toContain("get_weather");
        expect(parsed.error).toContain("not available");
        // 关键：executor 不应被调用
        expect(executeSpy).not.toHaveBeenCalled();
      });

      it("未命中 excludeTools 的工具应正常执行", async () => {
        const registry = new ToolRegistry();
        registry.registerBuiltin(
          weatherDef,
          createExecutor(async () => "weather_ok")
        );
        registry.registerBuiltin(
          calcDef,
          createExecutor(async () => "calc_ok")
        );

        const results = await registry.execute(
          [
            { id: "tc_1", name: "get_weather", arguments: "{}" },
            { id: "tc_2", name: "calc", arguments: "{}" },
          ],
          null,
          new Set(["calc"]) // 仅排除 calc
        );

        expect(results).toHaveLength(2);
        const weather = results.find((r) => r.id === "tc_1");
        const calc = results.find((r) => r.id === "tc_2");
        expect(weather?.result).toBe("weather_ok");
        expect(JSON.parse(calc!.result).error).toContain("not available");
      });

      it("LLM 盲调（scriptCallback 场景）中被 excludeTools 的工具也应拦截", async () => {
        const registry = new ToolRegistry();
        const scriptCallback = vi.fn().mockResolvedValue([{ id: "tc_1", result: "should_not_happen" }]);

        // ask_user 不是已注册的内置工具，正常会走 scriptCallback，但被 excludeTools 拦截
        const results = await registry.execute(
          [{ id: "tc_1", name: "ask_user", arguments: "{}" }],
          scriptCallback,
          new Set(["ask_user"])
        );

        expect(results).toHaveLength(1);
        const parsed = JSON.parse(results[0].result);
        expect(parsed.error).toContain("ask_user");
        expect(parsed.error).toContain("not available");
        // scriptCallback 不应被调用
        expect(scriptCallback).not.toHaveBeenCalled();
      });

      it("不传 excludeTools 时所有工具正常执行（向后兼容）", async () => {
        const registry = new ToolRegistry();
        registry.registerBuiltin(
          weatherDef,
          createExecutor(async () => "weather_ok")
        );

        const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

        expect(results[0].result).toBe("weather_ok");
      });

      it("空 excludeTools Set 时所有工具正常执行", async () => {
        const registry = new ToolRegistry();
        registry.registerBuiltin(
          weatherDef,
          createExecutor(async () => "weather_ok")
        );

        const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }], null, new Set());

        expect(results[0].result).toBe("weather_ok");
      });
    });
  });

  describe("附件处理", () => {
    function createMockChatRepo() {
      return {
        saveAttachment: vi.fn().mockResolvedValue(1024),
        getAttachment: vi.fn().mockResolvedValue(null),
        deleteAttachment: vi.fn().mockResolvedValue(undefined),
        deleteAttachments: vi.fn().mockResolvedValue(undefined),
      } as unknown as AgentChatRepo;
    }

    it("内置工具返回 ToolResultWithAttachments 时应提取附件并保存", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      const structuredResult: ToolResultWithAttachments = {
        content: "Screenshot captured.",
        attachments: [
          { type: "image", name: "screenshot.jpg", mimeType: "image/jpeg", data: "data:image/jpeg;base64,/9j/abc" },
        ],
      };
      const executor = createExecutor(async () => structuredResult);
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      // 文本结果只包含 content
      expect(results[0].result).toBe("Screenshot captured.");
      // 附件元数据
      expect(results[0].attachments).toHaveLength(1);
      expect(results[0].attachments![0].type).toBe("image");
      expect(results[0].attachments![0].name).toBe("screenshot.jpg");
      expect(results[0].attachments![0].mimeType).toBe("image/jpeg");
      expect(results[0].attachments![0].size).toBe(1024);
      expect(typeof results[0].attachments![0].id).toBe("string");
      expect(results[0].attachments![0].id.length).toBeGreaterThan(0);
      // 验证 chatRepo.saveAttachment 被调用
      expect(mockRepo.saveAttachment).toHaveBeenCalledTimes(1);
      expect(mockRepo.saveAttachment).toHaveBeenCalledWith(expect.any(String), "data:image/jpeg;base64,/9j/abc");
    });

    it("内置工具返回 ToolResultWithAttachments 含多个附件时应全部保存", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      const structuredResult: ToolResultWithAttachments = {
        content: "Files generated.",
        attachments: [
          { type: "image", name: "img1.png", mimeType: "image/png", data: "data:image/png;base64,abc" },
          {
            type: "file",
            name: "report.xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            data: "base64data",
          },
        ],
      };
      const executor = createExecutor(async () => structuredResult);
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      expect(results[0].attachments).toHaveLength(2);
      expect(results[0].attachments![0].name).toBe("img1.png");
      expect(results[0].attachments![1].name).toBe("report.xlsx");
      expect(mockRepo.saveAttachment).toHaveBeenCalledTimes(2);
    });

    it("内置工具返回 Blob 附件时应正确保存", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      const blob = new Blob(["hello"], { type: "text/plain" });
      const structuredResult: ToolResultWithAttachments = {
        content: "File created.",
        attachments: [{ type: "file", name: "data.txt", mimeType: "text/plain", data: blob as unknown as string }],
      };
      const executor = createExecutor(async () => structuredResult);
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      expect(results[0].attachments).toHaveLength(1);
      expect(mockRepo.saveAttachment).toHaveBeenCalledWith(expect.any(String), blob);
    });

    it("内置工具返回普通值时不应产生附件", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      const executor = createExecutor(async () => "plain result");
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      expect(results[0].result).toBe("plain result");
      expect(results[0].attachments).toBeUndefined();
      expect(mockRepo.saveAttachment).not.toHaveBeenCalled();
    });

    it("内置工具返回对象（非附件格式）时不应产生附件", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      // 有 content 但没有 attachments 数组
      const executor = createExecutor(async () => ({ content: "hello", other: 42 }));
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      expect(results[0].result).toBe('{"content":"hello","other":42}');
      expect(results[0].attachments).toBeUndefined();
    });

    it("无 chatRepo 时应返回空附件列表", async () => {
      const registry = new ToolRegistry();
      // 不调用 setChatRepo

      const structuredResult: ToolResultWithAttachments = {
        content: "Screenshot captured.",
        attachments: [
          { type: "image", name: "screenshot.jpg", mimeType: "image/jpeg", data: "data:image/jpeg;base64,abc" },
        ],
      };
      const executor = createExecutor(async () => structuredResult);
      registry.registerBuiltin(weatherDef, executor);

      const results = await registry.execute([{ id: "tc_1", name: "get_weather", arguments: "{}" }]);

      expect(results[0].result).toBe("Screenshot captured.");
      // 无 chatRepo 时附件为空数组
      expect(results[0].attachments).toEqual([]);
    });

    it("脚本工具返回结构化附件结果时应提取附件", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      const structuredResult: ToolResultWithAttachments = {
        content: "Skill script generated file.",
        attachments: [{ type: "file", name: "output.zip", mimeType: "application/zip", data: "base64zipdata" }],
      };

      const scriptCallback = vi.fn().mockResolvedValue([{ id: "tc_1", result: JSON.stringify(structuredResult) }]);

      const results = await registry.execute([{ id: "tc_1", name: "script_tool", arguments: "{}" }], scriptCallback);

      expect(results[0].result).toBe("Skill script generated file.");
      expect(results[0].attachments).toHaveLength(1);
      expect(results[0].attachments![0].name).toBe("output.zip");
      expect(mockRepo.saveAttachment).toHaveBeenCalledTimes(1);
    });

    it("脚本工具返回普通 JSON 时不应产生附件", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      const scriptCallback = vi.fn().mockResolvedValue([{ id: "tc_1", result: JSON.stringify({ data: "hello" }) }]);

      const results = await registry.execute([{ id: "tc_1", name: "script_tool", arguments: "{}" }], scriptCallback);

      expect(results[0].result).toBe('{"data":"hello"}');
      expect(results[0].attachments).toBeUndefined();
    });

    it("脚本工具返回非 JSON 字符串时不应产生附件", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      const scriptCallback = vi.fn().mockResolvedValue([{ id: "tc_1", result: "plain text result" }]);

      const results = await registry.execute([{ id: "tc_1", name: "script_tool", arguments: "{}" }], scriptCallback);

      expect(results[0].result).toBe("plain text result");
      expect(results[0].attachments).toBeUndefined();
    });

    it("isToolResultWithAttachments 边界值判断", async () => {
      const registry = new ToolRegistry();
      const mockRepo = createMockChatRepo();
      registry.setChatRepo(mockRepo);

      // null
      const exec1 = createExecutor(async () => null);
      registry.registerBuiltin(weatherDef, exec1);
      const r1 = await registry.execute([{ id: "t1", name: "get_weather", arguments: "{}" }]);
      expect(r1[0].result).toBe("null");
      expect(r1[0].attachments).toBeUndefined();

      // content 是数字而不是字符串
      const exec2 = createExecutor(async () => ({ content: 123, attachments: [] }));
      registry.registerBuiltin(weatherDef, exec2);
      const r2 = await registry.execute([{ id: "t2", name: "get_weather", arguments: "{}" }]);
      expect(r2[0].attachments).toBeUndefined();

      // attachments 不是数组
      const exec3 = createExecutor(async () => ({ content: "ok", attachments: "not-array" }));
      registry.registerBuiltin(weatherDef, exec3);
      const r3 = await registry.execute([{ id: "t3", name: "get_weather", arguments: "{}" }]);
      expect(r3[0].attachments).toBeUndefined();
    });
  });

  describe("来源追踪 API（register / getSource / listBySource / unregisterBySource）", () => {
    it("register 注册工具后 getSource 应返回正确来源", () => {
      const registry = new ToolRegistry();
      registry.register(
        "mcp",
        weatherDef,
        createExecutor(async () => "ok")
      );
      expect(registry.getSource("get_weather")).toBe("mcp");
    });

    it("registerBuiltin 注册的工具来源应为 builtin", () => {
      const registry = new ToolRegistry();
      registry.registerBuiltin(
        weatherDef,
        createExecutor(async () => "ok")
      );
      expect(registry.getSource("get_weather")).toBe("builtin");
    });

    it("getSource 查询不存在的工具应返回 undefined", () => {
      const registry = new ToolRegistry();
      expect(registry.getSource("nonexistent")).toBeUndefined();
    });

    it("listBySource 应只返回指定来源的工具名", () => {
      const registry = new ToolRegistry();
      registry.register(
        "builtin",
        weatherDef,
        createExecutor(async () => "")
      );
      registry.register(
        "mcp",
        calcDef,
        createExecutor(async () => "")
      );
      registry.register(
        "skill",
        { name: "load_skill", description: "加载 skill", parameters: { type: "object", properties: {} } },
        createExecutor(async () => "")
      );

      expect(registry.listBySource("builtin")).toEqual(["get_weather"]);
      expect(registry.listBySource("mcp")).toEqual(["calc"]);
      expect(registry.listBySource("skill")).toEqual(["load_skill"]);
      expect(registry.listBySource("script")).toEqual([]);
    });

    it("unregisterBySource 应批量删除指定来源的工具并返回名称列表", () => {
      const registry = new ToolRegistry();
      registry.register(
        "mcp",
        weatherDef,
        createExecutor(async () => "")
      );
      registry.register(
        "mcp",
        calcDef,
        createExecutor(async () => "")
      );
      registry.register(
        "builtin",
        { name: "web_fetch", description: "抓取", parameters: { type: "object", properties: {} } },
        createExecutor(async () => "")
      );

      const removed = registry.unregisterBySource("mcp");
      expect(removed).toHaveLength(2);
      expect(removed).toContain("get_weather");
      expect(removed).toContain("calc");
      // builtin 工具应保留
      expect(registry.getDefinitions()).toHaveLength(1);
      expect(registry.getDefinitions()[0].name).toBe("web_fetch");
    });

    it("unregisterBySource 无匹配工具时应返回空数组", () => {
      const registry = new ToolRegistry();
      registry.register(
        "builtin",
        weatherDef,
        createExecutor(async () => "")
      );
      expect(registry.unregisterBySource("mcp")).toEqual([]);
    });

    it("unregister 应按名称删除工具", () => {
      const registry = new ToolRegistry();
      registry.register(
        "mcp",
        weatherDef,
        createExecutor(async () => "")
      );
      expect(registry.unregister("get_weather")).toBe(true);
      expect(registry.getDefinitions()).toHaveLength(0);
    });

    it("unregister 删除不存在的工具应返回 false", () => {
      const registry = new ToolRegistry();
      expect(registry.unregister("nonexistent")).toBe(false);
    });
  });

  describe("withScopedTools", () => {
    it("fn 正常执行后应清理所有 scoped 工具", async () => {
      const registry = new ToolRegistry();
      registry.register(
        "builtin",
        weatherDef,
        createExecutor(async () => "")
      );

      await registry.withScopedTools(
        "skill",
        [{ definition: calcDef, executor: createExecutor(async () => "42") }],
        async () => {
          // fn 执行期间 scoped 工具应存在
          expect(registry.getSource("calc")).toBe("skill");
          expect(registry.getDefinitions()).toHaveLength(2);
        }
      );

      // fn 结束后 scoped 工具应被清理
      expect(registry.getSource("calc")).toBeUndefined();
      expect(registry.getDefinitions()).toHaveLength(1);
    });

    it("fn 抛出异常时也应清理 scoped 工具（finally 保证）", async () => {
      const registry = new ToolRegistry();

      await expect(
        registry.withScopedTools(
          "skill",
          [{ definition: calcDef, executor: createExecutor(async () => "42") }],
          async () => {
            throw new Error("测试异常");
          }
        )
      ).rejects.toThrow("测试异常");

      // 即使抛出，scoped 工具也应被清理
      expect(registry.getSource("calc")).toBeUndefined();
    });

    it("withScopedTools 应返回 fn 的返回值", async () => {
      const registry = new ToolRegistry();

      const result = await registry.withScopedTools(
        "skill",
        [{ definition: calcDef, executor: createExecutor(async () => "") }],
        async () => "scoped_result"
      );

      expect(result).toBe("scoped_result");
    });

    it("多个 scoped 工具应全部被清理", async () => {
      const registry = new ToolRegistry();
      const toolA: ToolDefinition = {
        name: "tool_a",
        description: "A",
        parameters: { type: "object", properties: {} },
      };
      const toolB: ToolDefinition = {
        name: "tool_b",
        description: "B",
        parameters: { type: "object", properties: {} },
      };

      await registry.withScopedTools(
        "skill",
        [
          { definition: toolA, executor: createExecutor(async () => "") },
          { definition: toolB, executor: createExecutor(async () => "") },
        ],
        async () => {
          expect(registry.listBySource("skill")).toHaveLength(2);
        }
      );

      expect(registry.listBySource("skill")).toHaveLength(0);
    });
  });
});
