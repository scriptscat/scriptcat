import { test, expect } from "./fixtures";
import { installScriptByCode } from "./utils";
import type { Page } from "@playwright/test";

function scriptCode(name: string, rule: "match" | "include") {
  return `// ==UserScript==
// @name         ${name}
// @namespace    issue-1591-e2e
// @version      1.0.0
// @${rule}        https://example.com/*
// @grant        none
// ==/UserScript==
console.log("${name}");`;
}

async function getTargetTab(extensionPage: Page) {
  return extensionPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => item.url?.startsWith("https://example.com/"));
    if (!tab?.id || !tab.url) throw new Error("target tab not found");
    return { tabId: tab.id, url: tab.url };
  });
}

async function verifyExcludeRoundTrip(
  extensionPage: Page,
  targetTab: { tabId: number; url: string },
  scriptName: string
) {
  return extensionPage.evaluate(
    async ({ tabId, url, scriptName }) => {
      const getPopupData = () =>
        chrome.runtime.sendMessage({
          action: "serviceWorker/popup/getPopupData",
          data: { tabId, url },
        });

      const initial = await getPopupData();
      const script = initial.data.scriptList.find((item: { name: string }) => item.name === scriptName);
      if (!script) throw new Error(`script missing initially: ${JSON.stringify(initial.data.scriptList)}`);

      const exclude = await chrome.runtime.sendMessage({
        action: "serviceWorker/script/excludeUrl",
        data: { uuid: script.uuid, excludePattern: "*://example.com/*", remove: false },
      });
      if (exclude.code) throw new Error(`exclude failed: ${JSON.stringify(exclude)}`);

      const afterExclude = await getPopupData();
      const excluded = afterExclude.data.scriptList.find((item: { uuid: string }) => item.uuid === script.uuid);
      if (!excluded) throw new Error("script disappeared from Popup after exclusion");

      const unexclude = await chrome.runtime.sendMessage({
        action: "serviceWorker/script/excludeUrl",
        data: { uuid: script.uuid, excludePattern: "*://example.com/*", remove: true },
      });
      if (unexclude.code) throw new Error(`unexclude failed: ${JSON.stringify(unexclude)}`);

      const afterUnexclude = await getPopupData();
      const restored = afterUnexclude.data.scriptList.find((item: { uuid: string }) => item.uuid === script.uuid);
      if (!restored) throw new Error("script missing from Popup after exclusion was cancelled");

      return { excludedIsEffective: excluded.isEffective, restoredIsEffective: restored.isEffective };
    },
    { ...targetTab, scriptName }
  );
}

test.describe("Issue 1591: Popup exclusion regression", () => {
  test("@match script remains visible and reversible after excluding the current site", async ({
    context,
    extensionId,
  }) => {
    const name = "Issue 1591 @match";
    await installScriptByCode(context, extensionId, scriptCode(name, "match"));
    const target = await context.newPage();
    const extensionPage = await context.newPage();
    try {
      await target.goto("https://example.com/", { waitUntil: "domcontentloaded" });
      await extensionPage.goto(`chrome-extension://${extensionId}/src/options.html`);
      const result = await verifyExcludeRoundTrip(extensionPage, await getTargetTab(extensionPage), name);
      expect(result).toEqual({ excludedIsEffective: false, restoredIsEffective: true });
    } finally {
      await extensionPage.close();
      await target.close();
    }
  });

  test("@include script remains visible and reversible after excluding the current site", async ({
    context,
    extensionId,
  }) => {
    const name = "Issue 1591 @include";
    await installScriptByCode(context, extensionId, scriptCode(name, "include"));
    const target = await context.newPage();
    const extensionPage = await context.newPage();
    try {
      await target.goto("https://example.com/", { waitUntil: "domcontentloaded" });
      await extensionPage.goto(`chrome-extension://${extensionId}/src/options.html`);
      const result = await verifyExcludeRoundTrip(extensionPage, await getTargetTab(extensionPage), name);
      expect(result).toEqual({ excludedIsEffective: false, restoredIsEffective: true });
    } finally {
      await extensionPage.close();
      await target.close();
    }
  });

  test("script with no match/include rule is not treated as a matched Popup script", async ({
    context,
    extensionId,
  }) => {
    const name = "Issue 1590 unmatched feature";
    await installScriptByCode(
      context,
      extensionId,
      `// ==UserScript==\n// @name         ${name}\n// @namespace    issue-1590-e2e\n// @version      1.0.0\n// @grant        none\n// ==/UserScript==\nconsole.log("unmatched");`
    );
    const target = await context.newPage();
    const extensionPage = await context.newPage();
    try {
      await target.goto("https://example.com/", { waitUntil: "domcontentloaded" });
      await extensionPage.goto(`chrome-extension://${extensionId}/src/options.html`);
      const targetTab = await getTargetTab(extensionPage);
      const popupData = await extensionPage.evaluate(
        ({ tabId, url }) =>
          chrome.runtime.sendMessage({ action: "serviceWorker/popup/getPopupData", data: { tabId, url } }),
        targetTab
      );
      expect(popupData.data.scriptList.some((item: { name: string }) => item.name === name)).toBe(false);
    } finally {
      await extensionPage.close();
      await target.close();
    }
  });
});
