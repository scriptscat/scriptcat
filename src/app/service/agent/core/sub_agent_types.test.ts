import { describe, it, expect } from "vitest";
import { resolveSubAgentType, getExcludeToolsForType, SUB_AGENT_TYPES } from "./sub_agent_types";

describe("Sub-Agent 类型系统", () => {
  describe("resolveSubAgentType", () => {
    it.concurrent("返回指定的内置类型", () => {
      expect(resolveSubAgentType("researcher")).toBe(SUB_AGENT_TYPES.researcher);
      expect(resolveSubAgentType("page_operator")).toBe(SUB_AGENT_TYPES.page_operator);
      expect(resolveSubAgentType("general")).toBe(SUB_AGENT_TYPES.general);
    });

    it.concurrent("未知类型抛错（防止攻击者传 xxx 获得更宽权限）", () => {
      expect(() => resolveSubAgentType("unknown_type")).toThrow(/Unknown sub-agent type/);
      expect(() => resolveSubAgentType("unknown_type")).toThrow(/Available types/);
      // 空字符串也视为未知类型（!"" 为 true 会短路，但这里显式用 "" 测试分支）
      // 注意：空字符串被 !typeName 判断为 falsy，会返回 general；此处为 "" 不会抛
      expect(resolveSubAgentType("")).toBe(SUB_AGENT_TYPES.general);
    });

    it.concurrent("undefined/不传参数返回 general", () => {
      expect(resolveSubAgentType()).toBe(SUB_AGENT_TYPES.general);
      expect(resolveSubAgentType(undefined)).toBe(SUB_AGENT_TYPES.general);
    });
  });

  describe("getExcludeToolsForType", () => {
    const allTools = [
      "web_fetch",
      "web_search",
      "opfs_read",
      "opfs_write",
      "opfs_list",
      "opfs_delete",
      "execute_script",
      "get_tab_content",
      "list_tabs",
      "open_tab",
      "close_tab",
      "activate_tab",
      "ask_user",
      "agent",
      "create_task",
      "update_task",
      "list_tasks",
    ];

    it.concurrent("researcher 类型排除 DOM 交互工具和其他不在白名单中的工具", () => {
      const config = SUB_AGENT_TYPES.researcher;
      const excluded = getExcludeToolsForType(config, allTools);

      // researcher 不包含 DOM 交互工具（execute_script、activate_tab）、ask_user、agent
      expect(excluded).toContain("activate_tab");
      expect(excluded).toContain("execute_script");
      expect(excluded).toContain("ask_user");
      expect(excluded).toContain("agent");

      // researcher 可以读取页面（get_tab_content + tab 管理）
      expect(excluded).not.toContain("get_tab_content");
      expect(excluded).not.toContain("open_tab");
      expect(excluded).not.toContain("list_tabs");
      expect(excluded).not.toContain("close_tab");

      // task 工具始终可用（ALWAYS_ALLOWED_TOOLS）
      expect(excluded).not.toContain("create_task");
      expect(excluded).not.toContain("update_task");
      expect(excluded).not.toContain("list_tasks");

      // 应该保留的工具不在排除列表中
      expect(excluded).not.toContain("web_fetch");
      expect(excluded).not.toContain("web_search");
      expect(excluded).not.toContain("opfs_read");
    });

    it.concurrent("page_operator 类型排除 web_search 和其他不在白名单中的工具", () => {
      const config = SUB_AGENT_TYPES.page_operator;
      const excluded = getExcludeToolsForType(config, allTools);

      // page_operator 不包含 web_search、ask_user、agent
      expect(excluded).toContain("web_search");
      expect(excluded).toContain("ask_user");
      expect(excluded).toContain("agent");

      // 应该保留 tab 工具
      expect(excluded).not.toContain("get_tab_content");
      expect(excluded).not.toContain("list_tabs");
      expect(excluded).not.toContain("open_tab");
      expect(excluded).not.toContain("execute_script");
      expect(excluded).not.toContain("web_fetch");

      // task 工具始终可用
      expect(excluded).not.toContain("create_task");
      expect(excluded).not.toContain("update_task");
    });

    it.concurrent("general 类型使用黑名单模式，只排除 ask_user 和 agent", () => {
      const config = SUB_AGENT_TYPES.general;
      const excluded = getExcludeToolsForType(config, allTools);

      expect(excluded).toEqual(["ask_user", "agent"]);
    });

    it.concurrent("allowedTools 和 excludeTools 都未指定时返回空数组", () => {
      const config: any = { name: "empty", maxIterations: 10, timeoutMs: 60000, systemPromptAddition: "" };
      const excluded = getExcludeToolsForType(config, allTools);
      expect(excluded).toEqual([]);
    });

    it.concurrent("allowedTools 优先于 excludeTools", () => {
      const config: any = {
        name: "test",
        allowedTools: ["web_fetch"],
        excludeTools: ["web_search"],
        maxIterations: 10,
        timeoutMs: 60000,
        systemPromptAddition: "",
      };
      const excluded = getExcludeToolsForType(config, ["web_fetch", "web_search", "execute_script"]);

      // 使用白名单模式，排除不在 allowedTools 中的
      expect(excluded).toContain("web_search");
      expect(excluded).toContain("execute_script");
      expect(excluded).not.toContain("web_fetch");
    });
  });
});
