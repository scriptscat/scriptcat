import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "./tool_registry";
import { registerDomTools } from "./dom_tools";
import type { AgentDomService } from "@App/app/service/service_worker/agent_dom";

describe("registerDomTools", () => {
  it("应注册所有 8 个 DOM 工具到 ToolRegistry", () => {
    const registry = new ToolRegistry();
    const mockService = {} as AgentDomService;

    registerDomTools(registry, mockService);

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(8);

    const names = defs.map((d) => d.name);
    expect(names).toContain("dom_list_tabs");
    expect(names).toContain("dom_navigate");
    expect(names).toContain("dom_read_page");
    expect(names).toContain("dom_screenshot");
    expect(names).toContain("dom_click");
    expect(names).toContain("dom_fill");
    expect(names).toContain("dom_scroll");
    expect(names).toContain("dom_wait_for");
  });

  it("应能通过 ToolRegistry 执行 dom_list_tabs", async () => {
    const registry = new ToolRegistry();
    const mockService = {
      listTabs: vi.fn().mockResolvedValue([{ tabId: 1, url: "https://example.com", title: "Test" }]),
    } as unknown as AgentDomService;

    registerDomTools(registry, mockService);

    const results = await registry.execute([
      { id: "tc1", name: "dom_list_tabs", arguments: "{}" },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("tc1");
    const parsed = JSON.parse(results[0].result);
    expect(parsed[0].tabId).toBe(1);
    expect(mockService.listTabs).toHaveBeenCalled();
  });

  it("应能通过 ToolRegistry 执行 dom_navigate", async () => {
    const registry = new ToolRegistry();
    const mockService = {
      navigate: vi.fn().mockResolvedValue({ tabId: 1, url: "https://target.com", title: "Target" }),
    } as unknown as AgentDomService;

    registerDomTools(registry, mockService);

    const results = await registry.execute([
      { id: "tc2", name: "dom_navigate", arguments: JSON.stringify({ url: "https://target.com", tabId: 1 }) },
    ]);

    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0].result);
    expect(parsed.url).toBe("https://target.com");
    expect(mockService.navigate).toHaveBeenCalledWith("https://target.com", {
      tabId: 1,
      waitUntil: undefined,
      timeout: undefined,
    });
  });

  it("应能通过 ToolRegistry 执行 dom_click", async () => {
    const registry = new ToolRegistry();
    const mockService = {
      click: vi.fn().mockResolvedValue({ success: true, navigated: false }),
    } as unknown as AgentDomService;

    registerDomTools(registry, mockService);

    const results = await registry.execute([
      { id: "tc3", name: "dom_click", arguments: JSON.stringify({ selector: "#btn", trusted: true }) },
    ]);

    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0].result);
    expect(parsed.success).toBe(true);
    expect(mockService.click).toHaveBeenCalledWith("#btn", {
      tabId: undefined,
      trusted: true,
    });
  });

  it("应能通过 ToolRegistry 执行 dom_read_page", async () => {
    const registry = new ToolRegistry();
    const mockService = {
      readPage: vi.fn().mockResolvedValue({
        title: "Page",
        url: "https://example.com",
        interactable: [],
        forms: [],
        links: [],
        sections: [{ selector: "main", summary: "Content", elementCount: 5 }],
      }),
    } as unknown as AgentDomService;

    registerDomTools(registry, mockService);

    const results = await registry.execute([
      { id: "tc4", name: "dom_read_page", arguments: JSON.stringify({ mode: "summary", tabId: 1 }) },
    ]);

    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0].result);
    expect(parsed.sections).toHaveLength(1);
    expect(mockService.readPage).toHaveBeenCalledWith({
      tabId: 1,
      selector: undefined,
      mode: "summary",
      maxLength: undefined,
      viewportOnly: undefined,
    });
  });
});
