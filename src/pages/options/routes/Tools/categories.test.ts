import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import i18n from "@App/locales/locales";

const { isFirefox } = vi.hoisted(() => ({ isFirefox: vi.fn(() => false) }));
vi.mock("@App/pkg/utils/utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, isFirefox };
});

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Tools 分类项 · MCP 桥接卡片可见性（Firefox 上尚未支持，需隐藏）", () => {
  it("EnableMCP=true 且非 Firefox 时包含 mcp-bridge 分类", async () => {
    vi.doMock("@App/app/const", () => ({ EnableMCP: true }));
    isFirefox.mockReturnValue(false);
    const { getToolsCategories } = await import("./categories.ts");
    const categories = getToolsCategories(i18n.t);
    expect(categories.some((c: { id: string }) => c.id === "mcp-bridge")).toBe(true);
  });

  it("EnableMCP=true 但处于 Firefox 时不包含 mcp-bridge 分类（controller 需优雅降级隐藏）", async () => {
    vi.doMock("@App/app/const", () => ({ EnableMCP: true }));
    isFirefox.mockReturnValue(true);
    const { getToolsCategories } = await import("./categories.ts");
    const categories = getToolsCategories(i18n.t);
    expect(categories.some((c: { id: string }) => c.id === "mcp-bridge")).toBe(false);
  });

  it("EnableMCP=false 时不包含 mcp-bridge 分类，与浏览器种类无关", async () => {
    vi.doMock("@App/app/const", () => ({ EnableMCP: false }));
    isFirefox.mockReturnValue(false);
    const { getToolsCategories } = await import("./categories.ts");
    const categories = getToolsCategories(i18n.t);
    expect(categories.some((c: { id: string }) => c.id === "mcp-bridge")).toBe(false);
  });
});
