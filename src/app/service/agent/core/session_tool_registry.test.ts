import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "./tool_registry";
import type { ToolExecutor } from "./tool_registry";
import { SessionToolRegistry } from "./session_tool_registry";
import type { ToolDefinition } from "./types";

function createExecutor(fn: (args: Record<string, unknown>) => Promise<unknown>): ToolExecutor {
  return { execute: fn };
}

const builtinDef: ToolDefinition = {
  name: "web_fetch",
  description: "全局内置工具",
  parameters: { type: "object", properties: {} },
};

const taskDef: ToolDefinition = {
  name: "create_task",
  description: "会话级工具",
  parameters: { type: "object", properties: {} },
};

const askDef: ToolDefinition = {
  name: "ask_user",
  description: "会话级工具",
  parameters: { type: "object", properties: {} },
};

describe("SessionToolRegistry", () => {
  describe("register / listSessionTools / unregister", () => {
    it("注册的工具只存在于 session，不污染 parent", () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "builtin_ok")
      );

      const session = new SessionToolRegistry(parent);
      session.register(
        "session",
        taskDef,
        createExecutor(async () => "session_ok")
      );

      expect(session.listSessionTools()).toEqual(["create_task"]);
      // parent 不受影响
      expect(parent.getDefinitions().map((d) => d.name)).toEqual(["web_fetch"]);
    });

    it("unregister 删除 session 工具但不影响 parent", () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "")
      );

      const session = new SessionToolRegistry(parent);
      session.register(
        "session",
        taskDef,
        createExecutor(async () => "")
      );
      expect(session.unregister("create_task")).toBe(true);
      expect(session.unregister("create_task")).toBe(false);
      // parent 仍然完好
      expect(parent.getDefinitions()).toHaveLength(1);
    });
  });

  describe("getDefinitions 合并视图", () => {
    it("合并 session + parent + extraTools，session 覆盖 parent 同名工具", () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "parent_web_fetch")
      );
      parent.registerBuiltin(
        { name: "shared", description: "parent 版本", parameters: { type: "object", properties: {} } },
        createExecutor(async () => "parent_shared")
      );

      const session = new SessionToolRegistry(parent);
      session.register(
        "session",
        taskDef,
        createExecutor(async () => "")
      );
      // 同名工具：session 覆盖 parent
      session.register(
        "session",
        { name: "shared", description: "session 版本", parameters: { type: "object", properties: {} } },
        createExecutor(async () => "session_shared")
      );

      const defs = session.getDefinitions([
        { name: "script_tool", description: "extra", parameters: { type: "object", properties: {} } },
      ]);

      const names = defs.map((d) => d.name);
      expect(names).toContain("create_task"); // session only
      expect(names).toContain("web_fetch"); // parent only
      expect(names).toContain("shared"); // session 覆盖 parent
      expect(names).toContain("script_tool"); // extra
      // 无重复
      expect(names.length).toBe(new Set(names).size);

      // 同名时取 session 版本
      const shared = defs.find((d) => d.name === "shared")!;
      expect(shared.description).toBe("session 版本");
    });

    it("extraTools 不覆盖 session/parent 同名工具", () => {
      const parent = new ToolRegistry();
      const session = new SessionToolRegistry(parent);
      session.register(
        "session",
        { name: "foo", description: "session", parameters: { type: "object", properties: {} } },
        createExecutor(async () => "")
      );

      const defs = session.getDefinitions([
        { name: "foo", description: "extra 版本", parameters: { type: "object", properties: {} } },
      ]);

      const foo = defs.find((d) => d.name === "foo")!;
      expect(foo.description).toBe("session");
    });

    it("空 session 时返回 parent + extraTools", () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "")
      );
      const session = new SessionToolRegistry(parent);

      const defs = session.getDefinitions();
      expect(defs.map((d) => d.name)).toEqual(["web_fetch"]);
    });
  });

  describe("execute 路由", () => {
    it("优先执行 session 工具（覆盖 parent 同名）", async () => {
      const parent = new ToolRegistry();
      const parentSpy = vi.fn().mockResolvedValue("parent_result");
      parent.registerBuiltin(
        { name: "shared", description: "", parameters: { type: "object", properties: {} } },
        { execute: parentSpy }
      );

      const session = new SessionToolRegistry(parent);
      const sessionSpy = vi.fn().mockResolvedValue("session_result");
      session.register(
        "session",
        { name: "shared", description: "", parameters: { type: "object", properties: {} } },
        { execute: sessionSpy }
      );

      const results = await session.execute([{ id: "t1", name: "shared", arguments: "{}" }]);

      expect(results[0].result).toBe("session_result");
      expect(sessionSpy).toHaveBeenCalled();
      expect(parentSpy).not.toHaveBeenCalled();
    });

    it("session 无该工具时回退到 parent 工具", async () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "parent_ok")
      );

      const session = new SessionToolRegistry(parent);
      session.register(
        "session",
        taskDef,
        createExecutor(async () => "session_ok")
      );

      const results = await session.execute([
        { id: "t1", name: "web_fetch", arguments: "{}" },
        { id: "t2", name: "create_task", arguments: "{}" },
      ]);

      expect(results.find((r) => r.id === "t1")?.result).toBe("parent_ok");
      expect(results.find((r) => r.id === "t2")?.result).toBe("session_ok");
    });

    it("excludeTools 在 session 工具上也生效", async () => {
      const parent = new ToolRegistry();
      const session = new SessionToolRegistry(parent);
      const askSpy = vi.fn().mockResolvedValue("should_not_happen");
      session.register("session", askDef, { execute: askSpy });

      const results = await session.execute(
        [{ id: "t1", name: "ask_user", arguments: "{}" }],
        null,
        new Set(["ask_user"])
      );

      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toContain("not available");
      expect(askSpy).not.toHaveBeenCalled();
    });
  });

  describe("并发隔离（核心安全验证）", () => {
    it("两个 SessionToolRegistry 注册同名工具互不影响", async () => {
      const parent = new ToolRegistry();
      const sessionA = new SessionToolRegistry(parent);
      const sessionB = new SessionToolRegistry(parent);

      // session A 和 session B 都注册 create_task，但闭包不同
      const logA: string[] = [];
      const logB: string[] = [];
      sessionA.register(
        "session",
        taskDef,
        createExecutor(async (args) => {
          logA.push(args.subject as string);
          return "A_" + args.subject;
        })
      );
      sessionB.register(
        "session",
        taskDef,
        createExecutor(async (args) => {
          logB.push(args.subject as string);
          return "B_" + args.subject;
        })
      );

      // session A 调用 create_task("taskA")
      const resA = await sessionA.execute([{ id: "ta", name: "create_task", arguments: '{"subject":"taskA"}' }]);
      // session B 同时调用 create_task("taskB")
      const resB = await sessionB.execute([{ id: "tb", name: "create_task", arguments: '{"subject":"taskB"}' }]);

      expect(resA[0].result).toBe("A_taskA");
      expect(resB[0].result).toBe("B_taskB");
      expect(logA).toEqual(["taskA"]);
      expect(logB).toEqual(["taskB"]);
      // parent 仍然干净
      expect(parent.getDefinitions()).toHaveLength(0);
    });

    it("parent 的永久工具对所有 session 可见", async () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "fetched")
      );

      const sessionA = new SessionToolRegistry(parent);
      const sessionB = new SessionToolRegistry(parent);

      const resA = await sessionA.execute([{ id: "t1", name: "web_fetch", arguments: "{}" }]);
      const resB = await sessionB.execute([{ id: "t2", name: "web_fetch", arguments: "{}" }]);

      expect(resA[0].result).toBe("fetched");
      expect(resB[0].result).toBe("fetched");
    });

    it("session 释放（GC）后 parent 不受影响", () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "")
      );

      // 创建临时 session 并让其超出作用域
      {
        const session = new SessionToolRegistry(parent);
        session.register(
          "session",
          taskDef,
          createExecutor(async () => "")
        );
        expect(session.listSessionTools()).toHaveLength(1);
      }

      // parent 无任何 session 工具痕迹
      expect(parent.getDefinitions().map((d) => d.name)).toEqual(["web_fetch"]);
    });
  });

  describe("脚本工具 miss-then-callback", () => {
    it("session/parent 都没有的工具走 scriptCallback", async () => {
      const parent = new ToolRegistry();
      const session = new SessionToolRegistry(parent);
      const scriptCallback = vi.fn().mockResolvedValue([{ id: "t1", result: "script_ok" }]);

      const results = await session.execute([{ id: "t1", name: "custom_tool", arguments: "{}" }], scriptCallback);

      expect(results[0].result).toBe("script_ok");
      expect(scriptCallback).toHaveBeenCalled();
    });

    it("scriptCallback 为 null 时未知工具返回错误", async () => {
      const parent = new ToolRegistry();
      parent.registerBuiltin(
        builtinDef,
        createExecutor(async () => "")
      );
      const session = new SessionToolRegistry(parent);
      session.register(
        "session",
        taskDef,
        createExecutor(async () => "")
      );

      const results = await session.execute([{ id: "t1", name: "unknown_tool", arguments: "{}" }], null);

      const parsed = JSON.parse(results[0].result);
      expect(parsed.error).toContain("unknown_tool");
      expect(parsed.error).toContain("not found");
      // 错误消息列出 session + parent 的工具名
      expect(parsed.error).toContain("web_fetch");
      expect(parsed.error).toContain("create_task");
    });
  });
});
