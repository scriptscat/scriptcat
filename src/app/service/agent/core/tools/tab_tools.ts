import type { ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import type { MessageSend } from "@Packages/message/types";
import { extractHtmlWithSelectors } from "@App/app/service/offscreen/client";
import { assertDomUrlAllowed } from "@App/app/service/agent/service_worker/dom_policy";

// ---- Tool Definitions ----

const GET_TAB_CONTENT_DEFINITION: ToolDefinition = {
  name: "get_tab_content",
  description:
    "Read page content and extract information via LLM. Returns markdown with CSS selector annotations (as `<!-- selector -->` comments) for key elements. " +
    "Use this BEFORE execute_script to understand page structure and discover correct selectors. " +
    "Provide a prompt describing what to extract — e.g., 'find the title input, content editor, and submit button — return their CSS selectors and current state'. " +
    "Use selector parameter to narrow scope to a specific section.",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "Target tab ID (use list_tabs to find)" },
      prompt: {
        type: "string",
        description:
          "Describe what information to extract/summarize from the page content. Required for efficient context usage.",
      },
      selector: {
        type: "string",
        description: "CSS selector to extract only matching element's content (e.g. '#main', '.article-body')",
      },
      max_length: { type: "number", description: "Max characters to return (default: no limit)" },
    },
    required: ["tab_id", "prompt"],
  },
};

const LIST_TABS_DEFINITION: ToolDefinition = {
  name: "list_tabs",
  description: "List open browser tabs with their IDs, URLs, titles, and status.",
  parameters: {
    type: "object",
    properties: {
      url_pattern: { type: "string", description: "Regex pattern to filter tabs by URL" },
      title_pattern: { type: "string", description: "Regex pattern to filter tabs by title" },
      active: { type: "boolean", description: "Filter by active/inactive state" },
      window_id: { type: "number", description: "Filter by window ID" },
      audible: { type: "boolean", description: "Filter tabs playing audio" },
    },
  },
};

const OPEN_TAB_DEFINITION: ToolDefinition = {
  name: "open_tab",
  description: "Open a new browser tab with the given URL.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to open" },
      active: { type: "boolean", description: "Whether to activate the tab (default: true, false for background)" },
      window_id: { type: "number", description: "Window to open the tab in" },
    },
    required: ["url"],
  },
};

const CLOSE_TAB_DEFINITION: ToolDefinition = {
  name: "close_tab",
  description: "Close a browser tab.",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "Tab ID to close" },
    },
    required: ["tab_id"],
  },
};

const ACTIVATE_TAB_DEFINITION: ToolDefinition = {
  name: "activate_tab",
  description: "Activate (switch to) a browser tab.",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "Tab ID to activate" },
    },
    required: ["tab_id"],
  },
};

const NAVIGATE_TAB_DEFINITION: ToolDefinition = {
  name: "navigate_tab",
  description: "Navigate an existing tab to a new URL. Waits for page load completion by default.",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "Target tab ID" },
      url: { type: "string", description: "URL to navigate to" },
      wait_until_loaded: {
        type: "boolean",
        description: "Wait for page to finish loading (default: true). Set false to return immediately.",
      },
    },
    required: ["tab_id", "url"],
  },
};

// ---- Factory ----

