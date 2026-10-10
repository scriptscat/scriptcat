import { randomUUID } from "crypto";
import type { BrowserContext } from "@playwright/test";
import { testWithUserScripts as test, expect } from "./fixtures";
import { autoApprovePermissions, installScriptByCode, openOptionsPage } from "./utils";

const TARGET_ORIGIN = "http://sandbox-channel.test";

type ScriptActionResponse<T> = {
  code?: number;
  data?: T;
  message?: string;
};

type InstalledScript = {
  name: string;
  uuid: string;
};

async function serveTargetPage(context: BrowserContext): Promise<void> {
  await context.route(`${TARGET_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><head><title>Sandbox channel E2E</title></head><body></body></html>",
    })
  );
}

async function enableBackgroundScript(context: BrowserContext, extensionId: string, name: string): Promise<void> {
  const page = await openOptionsPage(context, extensionId);
  try {
    const scripts = await page.evaluate(async () => {
      const response = (await chrome.runtime.sendMessage({
        action: "serviceWorker/script/getAllScripts",
      })) as ScriptActionResponse<InstalledScript[]>;
      if (!response || response.code) throw new Error(response?.message || "getAllScripts failed");
      return response.data || [];
    });
    const script = scripts.find((item) => item.name === name);
    expect(script, `missing installed background script: ${name}`).toBeDefined();

    const response = await page.evaluate(async (uuid) => {
      return chrome.runtime.sendMessage({
        action: "serviceWorker/script/enable",
        data: { uuid, enable: true },
      }) as Promise<ScriptActionResponse<Record<string, never>>>;
    }, script!.uuid);
    expect(response.code || 0, response.message).toBe(0);
  } finally {
    await page.close();
  }
}

test.describe("private Offscreen/EventPage ↔ Sandbox MessagePort", () => {
  test.setTimeout(120_000);

  test("background userscript window.onmessage cannot observe ScriptCat sandbox transport payloads", async ({
    context,
    extensionId,
  }) => {
    await serveTargetPage(context);
    const token = randomUUID().replaceAll("-", "");
    const storageName = `scriptcat-e2e-sandbox-port-${token}`;
    const spyName = `E2E sandbox message spy ${token}`;
    const victimName = `E2E sandbox victim ${token}`;
    const readyAttribute = `data-sc-${token}-spy-ready`;
    const countAttribute = `data-sc-${token}-window-message-count`;
    const victimReadyAttribute = `data-sc-${token}-victim-ready`;
    const prototypeHookAttribute = `data-sc-${token}-prototype-hooked`;
    const prototypeCountAttribute = `data-sc-${token}-prototype-message-count`;

    const spyCode = `// ==UserScript==
// @name         ${spyName}
// @namespace    https://e2e.scriptcat.test/${token}/spy
// @version      1.0.0
// @background
// @grant        GM_setValue
// @storageName  ${storageName}
// ==/UserScript==

const observed = [];
const capture = (event) => {
  observed.push(event.data);
  GM_setValue("window-message-count", observed.length);
};

let prototypeReads = 0;
const dataDescriptor = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
const prototypeHooked = !!dataDescriptor?.get && dataDescriptor.configurable === true;
if (prototypeHooked) {
  Object.defineProperty(MessageEvent.prototype, "data", {
    ...dataDescriptor,
    get() {
      const value = dataDescriptor.get.call(this);
      if (
        value &&
        typeof value === "object" &&
        typeof value.messageId === "string" &&
        typeof value.type === "string"
      ) {
        prototypeReads += 1;
        GM_setValue("prototype-message-count", prototypeReads);
      }
      return value;
    },
  });
}

window.addEventListener("message", capture);
window.onmessage = capture;
GM_setValue("window-message-count", 0);
GM_setValue("prototype-message-count", 0);
GM_setValue("prototype-hooked", prototypeHooked);
GM_setValue("spy-ready", true);
return new Promise(() => {});
`;

    const readerCode = `// ==UserScript==
// @name         E2E sandbox message reader ${token}
// @namespace    https://e2e.scriptcat.test/${token}/reader
// @version      1.0.0
// @match        ${TARGET_ORIGIN}/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @storageName  ${storageName}
// ==/UserScript==

const setMarker = (name, value) => {
  const apply = () => document.documentElement?.setAttribute(name, String(value));
  if (document.documentElement) apply();
  else document.addEventListener("DOMContentLoaded", apply, { once: true });
};

const sync = () => {
  setMarker(${JSON.stringify(readyAttribute)}, GM_getValue("spy-ready", false));
  setMarker(${JSON.stringify(countAttribute)}, GM_getValue("window-message-count", -1));
  setMarker(${JSON.stringify(victimReadyAttribute)}, GM_getValue("victim-ready", false));
  setMarker(${JSON.stringify(prototypeHookAttribute)}, GM_getValue("prototype-hooked", false));
  setMarker(${JSON.stringify(prototypeCountAttribute)}, GM_getValue("prototype-message-count", -1));
};
GM_addValueChangeListener("spy-ready", sync);
GM_addValueChangeListener("window-message-count", sync);
GM_addValueChangeListener("victim-ready", sync);
GM_addValueChangeListener("prototype-hooked", sync);
GM_addValueChangeListener("prototype-message-count", sync);
sync();
`;

    const victimCode = `// ==UserScript==
// @name         ${victimName}
// @namespace    https://e2e.scriptcat.test/${token}/victim
// @version      1.0.0
// @background
// @grant        GM_setValue
// @storageName  ${storageName}
// ==/UserScript==

GM_setValue("victim-ready", true);
return new Promise(() => {});
`;

    await installScriptByCode(context, extensionId, spyCode);
    await installScriptByCode(context, extensionId, readerCode);
    autoApprovePermissions(context);
    await enableBackgroundScript(context, extensionId, spyName);

    const page = await context.newPage();
    try {
      await page.goto(`${TARGET_ORIGIN}/page?token=${token}`, { waitUntil: "domcontentloaded" });
      const root = page.locator("html");
      await expect(root).toHaveAttribute(readyAttribute, "true", { timeout: 20_000 });
      await expect(root).toHaveAttribute(prototypeHookAttribute, "true", { timeout: 20_000 });
      await expect.poll(() => root.getAttribute(countAttribute), { timeout: 20_000 }).toBe("0");
      await expect.poll(() => root.getAttribute(prototypeCountAttribute), { timeout: 20_000 }).toBe("0");

      // Installing/enabling another background script forces parent → sandbox lifecycle traffic.
      // With the old WindowMessage carrier the spy sees those envelopes on the global message bus.
      await installScriptByCode(context, extensionId, victimCode);
      await enableBackgroundScript(context, extensionId, victimName);

      // Wait for a real completion signal from the victim rather than sleeping. If any internal
      // envelope leaked onto Window.message, the spy writes the non-zero count directly from
      // its message handler, so victim-ready + count=0 proves lifecycle traffic stayed private.
      await expect(root).toHaveAttribute(victimReadyAttribute, "true", { timeout: 20_000 });
      await expect.poll(() => root.getAttribute(countAttribute), { timeout: 5_000 }).toBe("0");
      await expect.poll(() => root.getAttribute(prototypeCountAttribute), { timeout: 5_000 }).toBe("0");
    } finally {
      await page.close();
    }
  });
});
