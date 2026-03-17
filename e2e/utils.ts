import fs from "fs";
import path from "path";
import type { BrowserContext, Page } from "@playwright/test";

/** Strip SRI hashes and replace slow CDN with faster alternative */
export function patchScriptCode(code: string): string {
  return code
    .replace(/^(\/\/\s*@(?:require|resource)\s+.*?)#sha(?:256|384|512)[=-][^\s]+/gm, "$1")
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\//g, "https://unpkg.com/");
}

/**
 * Auto-approve permission confirm dialogs opened by the extension.
 * Listens for new pages matching confirm.html and clicks the
 * "permanent allow all" button (type=4, allow=true).
 */
export function autoApprovePermissions(context: BrowserContext): void {
  context.on("page", async (page) => {
    const url = page.url();
    if (!url.includes("confirm.html")) return;

    try {
      await page.waitForLoadState("domcontentloaded");
      const successButtons = page.locator("button.arco-btn-status-success");
      await successButtons.first().waitFor({ timeout: 5_000 });
      const count = await successButtons.count();
      if (count >= 3) {
        await successButtons.nth(2).click();
      } else {
        await successButtons.last().click();
      }
      console.log("[autoApprove] Permission approved on confirm page");
    } catch (e) {
      console.log("[autoApprove] Failed to approve:", e);
    }
  });
}

/** Run a test script from example/tests/ on the target page and collect console results */
export async function runTestScript(
  context: BrowserContext,
  extensionId: string,
  scriptFile: string,
  targetUrl: string,
  timeoutMs: number
): Promise<{ passed: number; failed: number; logs: string[] }> {
  let code = fs.readFileSync(path.join(__dirname, `../example/tests/${scriptFile}`), "utf-8");
  code = patchScriptCode(code);
  return runInlineTestScript(context, extensionId, code, targetUrl, timeoutMs);
}

/** Run inline script code on the target page and collect console results */
export async function runInlineTestScript(
  context: BrowserContext,
  extensionId: string,
  code: string,
  targetUrl: string,
  timeoutMs: number
): Promise<{ passed: number; failed: number; logs: string[] }> {
  await installScriptByCode(context, extensionId, code);
  autoApprovePermissions(context);

  const page = await context.newPage();
  const logs: string[] = [];
  let passed = -1;
  let failed = -1;

  const resultReady = new Promise<void>((resolve) => {
    page.on("console", (msg) => {
      const text = msg.text();
      logs.push(text);
      const passMatch = text.match(/通过[:：]\s*(\d+)/);
      const failMatch = text.match(/失败[:：]\s*(\d+)/);
      if (passMatch) passed = parseInt(passMatch[1], 10);
      if (failMatch) failed = parseInt(failMatch[1], 10);
      if (passed >= 0 && failed >= 0) resolve();
    });
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await Promise.race([resultReady, page.waitForTimeout(timeoutMs)]);

  await page.close();
  return { passed, failed, logs };
}

/** Open the options page and wait for it to load */
export async function openOptionsPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options.html`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the popup page and wait for it to load */
export async function openPopupPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the install page with a script URL parameter */
export async function openInstallPage(context: BrowserContext, extensionId: string, scriptUrl: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/install.html?url=${encodeURIComponent(scriptUrl)}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the script editor page */
export async function openEditorPage(context: BrowserContext, extensionId: string, params?: string): Promise<Page> {
  const page = await context.newPage();
  const hash = params ? `#/script/editor?${params}` : "#/script/editor";
  await page.goto(`chrome-extension://${extensionId}/src/options.html${hash}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Install a script by injecting code into the Monaco editor and saving */
export async function installScriptByCode(context: BrowserContext, extensionId: string, code: string): Promise<void> {
  const page = await openEditorPage(context, extensionId);
  // Wait for Monaco editor DOM and default template content to be ready
  await page.locator(".monaco-editor").waitFor({ timeout: 30_000 });
  await page.locator(".view-lines").waitFor({ timeout: 15_000 });
  // Click to focus editor; headless Chrome 下光标可能不会变为 visible，改用 focused 状态判断
  await page.locator(".monaco-editor .view-lines").click();
  // 等待编辑器获得焦点（textarea 获得 focus 即表示可交互）
  await page.locator(".monaco-editor textarea.inputarea").waitFor({ state: "attached", timeout: 5_000 });
  await page.locator(".monaco-editor textarea.inputarea").focus();
  // Select all existing content
  await page.keyboard.press("ControlOrMeta+a");
  // Capture current content fingerprint, then paste replacement
  const initialText = await page.locator(".view-lines").textContent();
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await page.keyboard.press("ControlOrMeta+v");
  // Wait for Monaco to finish rendering the pasted content (content will differ from template)
  await page.waitForFunction((init) => document.querySelector(".view-lines")?.textContent !== init, initialText, {
    timeout: 10_000,
  });
  // Save
  await page.keyboard.press("ControlOrMeta+s");
  // Wait for save: try arco-message first, then verify via script list
  const saved = await page
    .locator(".arco-message")
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!saved) {
    // For scripts with @require/@resource, the message may not appear.
    // Verify save by checking the script list on the options page.
    const listPage = await openOptionsPage(context, extensionId);
    const emptyState = listPage.locator(".arco-empty");
    // Wait until at least one script appears (no empty state), up to 30s
    await emptyState.waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
    await listPage.close();
  }
  await page.close();
}

/** A sample userscript for testing */
export const sampleUserScript = `// ==UserScript==
// @name         E2E Test Script
// @namespace    https://e2e.test
// @version      1.0.0
// @description  A test script for E2E testing
// @author       E2E Test
// @match        https://example.com/*
// ==/UserScript==

console.log("E2E Test Script loaded");
`;
