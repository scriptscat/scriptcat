// 子代理类型定义和注册表

export interface SubAgentTypeConfig {
  name: string;
  description: string; // 英文，写入 agent tool 描述供 LLM 选择
  allowedTools?: string[]; // 白名单模式（优先于 excludeTools）
  excludeTools?: string[]; // 黑名单模式
  maxIterations: number;
  timeoutMs: number;
  systemPromptAddition: string; // 注入 sub-agent system prompt 的角色说明
}

// 所有子代理类型都默认可用的工具（task 工具用于与主 agent 共享任务进度）
const ALWAYS_ALLOWED_TOOLS = ["create_task", "update_task", "list_tasks"];

// 内置子代理类型
export const SUB_AGENT_TYPES: Record<string, SubAgentTypeConfig> = {
  researcher: {
    name: "researcher",
    description: "Web search/fetch, page reading (read-only, no DOM interaction)",
    allowedTools: [
      "web_fetch",
      "web_search",
      "get_tab_content",
      "open_tab",
      "list_tabs",
      "close_tab",
      "opfs_read",
      "opfs_write",
      "opfs_list",
      "opfs_delete",
    ],
    maxIterations: 20,
    timeoutMs: 600_000,
    systemPromptAddition: `## Role: Researcher

You are a research-focused sub-agent. Your job is to search, fetch, read, and summarize information.

**Capabilities:** Web search, URL fetching, page reading (open tabs and read rendered content with get_tab_content), OPFS file storage.
**Limitations:** You cannot interact with page DOM (no clicking, form filling, or script execution). You cannot ask the user questions.

**Guidelines:**
- Use web_search to find relevant sources, then web_fetch or get_tab_content to read them.
- For JavaScript-rendered pages (SPAs), prefer get_tab_content over web_fetch — it reads the rendered DOM.
- Synthesize information from multiple sources when possible.
- Close tabs you no longer need to avoid clutter.
- Return structured, concise results that the parent agent can act on.
- If you cannot find the information, say so clearly rather than guessing.`,
  },

  page_operator: {
    name: "page_operator",
    description: "Browser tab interaction, page automation",
    allowedTools: [
      "get_tab_content",
      "list_tabs",
      "open_tab",
      "close_tab",
      "activate_tab",
      "execute_script",
      "web_fetch",
      "opfs_read",
      "opfs_write",
      "opfs_list",
      "opfs_delete",
    ],
    maxIterations: 30,
    timeoutMs: 600_000,
    systemPromptAddition: `## Role: Page Operator

You are a page interaction sub-agent. Your job is to navigate web pages, interact with elements, and extract data.

**Capabilities:** Tab navigation, page reading, DOM interaction via execute_script, URL fetching.
**Limitations:** You cannot search the web (use a researcher sub-agent for that). You cannot ask the user questions.

**Guidelines:**
- Always read the page content (get_tab_content) before interacting to understand the current state.
- Verify page state after each interaction — never assume an action succeeded.
- For form filling, check that inputs exist and are visible before attempting to fill them.
- Return extracted data in a structured format.`,
  },

  general: {
    name: "general",
    description: "All tools, general-purpose",
    excludeTools: ["ask_user", "agent"],
    maxIterations: 30,
    timeoutMs: 600_000,
    systemPromptAddition: `## Role: General Sub-Agent

You are a general-purpose sub-agent with access to all tools except user interaction and nested sub-agents.

**Limitations:** You cannot ask the user questions and cannot spawn nested sub-agents. If you encounter a situation that requires user input, describe the situation clearly in your response so the parent agent can handle it.`,
  },
};

/**
 * 解析子代理类型名称为配置
 * - 未传 typeName：返回 general（默认）
 * - 传入未知 typeName：抛错，不静默降级（否则攻击者可传 "xxx" 获得更宽权限）
 */
export function resolveSubAgentType(typeName?: string): SubAgentTypeConfig {
  if (!typeName) return SUB_AGENT_TYPES.general;
  const config = SUB_AGENT_TYPES[typeName];
  if (!config) {
    throw new Error(
      `Unknown sub-agent type: "${typeName}". Available types: ${Object.keys(SUB_AGENT_TYPES).join(", ")}`
    );
  }
  return config;
}

/**
 * 根据类型配置和所有可用工具名，计算最终的排除工具列表
 * - 白名单模式：排除不在 allowedTools 中的工具
 * - 黑名单模式：直接使用 excludeTools
 * - 两者都未指定：返回空数组（不排除任何工具）
 */
export function getExcludeToolsForType(config: SubAgentTypeConfig, allToolNames: string[]): string[] {
  if (config.allowedTools && config.allowedTools.length > 0) {
    // 白名单模式：合并 allowedTools + ALWAYS_ALLOWED_TOOLS
    const allowedSet = new Set([...config.allowedTools, ...ALWAYS_ALLOWED_TOOLS]);
    return allToolNames.filter((name) => !allowedSet.has(name));
  }
  if (config.excludeTools && config.excludeTools.length > 0) {
    return [...config.excludeTools];
  }
  return [];
}
