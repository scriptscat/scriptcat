import { describe, it, expect, beforeAll } from "vitest";
import i18n, { changeLanguage } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { getSettingCategories } from "./categories";
import { getToolsCategories } from "../Tools/categories";

async function switchTo(lng: string) {
  changeLanguage(lng);
  await i18n.changeLanguage(lng);
}

beforeAll(() => initTestLanguage("zh-CN"));

// 回归:原先 SETTING_CATEGORIES/TOOLS_CATEGORIES 在模块加载时即时求值 t()，
// 标签被冻结在加载时语言、切换语言永不更新。改为 get*(t) 函数后随当前语言返回。
describe("分类标签不再被冻结(随语言变化)", () => {
  it("getSettingCategories 切换语言后返回当前语言标签", async () => {
    await switchTo("zh-CN");
    const zh = getSettingCategories(i18n.t).find((c) => c.id === "general")!.label;
    await switchTo("en-US");
    const en = getSettingCategories(i18n.t).find((c) => c.id === "general")!.label;
    expect(zh).toBe(i18n.getFixedT("zh-CN")("settings:general"));
    expect(en).toBe(i18n.getFixedT("en-US")("settings:general"));
    expect(en).not.toBe(zh);
  });

  it("getToolsCategories 切换语言后返回当前语言标签", async () => {
    await switchTo("zh-CN");
    const zh = getToolsCategories(i18n.t).find((c) => c.id === "local-backup")!.label;
    await switchTo("en-US");
    const en = getToolsCategories(i18n.t).find((c) => c.id === "local-backup")!.label;
    expect(en).not.toBe(zh);
  });
});
