import type { ToolDefinition } from "../types";
import type { ToolEntry, ToolExecutor } from "../tool_registry";
import { requireNumber, requireString } from "./param_utils";

interface ScopedTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

export function createPageExtractorTabTools(entries: { openTab: ToolEntry; readTab: ToolEntry; closeTab: ToolEntry }): {
  tools: ScopedTool[];
  cleanup: () => Promise<void>;
} {
  const ownedTabIds = new Set<number>();

  const openDefinition: ToolDefinition = {
    name: "open_tab",
    description: "Open a new inactive tab owned by this page extractor. Existing tabs cannot be navigated.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "URL to open in a new inactive tab." } },
      required: ["url"],
    },
  };
  const openExecutor: ToolExecutor = {
    execute: async (args) => {
      const url = requireString(args, "url");
      const rawResult = await entries.openTab.executor.execute({ url, active: false });
      const result = JSON.parse(String(rawResult)) as { id?: unknown };
      if (typeof result.id !== "number") throw new Error("open_tab did not return a numeric tab ID");
      ownedTabIds.add(result.id);
      return rawResult;
    },
  };

  const assertOwned = (args: Record<string, unknown>): number => {
    const tabId = requireNumber(args, "tab_id");
    if (!ownedTabIds.has(tabId)) throw new Error(`Tab ${tabId} is not owned by this page extractor`);
    return tabId;
  };

  const readExecutor: ToolExecutor = {
    execute: async (args) => {
      assertOwned(args);
      return await entries.readTab.executor.execute(args);
    },
  };
  const closeExecutor: ToolExecutor = {
    execute: async (args) => {
      const tabId = assertOwned(args);
      const result = await entries.closeTab.executor.execute({ tab_id: tabId });
      ownedTabIds.delete(tabId);
      return result;
    },
  };

  const cleanup = async () => {
    await Promise.all(
      Array.from(ownedTabIds, async (tabId) => {
        await entries.closeTab.executor.execute({ tab_id: tabId });
        ownedTabIds.delete(tabId);
      })
    );
  };

  return {
    tools: [
      { definition: openDefinition, executor: openExecutor },
      {
        definition: {
          ...entries.readTab.definition,
          description: "Read content from a tab opened by this page extractor.",
        },
        executor: readExecutor,
      },
      {
        definition: {
          ...entries.closeTab.definition,
          description: "Close a tab opened by this page extractor.",
        },
        executor: closeExecutor,
      },
    ],
    cleanup,
  };
}
