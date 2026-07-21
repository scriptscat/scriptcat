import { describe, it, expect } from "vitest";
import { resolveSubAgentType, getExcludeToolsForType, SUB_AGENT_TYPES } from "./sub_agent_types";

describe("Sub-Agent 类型系统", () => {
  describe("内置类型提示词", () => {
    it.concurrent.each(["researcher", "page_operator", "general"])(
      "%s 包含思考风格、认识论纪律与情绪校准",
      (typeName) => {
        const prompt = SUB_AGENT_TYPES[typeName].systemPromptAddition;

        expect(prompt).toContain("**Thinking style:**");
        expect(prompt).toContain("**Epistemic discipline — strictly required:**");
        expect(prompt).toContain("**Emotional calibration:**");
      }
    );
  });

  describe("resolveSubAgentType", () => {
    it.concurrent("返回指定的内置类型", () => {
      expect(resolveSubAgentType("researcher")).toBe(SUB_AGENT_TYPES.researcher);
      expect(resolveSubAgentType("page_operator")).toBe(SUB_AGENT_TYPES.page_operator);
      expect(resolveSubAgentType("general")).toBe(SUB_AGENT_TYPES.general);
      expect(resolveSubAgentType("data_processor")).toBe(SUB_AGENT_TYPES.data_processor);
      expect(resolveSubAgentType("form_filler")).toBe(SUB_AGENT_TYPES.form_filler);
      expect(resolveSubAgentType("content_writer")).toBe(SUB_AGENT_TYPES.content_writer);
      expect(resolveSubAgentType("script_engineer")).toBe(SUB_AGENT_TYPES.script_engineer);
    });

    it.each([
      "summarizer",
      "data_validator",
      "diff_checker",
      "page_extractor",
      "file_converter",
      "action_reviewer",
      "script_auditor",
    ])("返回 %s 辅助类型", (typeName) => {
      expect(resolveSubAgentType(typeName)).toBe(SUB_AGENT_TYPES[typeName]);
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

    it.concurrent.each([
      ["data_processor", ["execute_script", "opfs_read", "opfs_write"], ["web_fetch", "web_search", "get_tab_content"]],
      [
        "form_filler",
        ["get_tab_content", "activate_tab", "read_form_field", "fill_form_field"],
        ["execute_script", "web_fetch", "web_search", "open_tab"],
      ],
      ["content_writer", ["execute_script", "opfs_read", "opfs_write"], ["web_fetch", "get_tab_content", "open_tab"]],
      ["script_engineer", ["execute_script", "opfs_read", "web_fetch"], ["web_search", "get_tab_content", "open_tab"]],
    ])("%s 仅保留职责所需工具", (typeName, includedTools, excludedTools) => {
      const excluded = getExcludeToolsForType(SUB_AGENT_TYPES[typeName as string], allTools);

      for (const tool of includedTools) expect(excluded).not.toContain(tool);
      for (const tool of excludedTools) expect(excluded).toContain(tool);
      expect(excluded).toContain("ask_user");
      expect(excluded).toContain("agent");
    });
  });

  describe("专项类型提示词", () => {
    it.concurrent.each([
      ["data_processor", "## Role: Data Processor", "All input data must be passed"],
      ["form_filler", "## Role: Form Filler", "Never click submit"],
      ["content_writer", "## Role: Content Writer", "Do not introduce facts"],
      ["script_engineer", "## Role: Script Engineer", "cannot install scripts into ScriptCat directly"],
    ])("%s 包含角色边界", (typeName, role, boundary) => {
      const prompt = SUB_AGENT_TYPES[typeName as string].systemPromptAddition;

      expect(prompt).toContain(role);
      expect(prompt).toContain(boundary);
    });
  });

  describe("辅助类型职责边界", () => {
    const availableTools = [
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
    ];
    it.each([
      ["summarizer", "## Role: Summarizer", "do not rewrite"],
      ["data_validator", "## Role: Data Validator", "do not modify"],
      ["diff_checker", "## Role: Diff Checker", "what changed"],
      ["page_extractor", "## Role: Page Extractor", "read-only"],
      ["file_converter", "## Role: File Converter", "schema"],
      ["action_reviewer", "## Role: Action Reviewer", "cannot execute"],
      ["script_auditor", "## Role: Script Auditor", "static analysis"],
    ])("%s 包含独立角色边界", (typeName, role, boundary) => {
      const config = SUB_AGENT_TYPES[typeName];
      expect(config.systemPromptAddition).toContain(role);
      expect(config.systemPromptAddition.toLowerCase()).toContain(boundary.toLowerCase());
    });

    it.each(["summarizer", "data_validator", "diff_checker", "file_converter", "action_reviewer", "script_auditor"])(
      "%s 只能在 sandbox 执行脚本",
      (typeName) => {
        expect(SUB_AGENT_TYPES[typeName].executeScriptTargets).toEqual(["sandbox"]);
      }
    );

    it("page_extractor 不应具有任意脚本或交互能力", () => {
      const tools = SUB_AGENT_TYPES.page_extractor.allowedTools;
      expect(tools).toEqual(expect.arrayContaining(["get_tab_content", "open_tab", "close_tab", "web_fetch"]));
      expect(tools).not.toEqual(expect.arrayContaining(["execute_script", "activate_tab"]));
    });

    it("file_converter 不应具有删除文件权限", () => {
      expect(SUB_AGENT_TYPES.file_converter.allowedTools).not.toContain("opfs_delete");
    });

    it.each([
      ["summarizer", ["execute_script", "opfs_read", "opfs_write"], ["web_fetch", "get_tab_content"]],
      ["data_validator", ["execute_script", "opfs_read"], ["opfs_write", "web_fetch"]],
      ["diff_checker", ["execute_script", "opfs_read", "opfs_write"], ["web_fetch", "get_tab_content"]],
      ["page_extractor", ["web_fetch", "open_tab", "get_tab_content", "close_tab"], ["execute_script", "list_tabs"]],
      ["file_converter", ["execute_script", "opfs_read", "opfs_write"], ["opfs_delete", "web_fetch"]],
      ["action_reviewer", ["execute_script", "opfs_read"], ["opfs_write", "get_tab_content"]],
      ["script_auditor", ["execute_script", "opfs_read"], ["opfs_write", "get_tab_content"]],
    ])("%s 的最终工具集合遵守职责边界", (typeName, included, forbidden) => {
      const excluded = getExcludeToolsForType(SUB_AGENT_TYPES[typeName], availableTools);
      for (const tool of included) expect(excluded).not.toContain(tool);
      for (const tool of forbidden) expect(excluded).toContain(tool);
    });
  });

  describe("专项类型 execute_script 运行环境", () => {
    it.concurrent.each([
      ["data_processor", "sandbox", "page"],
      ["content_writer", "sandbox", "page"],
      ["script_engineer", "sandbox", "page"],
    ])("%s 限制 execute_script 运行环境", (typeName, allowedTarget, deniedTarget) => {
      const config = SUB_AGENT_TYPES[typeName as string];

      expect(config.executeScriptTargets).toContain(allowedTarget);
      expect(config.executeScriptTargets).not.toContain(deniedTarget);
    });

    it("form_filler 不应获得任意脚本执行能力", () => {
      expect(SUB_AGENT_TYPES.form_filler.allowedTools).not.toContain("execute_script");
      expect(SUB_AGENT_TYPES.form_filler.allowedTools).toEqual(
        expect.arrayContaining(["read_form_field", "fill_form_field"])
      );
    });
  });
});