export function createTabTools(deps: {
  sender: MessageSend;
  summarize: (content: string, prompt: string) => Promise<string>;
}): { tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }> } {
  const { sender, summarize } = deps;

  const getTabContentExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const tabId = args.tab_id as number;
      const prompt = args.prompt as string | undefined;
      const selector = args.selector as string | undefined;
      const maxLength = args.max_length as number | undefined;

      if (tabId == null) throw new Error("tab_id is required");

      // 校验目标 tab URL 是否允许操作
      const tabInfo = await chrome.tabs.get(tabId);
      assertDomUrlAllowed(tabInfo.url || "");

      // 注入脚本获取页面 HTML
      const removeTags = ["script", "style", "noscript", "svg", "link[rel=stylesheet]", "iframe"];

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (opts: { selector?: string; removeTags: string[] }) => {
          const root = opts.selector ? document.querySelector(opts.selector) : document.documentElement;
          if (!root) {
            return {
              html: null,
              title: document.title,
              url: location.href,
              error: `Element not found: ${opts.selector}`,
            };
          }
          const clone = root.cloneNode(true) as Element;
          for (const tag of opts.removeTags) {
            clone.querySelectorAll(tag).forEach((el) => el.remove());
          }
          return { html: clone.outerHTML, title: document.title, url: location.href };
        },
        args: [{ selector, removeTags }],
        world: "MAIN" as chrome.scripting.ExecutionWorld,
      });

      if (!results || results.length === 0) {
        throw new Error("Failed to read tab content");
      }

      const pageData = results[0].result as { html: string | null; title: string; url: string; error?: string };

      if (pageData.error || !pageData.html) {
        return JSON.stringify({
          tab_id: tabId,
          url: pageData.url,
          title: pageData.title,
          content: pageData.error || "No content",
          truncated: false,
          used_selector: selector || null,
        });
      }

      // 通过 Offscreen 提取 markdown（带 selector 标注）
      let content: string;
      try {
        const extracted = await extractHtmlWithSelectors(sender, pageData.html);
        content = extracted && extracted.length > 20 ? extracted : pageData.html;
      } catch {
        // 降级：简单去标签
        content = pageData.html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      // 截断
      let truncated = false;
      if (maxLength != null && content.length > maxLength) {
        content = content.slice(0, maxLength);
        truncated = true;
      }

      // LLM 摘要
      if (prompt) {
        content = await summarize(content, prompt);
        truncated = false; // 摘要后不再截断
      }

      return JSON.stringify({
        tab_id: tabId,
        url: pageData.url,
        title: pageData.title,
        content,
        truncated,
        used_selector: selector || null,
      });
    },
  };

  const listTabsExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const urlPattern = args.url_pattern as string | undefined;
      const titlePattern = args.title_pattern as string | undefined;
      const active = args.active as boolean | undefined;
      const windowId = args.window_id as number | undefined;
      const audible = args.audible as boolean | undefined;

      const queryInfo: chrome.tabs.QueryInfo = {};
      if (active != null) queryInfo.active = active;
      if (windowId != null) queryInfo.windowId = windowId;
      if (audible != null) queryInfo.audible = audible;

      let tabs = await chrome.tabs.query(queryInfo);

      // 正则过滤
      if (urlPattern) {
        let re: RegExp;
        try {
          re = new RegExp(urlPattern, "i");
        } catch {
          throw new Error(`Invalid url_pattern regex: "${urlPattern}"`);
        }
        tabs = tabs.filter((t) => re.test(t.url || ""));
      }
      if (titlePattern) {
        let re: RegExp;
        try {
          re = new RegExp(titlePattern, "i");
        } catch {
          throw new Error(`Invalid title_pattern regex: "${titlePattern}"`);
        }
        tabs = tabs.filter((t) => re.test(t.title || ""));
      }

      return JSON.stringify(
        tabs
          .filter((t) => t.id != null)
          .map((t) => ({
            id: t.id,
            url: t.url || "",
            title: t.title || "",
            active: t.active || false,
            windowId: t.windowId,
            index: t.index,
            audible: t.audible || false,
            status: t.status || "unknown",
          }))
      );
    },
  };

  const openTabExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const url = args.url as string;
      const active = (args.active as boolean | undefined) ?? true;
      const windowId = args.window_id as number | undefined;

      if (!url) throw new Error("url is required");

      const createProps: chrome.tabs.CreateProperties = { url, active };
      if (windowId != null) createProps.windowId = windowId;

      const tab = await chrome.tabs.create(createProps);
      return JSON.stringify({
        id: tab.id,
        url: tab.url || tab.pendingUrl || url,
        title: tab.title || "",
        windowId: tab.windowId,
        index: tab.index,
      });
    },
  };

  const closeTabExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const tabId = args.tab_id as number;
      if (tabId == null) throw new Error("tab_id is required");
      await chrome.tabs.remove(tabId);
      return JSON.stringify({ success: true, tab_id: tabId });
    },
  };

  const activateTabExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const tabId = args.tab_id as number;
      if (tabId == null) throw new Error("tab_id is required");
      const tab = await chrome.tabs.update(tabId, { active: true });
      if (!tab) throw new Error(`Tab ${tabId} not found`);
      // 也激活对应窗口
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return JSON.stringify({
        id: tab.id,
        url: tab.url || "",
        title: tab.title || "",
        active: true,
        windowId: tab.windowId,
      });
    },
  };

  const navigateTabExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const tabId = args.tab_id as number;
      const url = args.url as string;
      const waitUntilLoaded = (args.wait_until_loaded as boolean | undefined) ?? true;

      if (tabId == null) throw new Error("tab_id is required");
      if (!url) throw new Error("url is required");

      await chrome.tabs.update(tabId, { url });

      if (waitUntilLoaded) {
        await new Promise<void>((resolve) => {
          let timeoutId: ReturnType<typeof setTimeout>;
          const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timeoutId);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          timeoutId = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 30_000);
        });
      }

      const tab = await chrome.tabs.get(tabId);
      return JSON.stringify({
        id: tab.id,
        url: tab.url || tab.pendingUrl || url,
        title: tab.title || "",
        status: tab.status || "unknown",
      });
    },
  };

  return {
    tools: [
      { definition: GET_TAB_CONTENT_DEFINITION, executor: getTabContentExecutor },
      { definition: LIST_TABS_DEFINITION, executor: listTabsExecutor },
      { definition: OPEN_TAB_DEFINITION, executor: openTabExecutor },
      { definition: CLOSE_TAB_DEFINITION, executor: closeTabExecutor },
      { definition: ACTIVATE_TAB_DEFINITION, executor: activateTabExecutor },
      { definition: NAVIGATE_TAB_DEFINITION, executor: navigateTabExecutor },
    ],
  };
}
