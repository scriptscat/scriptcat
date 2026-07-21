import fs from "fs";
import type { BrowserContext, Page } from "@playwright/test";
import { testWithUserScripts as test, expect } from "./fixtures";
import { installScriptByCode, openOptionsPage } from "./utils";

/**
 * 本地备份导出/导入（JSZip → JSZipp 替换, #1479）
 *
 * #1479 用 web-jszipp 替换 jszip 处理 ZIP。备份导出（createJSZip → generateAsync）与
 * 导入（loadAsyncJSZip → openZip）都走 jszip-x。本 spec 做一次端到端往返，覆盖两端：
 *  - 工具页“导出文件”生成 .zip 备份（generateAsync）；读取后断言是合法 ZIP（PK 魔数）
 *  - 把该 zip 喂回“导入文件”，导入页用 loadAsyncJSZip 解析后应列出被备份的脚本名
 *
 * 注意：“导入文件”按钮通过 window.open 打开 import.html 弹窗；该弹窗在 headless 下
 * 初始化消息通道会抛 onMessage 错误（与 #1479 无关、与弹窗窗口环境有关）。改用同一个
 * import.html?uuid=... URL 以普通标签页（goto）打开即可正常渲染——这并不影响对
 * loadAsyncJSZip 解析能力的验证。
 */

const SCRIPT_NAME = "Backup RoundTrip E2E";
const TARGET_ORIGIN = "http://backup-roundtrip.test";
const script = `// ==UserScript==
// @name         ${SCRIPT_NAME}
// @namespace    https://e2e.test
// @version      1.0.0
// @description  backup zip e2e
// @author       E2E
// @match        ${TARGET_ORIGIN}/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

document.documentElement.setAttribute("data-restored-value", GM_getValue("backup-key", "missing"));
GM_setValue("backup-key", "value-from-backup");
`;

async function purgeInstalledScript(page: Page): Promise<void> {
  const result = await page.evaluate(async (name) => {
    const all = await chrome.runtime.sendMessage({ action: "serviceWorker/script/getAllScripts" });
    const script = all.data.find((item: { name: string }) => item.name === name) as { uuid: string } | undefined;
    if (!script) throw new Error("导出后未找到待清理脚本");
    const deleted = await chrome.runtime.sendMessage({
      action: "serviceWorker/script/deletes",
      data: [script.uuid],
    });
    const purged = await chrome.runtime.sendMessage({
      action: "serviceWorker/script/purges",
      data: [script.uuid],
    });
    return { deleted, purged };
  }, SCRIPT_NAME);
  expect(result.deleted.code || 0, result.deleted.message).toBe(0);
  expect(result.deleted.data).toBe(true);
  expect(result.purged.code || 0, result.purged.message).toBe(0);
  expect(result.purged.data).toBe(true);
}

/** 轮询 SW 的 chrome.downloads，拿到刚导出的 blob 备份文件在磁盘上的路径 */
async function waitForExportedZipPath(context: BrowserContext, timeoutMs = 15_000): Promise<string> {
  const sw = context.serviceWorkers()[0];
  let filename: string | null = null;
  await expect
    .poll(
      async () => {
        filename = await sw.evaluate(
          () =>
            new Promise((resolve) => {
              chrome.downloads.search({ limit: 5, orderBy: ["-startTime"] }, (items) => {
                const hit = items.find(
                  (i) => (i.url || "").startsWith("blob:chrome-extension") && i.state === "complete"
                );
                resolve(hit ? hit.filename : null);
              });
            })
        );
        return filename && fs.existsSync(filename) ? filename : null;
      },
      { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] }
    )
    .not.toBeNull();
  return filename!;
}

test.describe("Backup zip export/import round-trip (#1479)", () => {
  test("导出后彻底删除原脚本，真正导入应恢复脚本与 GM Value", async ({ context, extensionId }) => {
    await context.route(`${TARGET_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" })
    );
    await installScriptByCode(context, extensionId, script);

    const seedPage = await context.newPage();
    await seedPage.goto(`${TARGET_ORIGIN}/seed`, { waitUntil: "domcontentloaded" });
    await expect(seedPage.locator("html")).toHaveAttribute("data-restored-value", "missing", { timeout: 20_000 });
    await seedPage.close();

    const page = await openOptionsPage(context, extensionId);
    await page.goto(`chrome-extension://${extensionId}/src/options.html#/tools`);
    await page.waitForLoadState("domcontentloaded");
    const exportBtn = page.locator("button", { hasText: /导出文件|Export File/ }).first();
    await exportBtn.waitFor({ timeout: 10_000 });

    // 1) 导出
    await exportBtn.click();
    const zipPath = await waitForExportedZipPath(context);

    // 2) 断言导出的是合法 ZIP（PK 魔数），generateAsync 工作正常
    const buf = fs.readFileSync(zipPath);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'

    // 导入前彻底删除原脚本和共享值，避免导入页只显示预览也造成假阳性。
    await purgeInstalledScript(page);

    // 3) 导入：点击“导入文件”→ 触发隐藏 file input 的 click（filechooser），选中刚导出的 zip，
    //    openImportWindow 会把文件写入 cache 并经扩展 API 新开导入页标签，从该标签 URL 取 uuid。
    //    注意：扩展首启且 userScripts 未开启时会异步用 chrome.tabs.create 打开「开启开发者模式」
    //    引导页，它与导入页同为新标签页。故收集所有新标签并按 URL 过滤，只认 import.html 目标页，
    //    避免 waitForEvent("page") 因时序竞态误捕引导页（CI 时序早开不命中、本地时序晚开命中）。
    const openedPages: Page[] = [];
    context.on("page", (p) => openedPages.push(p));
    page.on("filechooser", (fc) => fc.setFiles(zipPath).catch(() => {}));
    await page
      .locator("button", { hasText: /导入文件|Import File/ })
      .first()
      .click();
    let popup: Page | undefined;
    await expect
      .poll(
        () => {
          popup = openedPages.find((p) => p.url().includes("import.html"));
          return !!popup;
        },
        { timeout: 15_000, intervals: [100, 250, 500, 1_000] }
      )
      .toBe(true);
    await popup!.waitForLoadState("domcontentloaded").catch(() => {});
    const importUrl = popup!.url();
    expect(importUrl).toContain("import.html?uuid=");
    await popup!.close().catch(() => {});

    // 4) 以普通标签页打开同一 import URL，loadAsyncJSZip 解析 cache 中的 zip 后应列出脚本名
    const importPage: Page = await context.newPage();
    await importPage.goto(importUrl);
    await importPage.waitForLoadState("domcontentloaded");
    await expect(importPage.locator("body")).toContainText(SCRIPT_NAME, { timeout: 15_000 });

    await expect(importPage.getByTestId("import-btn")).toBeEnabled({ timeout: 10_000 });
    await importPage.getByTestId("import-btn").click();
    await expect(importPage.getByTestId("import-complete")).toBeVisible({ timeout: 30_000 });

    const restoredPage = await context.newPage();
    await restoredPage.goto(`${TARGET_ORIGIN}/restored`, { waitUntil: "domcontentloaded" });
    await expect(restoredPage.locator("html")).toHaveAttribute("data-restored-value", "value-from-backup", {
      timeout: 20_000,
    });

    await restoredPage.close();
    await importPage.close();
    await page.close();
  });
});
