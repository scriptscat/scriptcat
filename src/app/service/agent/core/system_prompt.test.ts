import { describe, expect, it } from "vitest";

import { buildSystemPrompt, buildSubAgentSystemPrompt, _BUILTIN_SYSTEM_PROMPT_FOR_TEST } from "./system_prompt";
import { SUB_AGENT_TYPES } from "./sub_agent_types";

describe("buildSystemPrompt", () => {
  it("无 userSystem、无 skillSuffix 时只返回内置提示词", () => {
    const result = buildSystemPrompt({});
    expect(result).toContain("You are ScriptCat Agent");
    expect(result).toContain("## Core Principles");
    // 末尾不应有多余的空行
    expect(result.endsWith("\n\n")).toBe(false);
  });

  it("输出与导出的 BUILTIN_SYSTEM_PROMPT 一致", () => {
    const result = buildSystemPrompt({});
    // 分段组装后应与合并后的常量一致
    expect(result).toBe(_BUILTIN_SYSTEM_PROMPT_FOR_TEST);
  });

  it("包含所有主要段落标题", () => {
    const result = buildSystemPrompt({});
    expect(result).toContain("## Core Principles");
    expect(result).toContain("## Planning");
    expect(result).toContain("## Tool Usage");
    expect(result).toContain("## Safety");
    expect(result).toContain("## Communication");
    expect(result).toContain("## Tool Selection Guide");
    expect(result).toContain("## Sub-Agent");
    expect(result).toContain("## Task Management");
    expect(result).toContain("## OPFS Workspace");
  });

  it("Planning 段包含研究先于实施原则", () => {
    const result = buildSystemPrompt({});
    expect(result).toContain("Research before action");
  });

  it("Communication 段包含输出效率指导", () => {
    const result = buildSystemPrompt({});
    expect(result).toContain("Lead with action, not reasoning");
  });

  it("Sub-Agent 段包含提示词写作指南和反模式", () => {
    const result = buildSystemPrompt({});
    expect(result).toContain("### Writing Sub-Agent Prompts");
    expect(result).toContain("Never delegate understanding");
    expect(result).toContain("### Anti-Patterns");
    expect(result).toContain("Don't predict sub-agent results");
    expect(result).toContain("Don't duplicate work");
  });

  it("有 userSystem 时拼接在内置提示词之后", () => {
    const result = buildSystemPrompt({ userSystem: "You are a helpful bot." });
    expect(result).toContain("You are ScriptCat Agent");
    expect(result).toContain("You are a helpful bot.");
  });

  it("有 skillSuffix 时拼接在末尾", () => {
    const result = buildSystemPrompt({
      skillSuffix: "\n# Available Skills\n- browser_automation",
    });
    expect(result).toContain("You are ScriptCat Agent");
    expect(result).toContain("# Available Skills");
  });

  it("都有时按顺序拼接：内置 + userSystem + skillSuffix", () => {
    const result = buildSystemPrompt({
      userSystem: "Custom instructions here.",
      skillSuffix: "\n# Skills\n- test_skill",
    });

    const builtinPos = result.indexOf("You are ScriptCat Agent");
    const userPos = result.indexOf("Custom instructions here.");
    const skillPos = result.indexOf("# Skills");

    expect(builtinPos).toBeLessThan(userPos);
    expect(userPos).toBeLessThan(skillPos);
  });

  it("userSystem 为空字符串时不额外追加", () => {
    const result = buildSystemPrompt({ userSystem: "" });
    // 不应出现连续三个换行（即空段落）
    expect(result).not.toContain("\n\n\n");
  });
});

describe("buildSubAgentSystemPrompt", () => {
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
  ];

  it.concurrent("researcher 类型不包含 Sub-Agent 段", () => {
    const config = SUB_AGENT_TYPES.researcher;
    const tools = config.allowedTools || [];
    const result = buildSubAgentSystemPrompt(config, tools);

    expect(result).not.toContain("## Sub-Agent");
  });

  it.concurrent("researcher 类型包含页面读取工具但不包含页面交互工作流", () => {
    const config = SUB_AGENT_TYPES.researcher;
    const tools = config.allowedTools || [];
    const result = buildSubAgentSystemPrompt(config, tools);

    expect(result).toContain("get_tab_content");
    expect(result).toContain("web_fetch");
    expect(result).toContain("web_search");
    // researcher 没有 execute_script，不应包含页面交互工作流段
    expect(result).not.toContain("### Page Interaction Workflow");
  });

  it.concurrent("researcher 类型包含角色说明", () => {
    const config = SUB_AGENT_TYPES.researcher;
    const tools = config.allowedTools || [];
    const result = buildSubAgentSystemPrompt(config, tools);

    expect(result).toContain("## Role: Researcher");
  });

  it.concurrent("page_operator 类型包含 tab 工具描述，不包含 web_search", () => {
    const config = SUB_AGENT_TYPES.page_operator;
    const tools = config.allowedTools || [];
    const result = buildSubAgentSystemPrompt(config, tools);

    expect(result).toContain("get_tab_content");
    expect(result).not.toContain("web_search");
    expect(result).toContain("## Role: Page Operator");
  });

  it.concurrent("general 类型包含所有工具描述", () => {
    const config = SUB_AGENT_TYPES.general;
    const result = buildSubAgentSystemPrompt(config, allTools);

    expect(result).toContain("get_tab_content");
    expect(result).toContain("web_fetch");
    expect(result).toContain("web_search");
  });

  it.concurrent("不包含 ask_user 引用", () => {
    const config = SUB_AGENT_TYPES.general;
    const result = buildSubAgentSystemPrompt(config, allTools);

    expect(result).not.toContain("ask_user");
  });

  it.concurrent("子代理包含结构化输出格式指南", () => {
    const config = SUB_AGENT_TYPES.general;
    const result = buildSubAgentSystemPrompt(config, allTools);

    expect(result).toContain("**Result**");
    expect(result).toContain("**Data**");
    expect(result).toContain("**Issues**");
  });

  it.concurrent("子代理开头为 sub-agent 角色描述", () => {
    const config = SUB_AGENT_TYPES.general;
    const result = buildSubAgentSystemPrompt(config, allTools);

    expect(result).toMatch(/^You are a ScriptCat sub-agent/);
  });

  it.concurrent("无 OPFS 工具时不包含 OPFS 段", () => {
    const config = SUB_AGENT_TYPES.researcher;
    const tools = ["web_fetch", "web_search", "execute_script"];
    const result = buildSubAgentSystemPrompt(config, tools);

    expect(result).not.toContain("## OPFS Workspace");
  });

  it.concurrent("有 OPFS 工具时包含 OPFS 段", () => {
    const config = SUB_AGENT_TYPES.researcher;
    const tools = config.allowedTools || [];
    const result = buildSubAgentSystemPrompt(config, tools);

    expect(result).toContain("## OPFS Workspace");
  });
});
