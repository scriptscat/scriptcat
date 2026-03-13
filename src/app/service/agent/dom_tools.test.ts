import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "./tool_registry";
import { registerDomTools } from "./dom_tools";
import type { AgentDomService } from "@App/app/service/service_worker/agent_dom";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";

vi.mock("@App/pkg/utils/uuid", () => ({
  uuidv4: vi.fn(() => "mock-att-uuid"),
}));

describe("registerDomTools", () => {
  it("应注册所有 7 个 DOM 工具到 ToolRegistry（不含 dom_read_page）", () => {
    const registry = new ToolRegistry();
    const mockService = {} as AgentDomService;

    registerDomTools(registry, mockService);

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(7);

    const names = defs.map((d) => d.name);
    expect(names).toContain("dom_list_tabs");
    expect(names).toContain("dom_navigate");
    expect(names).not.toContain("dom_read_page");
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

    const results = await registry.execute([{ id: "tc1", name: "dom_list_tabs", arguments: "{}" }]);

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

  it("dom_screenshot 应返回 ToolResultWithAttachments 格式", async () => {
    const registry = new ToolRegistry();
    const mockRepo = {
      saveAttachment: vi.fn().mockResolvedValue(5000),
    } as unknown as AgentChatRepo;
    registry.setChatRepo(mockRepo);

    const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgAB";
    const mockService = {
      screenshot: vi.fn().mockResolvedValue(dataUrl),
    } as unknown as AgentDomService;

    registerDomTools(registry, mockService);

    const results = await registry.execute([
      { id: "tc5", name: "dom_screenshot", arguments: JSON.stringify({ quality: 90 }) },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].result).toBe("Screenshot captured successfully.");
    expect(results[0].attachments).toHaveLength(1);

    const att = results[0].attachments![0];
    expect(att.type).toBe("image");
    expect(att.name).toBe("screenshot.jpg");
    expect(att.mimeType).toBe("image/jpeg");
    expect(att.size).toBe(5000);

    // 验证保存到 OPFS 的数据是完整的 data URL
    expect(mockRepo.saveAttachment).toHaveBeenCalledWith("mock-att-uuid", dataUrl);
  });

  it("dom_screenshot PNG 格式应正确识别", async () => {
    const registry = new ToolRegistry();
    const mockRepo = {
      saveAttachment: vi.fn().mockResolvedValue(3000),
    } as unknown as AgentChatRepo;
    registry.setChatRepo(mockRepo);

    const dataUrl = "data:image/png;base64,iVBORw0KGgo";
    const mockService = {
      screenshot: vi.fn().mockResolvedValue(dataUrl),
    } as unknown as AgentDomService;

    registerDomTools(registry, mockService);

    const results = await registry.execute([
      { id: "tc6", name: "dom_screenshot", arguments: "{}" },
    ]);

    const att = results[0].attachments![0];
    expect(att.mimeType).toBe("image/png");
    expect(att.name).toBe("screenshot.png");
  });
});
