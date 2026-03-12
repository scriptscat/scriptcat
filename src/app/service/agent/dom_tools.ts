// DOM 工具定义和注册，将 AgentDomService 的操作封装为 Agent 内置工具

import type { ToolDefinition } from "./types";
import type { ToolExecutor } from "./tool_registry";
import type { ToolRegistry } from "./tool_registry";
import type { AgentDomService } from "@App/app/service/service_worker/agent_dom";

class DomToolExecutor implements ToolExecutor {
  constructor(private fn: (args: Record<string, unknown>) => Promise<unknown>) {}

  execute(args: Record<string, unknown>): Promise<unknown> {
    return this.fn(args);
  }
}

// 注册所有 DOM 工具到 ToolRegistry
export function registerDomTools(registry: ToolRegistry, domService: AgentDomService): void {
  const tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [
    {
      definition: {
        name: "dom_list_tabs",
        description: "List all open browser tabs with their URLs and titles",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      executor: new DomToolExecutor(() => domService.listTabs()),
    },
    {
      definition: {
        name: "dom_navigate",
        description: "Navigate a tab to a URL. Creates a new tab if no tabId specified.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to navigate to" },
            tabId: { type: "number", description: "Tab ID to navigate. If omitted, creates a new tab" },
            waitUntil: { type: "boolean", description: "Wait for page load to complete (default: true)" },
            timeout: { type: "number", description: "Navigation timeout in ms (default: 30000)" },
          },
          required: ["url"],
        },
      },
      executor: new DomToolExecutor((args) =>
        domService.navigate(args.url as string, {
          tabId: args.tabId as number | undefined,
          waitUntil: args.waitUntil as boolean | undefined,
          timeout: args.timeout as number | undefined,
        })
      ),
    },
    {
      definition: {
        name: "dom_read_page",
        description:
          "Read page content. In 'summary' mode (default), returns page skeleton with sections, interactable elements, forms, and links. In 'detail' mode, returns full text content. Use 'selector' to narrow scope.",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "number", description: "Tab ID to read from. Defaults to active tab" },
            selector: { type: "string", description: "CSS selector to narrow scope to a specific DOM subtree" },
            mode: {
              type: "string",
              enum: ["summary", "detail"],
              description: "Read mode: 'summary' returns page skeleton, 'detail' returns full text (default: summary)",
            },
            maxLength: { type: "number", description: "Max content length in characters (default: 4000)" },
            viewportOnly: {
              type: "boolean",
              description: "Only return elements visible in the viewport (default: false)",
            },
          },
        },
      },
      executor: new DomToolExecutor((args) =>
        domService.readPage({
          tabId: args.tabId as number | undefined,
          selector: args.selector as string | undefined,
          mode: args.mode as "summary" | "detail" | undefined,
          maxLength: args.maxLength as number | undefined,
          viewportOnly: args.viewportOnly as boolean | undefined,
        })
      ),
    },
    {
      definition: {
        name: "dom_screenshot",
        description:
          "Take a screenshot of a tab. Returns a base64 data URL. For background tabs, uses CDP (requires debugger permission).",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "number", description: "Tab ID to screenshot. Defaults to active tab" },
            quality: { type: "number", description: "JPEG quality 0-100 (default: 80)" },
            fullPage: { type: "boolean", description: "Capture full page (default: false)" },
          },
        },
      },
      executor: new DomToolExecutor((args) =>
        domService.screenshot({
          tabId: args.tabId as number | undefined,
          quality: args.quality as number | undefined,
          fullPage: args.fullPage as boolean | undefined,
        })
      ),
    },
    {
      definition: {
        name: "dom_click",
        description:
          "Click an element on the page. Returns action result with navigation/dialog info. Use trusted:true for isTrusted events (requires debugger permission).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the element to click" },
            tabId: { type: "number", description: "Tab ID. Defaults to active tab" },
            trusted: {
              type: "boolean",
              description: "Use CDP for trusted events (isTrusted=true, requires debugger permission)",
            },
          },
          required: ["selector"],
        },
      },
      executor: new DomToolExecutor((args) =>
        domService.click(args.selector as string, {
          tabId: args.tabId as number | undefined,
          trusted: args.trusted as boolean | undefined,
        })
      ),
    },
    {
      definition: {
        name: "dom_fill",
        description:
          "Fill a form field with a value. Clears existing content, sets new value, and triggers input/change events. Use trusted:true for real keyboard events.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the input/textarea element" },
            value: { type: "string", description: "Value to fill in" },
            tabId: { type: "number", description: "Tab ID. Defaults to active tab" },
            trusted: {
              type: "boolean",
              description: "Use CDP for trusted keyboard events (requires debugger permission)",
            },
          },
          required: ["selector", "value"],
        },
      },
      executor: new DomToolExecutor((args) =>
        domService.fill(args.selector as string, args.value as string, {
          tabId: args.tabId as number | undefined,
          trusted: args.trusted as boolean | undefined,
        })
      ),
    },
    {
      definition: {
        name: "dom_scroll",
        description: "Scroll the page or a specific element. Returns scroll position info.",
        parameters: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: ["up", "down", "top", "bottom"],
              description: "Scroll direction",
            },
            tabId: { type: "number", description: "Tab ID. Defaults to active tab" },
            selector: {
              type: "string",
              description: "CSS selector of element to scroll. If omitted, scrolls the page",
            },
          },
          required: ["direction"],
        },
      },
      executor: new DomToolExecutor((args) =>
        domService.scroll(args.direction as "up" | "down" | "top" | "bottom", {
          tabId: args.tabId as number | undefined,
          selector: args.selector as string | undefined,
        })
      ),
    },
    {
      definition: {
        name: "dom_wait_for",
        description: "Wait for an element matching a CSS selector to appear in the DOM. Polls every 500ms.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector to wait for" },
            tabId: { type: "number", description: "Tab ID. Defaults to active tab" },
            timeout: { type: "number", description: "Timeout in ms (default: 10000)" },
          },
          required: ["selector"],
        },
      },
      executor: new DomToolExecutor((args) =>
        domService.waitFor(args.selector as string, {
          tabId: args.tabId as number | undefined,
          timeout: args.timeout as number | undefined,
        })
      ),
    },
  ];

  for (const tool of tools) {
    registry.registerBuiltin(tool.definition, tool.executor);
  }
}
