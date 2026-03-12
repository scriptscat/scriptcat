import type { BrowserContext, Page } from "@playwright/test";

/** Open the options page and wait for it to load */
export async function openOptionsPage(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options.html`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the popup page and wait for it to load */
export async function openPopupPage(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the install page with a script URL parameter */
export async function openInstallPage(
  context: BrowserContext,
  extensionId: string,
  scriptUrl: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/src/install.html?url=${encodeURIComponent(scriptUrl)}`
  );
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the script editor page */
export async function openEditorPage(
  context: BrowserContext,
  extensionId: string,
  params?: string
): Promise<Page> {
  const page = await context.newPage();
  const hash = params ? `#/script/editor?${params}` : "#/script/editor";
  await page.goto(`chrome-extension://${extensionId}/src/options.html${hash}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
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
