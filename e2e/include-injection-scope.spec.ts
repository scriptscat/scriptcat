import { test, expect, startMockServer, type MockServer } from "./server-fixtures";
import { installScriptByCode } from "./utils";
import type { Page } from "@playwright/test";

// #1803：浏览器对 matches 与 includeGlobs 取并集，@include 脚本曾被注册成全站，代码挂到每个页面的 window 上。
// 这里在真实 Chrome 里验证三件事：glob 精确注册后仍在目标页（含 #hash 网址）执行；正则收不窄的脚本改由 pageLoad
// 下发代码后，在严格 CSP 的目标页照常执行；两者都不会把代码留在不相关的页面上。

function markerScript(name: string, rule: string, marker: string) {
  return `// ==UserScript==
// @name         ${name}
// @namespace    issue-1803-e2e
// @version      1.0.0
// @include      ${rule}
// @grant        none
// ==/UserScript==
document.documentElement.dataset.${marker} = "ran";`;
}

const GLOB_SCRIPT = markerScript("Issue 1803 glob", "http://*siteb.test*/page", "scGlob");
// 没有 scheme 的局部正则抽不出网域，只能不预注册、随 pageLoad 下发
const REGEX_SCRIPT = markerScript("Issue 1803 regex", "/content-security-policy\\.test:\\d+\\/page/", "scRegex");
const CONTROL_SCRIPT = `// ==UserScript==
// @name         Issue 1803 control
// @namespace    issue-1803-e2e
// @version      1.0.0
// @match        http://sitea.test/*
// @grant        none
// ==/UserScript==
document.documentElement.dataset.scControl = "ran";`;

const waitForMarker = (page: Page, marker: string) =>
  page.waitForFunction((key) => document.documentElement.dataset[key] === "ran", marker, { timeout: 10_000 });

test.describe("Issue 1803: @include 脚本只注入到匹配的页面", () => {
  let server: MockServer;

  test.beforeEach(async () => {
    server = await startMockServer();
  });

  test.afterEach(async () => {
    await server.close();
  });

  test("glob 与收不窄的正则 @include 都在各自的目标页执行，严格 CSP 也不例外", async ({ context, extensionId }) => {
    await installScriptByCode(context, extensionId, GLOB_SCRIPT);
    await installScriptByCode(context, extensionId, REGEX_SCRIPT);
    const page = await context.newPage();
    try {
      // glob 不以 * 结尾，浏览器拿带 hash 的完整网址匹配，靠补上的 #* 变体命中
      await page.goto(server.url("siteb.test", "/page#section"), { waitUntil: "domcontentloaded" });
      await waitForMarker(page, "scGlob");

      // 该主机下发 script-src 'none'，代码由 content 环境插入页面
      await page.goto(server.url("content-security-policy.test", "/page"), { waitUntil: "domcontentloaded" });
      await waitForMarker(page, "scRegex");
    } finally {
      await page.close();
    }
  });

  test("不匹配的页面上不留下任何脚本代码", async ({ context, extensionId }) => {
    await installScriptByCode(context, extensionId, GLOB_SCRIPT);
    await installScriptByCode(context, extensionId, REGEX_SCRIPT);
    await installScriptByCode(context, extensionId, CONTROL_SCRIPT);
    const page = await context.newPage();
    try {
      await page.goto(server.url("sitea.test", "/page"), { waitUntil: "domcontentloaded" });
      // 对照脚本执行说明本页的 pageLoad 已经完成，随 pageLoad 下发的代码此时也已注入（如果有的话）
      await waitForMarker(page, "scControl");

      const leaked = await page.evaluate(() => ({
        flags: Object.keys(window).filter((key) => key.startsWith("#-")),
        markers: { ...document.documentElement.dataset },
      }));
      expect(leaked).toEqual({ flags: [], markers: { scControl: "ran" } });
    } finally {
      await page.close();
    }
  });
});
