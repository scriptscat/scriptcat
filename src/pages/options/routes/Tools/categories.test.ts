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

describe("Tools 分类项 · 外部接入卡片可见性（Firefox 上尚未支持，需隐藏）", () => {
  it("非 Firefox 时包含 external-access 分类", async () => {
    isFirefox.mockReturnValue(false);
    const { getToolsCategories } = await import("./categories.ts");
    const categories = getToolsCategories(i18n.t);
    expect(categories.some((c: { id: string }) => c.id === "external-access")).toBe(true);
  });

  it("Firefox 上不包含 external-access 分类", async () => {
    isFirefox.mockReturnValue(true);
    const { getToolsCategories } = await import("./categories.ts");
    const categories = getToolsCategories(i18n.t);
    expect(categories.some((c: { id: string }) => c.id === "external-access")).toBe(false);
  });
});
