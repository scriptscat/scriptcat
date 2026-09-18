import { beforeAll, describe, expect, it } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import {
  DEFAULT_SCRIPT_TEMPLATES,
  renderScriptTemplate,
  resolveScriptTemplate,
  validateScriptTemplate,
  type ScriptTemplateVars,
} from "./script_template";

beforeAll(() => initTestLanguage("en-US"));

const vars = (patch: Partial<ScriptTemplateVars> = {}): ScriptTemplateVars => ({
  name: "New Userscript AAAA-1",
  match: "https://example.com/",
  icon: "https://example.com/favicon.ico",
  domain: "example.com",
  title: "Example Domain",
  date: new Date(2026, 8, 8, 14, 3, 5),
  ...patch,
});

describe("renderScriptTemplate", () => {
  it("把页面相关变量替换为对应取值", () => {
    const code = renderScriptTemplate(
      [
        "// @name         {{name}}",
        "// @namespace    https://{{domain}}/",
        "// @description  {{title}}",
        "// @match        {{match}}",
        "// @icon         {{icon}}",
      ].join("\n"),
      vars()
    );
    expect(code).toBe(
      [
        "// @name         New Userscript AAAA-1",
        "// @namespace    https://example.com/",
        "// @description  Example Domain",
        "// @match        https://example.com/",
        "// @icon         https://example.com/favicon.ico",
      ].join("\n")
    );
  });

  it("{{date}} 默认输出 YYYY-MM-DD，{{date:格式}} 按给定格式输出", () => {
    const code = renderScriptTemplate("// @version {{date}} {{date:YYYY/MM/DD HH:mm:ss}}", vars());
    expect(code).toBe("// @version 2026-09-08 2026/09/08 14:03:05");
  });

  it("变量取值为空时删除整行，其余行保持原样", () => {
    const code = renderScriptTemplate(
      ["// @name         {{name}}", "// @icon         {{icon}}", "// @grant        none"].join("\n"),
      vars({ icon: "" })
    );
    expect(code).toBe(["// @name         New Userscript AAAA-1", "// @grant        none"].join("\n"));
  });

  it("未识别的占位符原样保留", () => {
    const code = renderScriptTemplate("// @author {{author}}", vars());
    expect(code).toBe("// @author {{author}}");
  });
});

describe("resolveScriptTemplate", () => {
  it("有自定义模板时使用自定义模板", () => {
    expect(resolveScriptTemplate({ normal: "// custom" }, "normal")).toBe("// custom");
  });

  it("未设置或为空白时回落到内置默认模板", () => {
    expect(resolveScriptTemplate(undefined, "normal")).toBe(DEFAULT_SCRIPT_TEMPLATES.normal);
    expect(resolveScriptTemplate({ normal: "   " }, "normal")).toBe(DEFAULT_SCRIPT_TEMPLATES.normal);
    expect(resolveScriptTemplate({ normal: "// custom" }, "crontab")).toBe(DEFAULT_SCRIPT_TEMPLATES.crontab);
  });
});

describe("validateScriptTemplate", () => {
  it("三个内置默认模板都通过校验", () => {
    expect(validateScriptTemplate("normal", DEFAULT_SCRIPT_TEMPLATES.normal)).toBeNull();
    expect(validateScriptTemplate("background", DEFAULT_SCRIPT_TEMPLATES.background)).toBeNull();
    expect(validateScriptTemplate("crontab", DEFAULT_SCRIPT_TEMPLATES.crontab)).toBeNull();
  });

  it("普通脚本模板出现 @background 或 @crontab 时报错", () => {
    const withBackground = DEFAULT_SCRIPT_TEMPLATES.normal.replace("// @grant        none", "// @background");
    const withCrontab = DEFAULT_SCRIPT_TEMPLATES.normal.replace("// @grant        none", "// @crontab * * once * *");
    expect(validateScriptTemplate("normal", withBackground)).toContain("@background");
    expect(validateScriptTemplate("normal", withCrontab)).toContain("@crontab");
  });

  it("后台脚本模板缺少 @background 时报错", () => {
    const missing = DEFAULT_SCRIPT_TEMPLATES.background.replace("// @background\n", "");
    expect(validateScriptTemplate("background", missing)).toContain("@background");
  });

  it("定时脚本模板缺少 @crontab 或表达式非法时报错", () => {
    const missing = DEFAULT_SCRIPT_TEMPLATES.crontab.replace("// @crontab      * * once * *\n", "");
    expect(validateScriptTemplate("crontab", missing)).toContain("@crontab");
    const invalid = DEFAULT_SCRIPT_TEMPLATES.crontab.replace("* * once * *", "not-a-cron");
    expect(validateScriptTemplate("crontab", invalid)).toContain("not-a-cron");
  });

  it("缺少 UserScript 头或脚本名为空时报错", () => {
    expect(validateScriptTemplate("normal", "console.log(1)")).toBeTruthy();
    const emptyName = DEFAULT_SCRIPT_TEMPLATES.normal.replace("{{name}}", "");
    expect(validateScriptTemplate("normal", emptyName)).toBeTruthy();
  });
});
