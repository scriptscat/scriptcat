import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { DEFAULT_SCRIPT_TEMPLATES, type ScriptTemplateOverrides } from "@App/pkg/utils/script_template";
import type { Script } from "@App/app/repo/scripts";

const { getScriptTemplates, prepareScriptByCode } = vi.hoisted(() => ({
  getScriptTemplates: vi.fn(),
  prepareScriptByCode: vi.fn(),
}));

vi.mock("@App/pages/store/global", () => ({ systemConfig: { getScriptTemplates } }));
vi.mock("@App/pkg/utils/script", () => ({ prepareScriptByCode }));

import { emptyScript } from "./editorScriptLoaders";

const setTemplates = (v: ScriptTemplateOverrides) => getScriptTemplates.mockResolvedValue(v);

// 新建脚本时把渲染后的代码交给 prepareScriptByCode，这里取回它实际收到的代码
const renderedCode = () => prepareScriptByCode.mock.calls.at(-1)?.[0] as string;

beforeEach(async () => {
  initTestLanguage("en-US");
  vi.clearAllMocks();
  setTemplates({});
  prepareScriptByCode.mockImplementation(async (_code: string, _origin: string, uuid: string) => ({
    script: { uuid } as Script,
  }));
  await chrome.storage.local.remove(["activeTabUrl"]);
});

describe("emptyScript", () => {
  it("使用用户自定义模板，并按活动标签页替换变量", async () => {
    setTemplates({
      normal: [
        "// ==UserScript==",
        "// @name         {{name}}",
        "// @namespace    https://{{domain}}/",
        "// @description  {{title}}",
        "// @match        {{match}}",
        "// @grant        none",
        "// ==/UserScript==",
      ].join("\n"),
    });
    await chrome.storage.local.set({ activeTabUrl: { url: "https://example.com/docs?a=1", title: "示例页面" } });

    await emptyScript("", "initial");

    const code = renderedCode();
    expect(code).toContain("// @namespace    https://example.com/");
    expect(code).toContain("// @description  示例页面");
    expect(code).toContain("// @match        https://example.com/docs?a=1");
    expect(code).toMatch(/\/\/ @name\s+New Userscript [0-9A-Z]{4}-\d+/);
  });

  it("没有活动标签页时回落到默认模板与通配 @match，并删掉取不到值的 @icon 行", async () => {
    await emptyScript("");

    const code = renderedCode();
    expect(code).toContain("// @match        https://*/*");
    expect(code).not.toContain("@icon");
    expect(code).not.toContain("{{");
  });

  it("按模板类型取用对应的自定义模板", async () => {
    setTemplates({ crontab: DEFAULT_SCRIPT_TEMPLATES.crontab.replace("* * once * *", "0 8 * * *") });

    await emptyScript("crontab");

    expect(renderedCode()).toContain("// @crontab      0 8 * * *");
  });

  it("读取后清除 activeTabUrl，避免下次新建复用上次的标签页", async () => {
    await chrome.storage.local.set({ activeTabUrl: { url: "https://example.com/", title: "示例页面" } });

    await emptyScript("", "initial");

    expect(await chrome.storage.local.get(["activeTabUrl"])).toEqual({});
  });
});
