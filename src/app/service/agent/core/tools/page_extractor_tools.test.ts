import { describe, expect, it, vi } from "vitest";
import type { ToolEntry } from "../tool_registry";
import { createPageExtractorTabTools } from "./page_extractor_tools";

function entry(name: string, execute: ToolEntry["executor"]["execute"]): ToolEntry {
  return {
    source: "builtin",
    definition: {
      name,
      description: name,
      parameters: {
        type: "object",
        properties: { url: {}, tab_id: {}, active: {}, prompt: {} },
      },
    },
    executor: { execute },
  };
}

describe("page_extractor 标签页作用域", () => {
  it("open_tab 应始终新建非活动标签页并记录所有权", async () => {
    const open = vi.fn().mockResolvedValue(JSON.stringify({ id: 42, url: "https://example.com" }));
    const scoped = createPageExtractorTabTools({
      openTab: entry("open_tab", open),
      readTab: entry("get_tab_content", vi.fn()),
      closeTab: entry("close_tab", vi.fn()),
    });
    const tool = scoped.tools.find((candidate) => candidate.definition.name === "open_tab")!;

    expect(tool.definition.parameters).not.toMatchObject({ properties: { tab_id: expect.anything() } });
    await tool.executor.execute({ url: "https://example.com", tab_id: 9, active: true });

    expect(open).toHaveBeenCalledWith({ url: "https://example.com", active: false });
  });

  it("读取和关闭非自建标签页应在调用底层前被拒绝", async () => {
    const read = vi.fn();
    const close = vi.fn();
    const scoped = createPageExtractorTabTools({
      openTab: entry("open_tab", vi.fn()),
      readTab: entry("get_tab_content", read),
      closeTab: entry("close_tab", close),
    });
    const readTool = scoped.tools.find((candidate) => candidate.definition.name === "get_tab_content")!;
    const closeTool = scoped.tools.find((candidate) => candidate.definition.name === "close_tab")!;

    await expect(readTool.executor.execute({ tab_id: 9, prompt: "price" })).rejects.toThrow("not owned");
    await expect(closeTool.executor.execute({ tab_id: 9 })).rejects.toThrow("not owned");
    expect(read).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("只允许读取自建标签页并在清理时关闭遗留标签页", async () => {
    const open = vi.fn().mockResolvedValue(JSON.stringify({ id: 42 }));
    const read = vi.fn().mockResolvedValue("content");
    const close = vi.fn().mockResolvedValue("closed");
    const scoped = createPageExtractorTabTools({
      openTab: entry("open_tab", open),
      readTab: entry("get_tab_content", read),
      closeTab: entry("close_tab", close),
    });
    const openTool = scoped.tools.find((candidate) => candidate.definition.name === "open_tab")!;
    const readTool = scoped.tools.find((candidate) => candidate.definition.name === "get_tab_content")!;

    await openTool.executor.execute({ url: "https://example.com" });
    await expect(readTool.executor.execute({ tab_id: 42, prompt: "price" })).resolves.toBe("content");
    await scoped.cleanup();

    expect(close).toHaveBeenCalledWith({ tab_id: 42 });
  });
});
