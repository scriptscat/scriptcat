import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { SUPPORTED_GRANTS } from "@App/pkg/utils/script_compat";
import { checkScript, KNOWN_GRANTS } from "./check.mjs";
import process from "node:process";

const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "check.mjs");

function script(headerLines, body = "") {
  return ["// ==UserScript==", ...headerLines.map((l) => `// ${l}`), "// ==/UserScript==", "", body].join("\n");
}

const PAGE = ["@name Demo", "@namespace https://example.com/demo", "@match https://example.com/*"];
const BACKGROUND = ["@name Demo", "@namespace https://example.com/demo", "@background"];

// 只比较规则、级别和行号；提示文案不是契约
const summary = (code) => checkScript(code).map(({ level, rule, line }) => ({ level, rule, line }));

describe("check.mjs 内置 grant 清单", () => {
  it("与脚本猫的 SUPPORTED_GRANTS 完全一致", () => {
    expect([...KNOWN_GRANTS].sort()).toEqual([...SUPPORTED_GRANTS].sort());
  });
});

describe("checkScript", () => {
  it("声明齐全的页面脚本没有任何发现", () => {
    const code = script(
      [...PAGE, "@grant GM_setValue", "@grant GM.xmlHttpRequest"],
      'GM_setValue("a", 1);\nawait GM.setValue("b", 2);\nGM.xmlHttpRequest({ url: "/x" });\nGM_info.script.name;'
    );
    expect(summary(code)).toEqual([]);
  });

  it("缺少脚本头时报错", () => {
    expect(summary("console.log(1);")).toEqual([{ level: "error", rule: "header-missing", line: 1 }]);
  });

  it("缺少 @name 报错、缺少 @namespace 警告", () => {
    const code = script(["@match https://example.com/*"]);
    expect(summary(code)).toEqual([
      { level: "error", rule: "name-missing", line: 1 },
      { level: "warn", rule: "namespace-missing", line: 1 },
    ]);
  });

  it("调用未声明 grant 的 API 时在调用所在行报错", () => {
    const code = script(PAGE, '\nGM_setValue("a", 1);');
    expect(summary(code)).toEqual([{ level: "error", rule: "grant-missing", line: 8 }]);
  });

  it("GM_foo 与 GM.foo 只在名字完全一致时互通：GM_xmlhttpRequest 不覆盖 GM.xmlHttpRequest", () => {
    const ok = script([...PAGE, "@grant GM_setValue"], 'await GM.setValue("a", 1);');
    expect(summary(ok)).toEqual([]);
    const bad = script([...PAGE, "@grant GM_xmlhttpRequest"], 'GM.xmlHttpRequest({ url: "/x" });');
    expect(summary(bad)).toEqual([{ level: "error", rule: "grant-missing", line: 8 }]);
  });

  it("被已授权 API 依赖而一并注入的 API 不需要单独授权，但别名不会随依赖扩散", () => {
    const ok = script([...PAGE, "@grant GM_openInTab"], 'GM_closeInTab(GM_openInTab("https://example.com/"));');
    expect(summary(ok)).toEqual([]);
    const bad = script([...PAGE, "@grant GM_openInTab"], "GM.closeInTab(1);");
    expect(summary(bad)).toEqual([{ level: "error", rule: "grant-missing", line: 8 }]);
  });

  it("注释、字符串和正则里出现的 API 名不算调用", () => {
    const code = script(
      PAGE,
      '// GM_setValue("x")\n/* unsafeWindow */\nconst s = "GM_getValue";\nconst t = `GM_log ${1}`;\nconst r = /GM_cookie"/;'
    );
    expect(summary(code)).toEqual([]);
  });

  it("脚本猫未实现的 GM_* 名称只警告（可能来自 @require 的库）", () => {
    const code = script(PAGE, "GM_config.open();");
    expect(summary(code)).toEqual([{ level: "warn", rule: "api-unsupported", line: 7 }]);
  });

  it("@grant none 下使用 GM API 或 unsafeWindow 报错，GM_info 不受影响", () => {
    const code = script([...PAGE, "@grant none"], 'GM_info.script.name;\nGM_setValue("a", 1);\nunsafeWindow.foo;');
    expect(summary(code)).toEqual([
      { level: "error", rule: "grant-none-api", line: 9 },
      { level: "error", rule: "grant-none-unsafewindow", line: 10 },
    ]);
  });

  it("@grant none 与其他 grant 混写报错", () => {
    const code = script([...PAGE, "@grant none", "@grant GM_setValue"], 'GM_setValue("a", 1);');
    expect(summary(code)).toEqual([
      { level: "error", rule: "grant-none-conflict", line: 5 },
      { level: "error", rule: "grant-none-api", line: 9 },
    ]);
  });

  it("沙盒脚本使用 unsafeWindow 无需 grant", () => {
    const code = script([...PAGE, "@grant GM_setValue"], 'GM_setValue("a", unsafeWindow.foo);');
    expect(summary(code)).toEqual([]);
  });

  it("未知 grant 警告", () => {
    const code = script([...PAGE, "@grant GM_doesNotExist"]);
    expect(summary(code)).toEqual([{ level: "warn", rule: "grant-unknown", line: 5 }]);
  });

  it("使用 urlchange 事件需要 @grant window.onurlchange", () => {
    const code = script(PAGE, 'window.addEventListener("urlchange", (e) => e.url);');
    expect(summary(code)).toEqual([{ level: "error", rule: "grant-missing", line: 7 }]);
    const granted = script([...PAGE, "@grant window.onurlchange"], 'window.addEventListener("urlchange", () => {});');
    expect(summary(granted)).toEqual([]);
  });

  it("页面脚本没有 @match/@include 报错，后台脚本不需要", () => {
    const page = script(["@name Demo", "@namespace https://example.com/demo"]);
    expect(summary(page)).toEqual([{ level: "error", rule: "match-missing", line: 1 }]);
    expect(summary(script(BACKGROUND, "return 1;"))).toEqual([]);
  });

  it("后台脚本使用 GM_getTab 系列报错", () => {
    const code = script([...BACKGROUND, "@grant GM_getTab"], "GM_getTab(() => {});\nreturn 1;");
    expect(summary(code)).toEqual([{ level: "error", rule: "background-tab-api", line: 8 }]);
  });

  it("后台脚本顶层没有 return 时警告，只在嵌套函数里 return 不算", () => {
    const code = script(BACKGROUND, "function f() { return 1; }\nf();");
    expect(summary(code)).toEqual([{ level: "warn", rule: "background-no-return", line: 1 }]);
    expect(summary(script(BACKGROUND, "return new Promise((resolve) => resolve());"))).toEqual([]);
  });

  it("cron 字段数、once 写法和多余空格不合法时报错", () => {
    const cron = (expr) =>
      summary(script(["@name Demo", "@namespace https://example.com/demo", `@crontab ${expr}`], "return 1;"));
    expect(cron("* * once * *")).toEqual([]);
    expect(cron("0 * once(9-17) * * *")).toEqual([]);
    expect(cron("* * *")).toEqual([{ level: "error", rule: "cron-invalid", line: 4 }]);
    expect(cron("* once once * *")).toEqual([{ level: "error", rule: "cron-invalid", line: 4 }]);
    expect(cron("* once(9-17 * * *")).toEqual([{ level: "error", rule: "cron-invalid", line: 4 }]);
    expect(cron("* *  once * *")).toEqual([{ level: "error", rule: "cron-invalid", line: 4 }]);
  });

  it("多行 @crontab 警告", () => {
    const code = script(
      ["@name Demo", "@namespace https://example.com/demo", "@crontab * * once * *", "@crontab 0 9 * * *"],
      "return 1;"
    );
    expect(summary(code)).toEqual([{ level: "warn", rule: "cron-multiple", line: 5 }]);
  });

  it("@run-at 取值非法或 @early-start 未配 document-start 时警告", () => {
    expect(summary(script([...PAGE, "@run-at document-ready"]))).toEqual([
      { level: "warn", rule: "run-at-invalid", line: 5 },
    ]);
    expect(summary(script([...PAGE, "@run-at document-idle", "@early-start"]))).toEqual([
      { level: "warn", rule: "early-start-ignored", line: 6 },
    ]);
    expect(summary(script([...PAGE, "@run-at document-start", "@early-start"]))).toEqual([]);
  });

  it("请求的字面量 URL 不在 @connect 也不在 @match 域名下时警告", () => {
    const base = [...PAGE, "@grant GM_xmlhttpRequest"];
    const req = (url) => `GM_xmlhttpRequest({ url: "${url}" });`;
    expect(summary(script(base, req("https://example.com/api")))).toEqual([]);
    expect(summary(script([...base, "@connect example.org"], req("https://api.example.org/v1")))).toEqual([]);
    expect(summary(script([...base, "@connect *"], req("https://other.net/")))).toEqual([]);
    expect(summary(script(base, req("https://other.net/")))).toEqual([
      { level: "warn", rule: "connect-missing", line: 8 },
    ]);
    expect(summary(script(base, req("https://sub.example.com/")))).toEqual([
      { level: "warn", rule: "connect-missing", line: 8 },
    ]);
    expect(summary(script([...base, "@connect self"], req("https://sub.example.com/")))).toEqual([]);
  });

  it("不发请求的脚本不检查 URL 字面量", () => {
    expect(summary(script(PAGE, 'const link = "https://other.net/";'))).toEqual([]);
  });
});

describe("check.mjs 命令行", () => {
  const run = (code) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sc-check-"));
    const file = path.join(dir, "a.user.js");
    writeFileSync(file, code);
    try {
      return spawnSync(process.execPath, [CHECK, file], { encoding: "utf8" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("有 error 时退出码为 1，并按「级别 规则 文件:行 说明」输出", () => {
    const res = run(script(PAGE, 'GM_setValue("a", 1);'));
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/^error grant-missing .*a\.user\.js:7 /m);
  });

  it("只有 warn 时退出码为 0", () => {
    const res = run(script([...PAGE, "@grant GM_doesNotExist"]));
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/^warn grant-unknown .*a\.user\.js:5 /m);
  });

  it("没有参数时退出码为 2", () => {
    const res = spawnSync(process.execPath, [CHECK], { encoding: "utf8" });
    expect(res.status).toBe(2);
  });
});
