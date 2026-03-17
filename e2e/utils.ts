import type { BrowserContext, Page } from "@playwright/test";

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
  // Click to focus and wait for the cursor to appear (confirms editor is interactive)
  await page.locator(".monaco-editor .view-lines").click();
  await page.locator(".cursors-layer .cursor").waitFor({ timeout: 5_000 });
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
