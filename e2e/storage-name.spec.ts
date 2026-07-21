import { randomUUID } from "crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { testWithUserScripts as test, expect } from "./fixtures";
import { autoApprovePermissions, installScriptByCode, openOptionsPage } from "./utils";

const TARGET_ORIGIN = "http://storage-name.test";

type ScriptIdentity = {
  name: string;
  uuid: string;
  storageNames: string[];
};

type ScriptActionResponse<T> = {
  code?: number;
  data?: T;
  message?: string;
};

type SharedReadResult = {
  ok: boolean;
  asyncReadOfSyncWrite?: string;
  syncReadOfAsyncWrite?: string;
  error?: string;
};

type RemoteChangeResult = {
  name: string;
  oldValue: string | null;
  newValue: string;
  remote: boolean;
};

type WriterResult = {
  ok: boolean;
  error?: string;
};

type SharedScriptPair = {
  token: string;
  storageName: string;
  syncKey: string;
  asyncKey: string;
  syncValue: string;
  asyncValue: string;
  writerName: string;
  readerName: string;
  writeEvent: string;
  readEvent: string;
  writerReadyAttribute: string;
  readerReadyAttribute: string;
  writerResultAttribute: string;
  readerResultAttribute: string;
  remoteChangeAttribute: string;
  writerCode: string;
  readerCode: string;
};

async function serveTargetPage(context: BrowserContext): Promise<void> {
  await context.route(`${TARGET_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><head><title>storageName E2E</title></head><body></body></html>",
    })
  );
}

function createSharedScriptPair(): SharedScriptPair {
  const token = randomUUID().replaceAll("-", "");
  const storageName = `scriptcat-e2e-storage-${token}`;
  const syncKey = `sync-${token}`;
  const asyncKey = `async-${token}`;
  const syncValue = `sync-value-${token}`;
  const asyncValue = `async-value-${token}`;
  const writerName = `E2E storageName writer ${token}`;
  const readerName = `E2E storageName reader ${token}`;
  const writeEvent = `scriptcat-e2e-${token}-write`;
  const readEvent = `scriptcat-e2e-${token}-read`;
  const writerReadyAttribute = `data-sc-${token}-writer-ready`;
  const readerReadyAttribute = `data-sc-${token}-reader-ready`;
  const writerResultAttribute = `data-sc-${token}-writer-result`;
  const readerResultAttribute = `data-sc-${token}-reader-result`;
  const remoteChangeAttribute = `data-sc-${token}-remote-change`;

  const writerCode = `// ==UserScript==
// @name         ${writerName}
// @namespace    https://e2e.scriptcat.test/${token}/writer
// @version      1.0.0
// @match        ${TARGET_ORIGIN}/*
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM.setValue
// @storageName  ${storageName}
// ==/UserScript==

const setWriterMarker = (name, value) => {
  const apply = () => document.documentElement?.setAttribute(name, value);
  if (document.documentElement) apply();
  else document.addEventListener("DOMContentLoaded", apply, { once: true });
};

document.addEventListener(
  ${JSON.stringify(writeEvent)},
  async () => {
    try {
      GM_setValue(${JSON.stringify(syncKey)}, ${JSON.stringify(syncValue)});
      await GM.setValue(${JSON.stringify(asyncKey)}, ${JSON.stringify(asyncValue)});
      setWriterMarker(${JSON.stringify(writerResultAttribute)}, JSON.stringify({ ok: true }));
    } catch (error) {
      setWriterMarker(
        ${JSON.stringify(writerResultAttribute)},
        JSON.stringify({ ok: false, error: String(error) }),
      );
    }
  },
  { once: true },
);

setWriterMarker(${JSON.stringify(writerReadyAttribute)}, "true");
`;

  const readerCode = `// ==UserScript==
// @name         ${readerName}
// @namespace    https://e2e.scriptcat.test/${token}/reader
// @version      1.0.0
// @match        ${TARGET_ORIGIN}/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM.getValue
// @grant        GM_addValueChangeListener
// @storageName  ${storageName}
// ==/UserScript==

const setReaderMarker = (name, value) => {
  const apply = () => document.documentElement?.setAttribute(name, value);
  if (document.documentElement) apply();
  else document.addEventListener("DOMContentLoaded", apply, { once: true });
};

GM_addValueChangeListener(${JSON.stringify(asyncKey)}, (name, oldValue, newValue, remote) => {
  setReaderMarker(
    ${JSON.stringify(remoteChangeAttribute)},
    JSON.stringify({
      name,
      oldValue: oldValue === undefined ? null : oldValue,
      newValue,
      remote,
    }),
  );
});

document.addEventListener(${JSON.stringify(readEvent)}, async () => {
  try {
    setReaderMarker(
      ${JSON.stringify(readerResultAttribute)},
      JSON.stringify({
        ok: true,
        asyncReadOfSyncWrite: await GM.getValue(${JSON.stringify(syncKey)}, "missing"),
        syncReadOfAsyncWrite: GM_getValue(${JSON.stringify(asyncKey)}, "missing"),
      }),
    );
  } catch (error) {
    setReaderMarker(
      ${JSON.stringify(readerResultAttribute)},
      JSON.stringify({ ok: false, error: String(error) }),
    );
  }
});

setReaderMarker(${JSON.stringify(readerReadyAttribute)}, "true");
`;

  return {
    token,
    storageName,
    syncKey,
    asyncKey,
    syncValue,
    asyncValue,
    writerName,
    readerName,
    writeEvent,
    readEvent,
    writerReadyAttribute,
    readerReadyAttribute,
    writerResultAttribute,
    readerResultAttribute,
    remoteChangeAttribute,
    writerCode,
    readerCode,
  };
}

async function readScriptIdentities(page: Page, names: string[]): Promise<ScriptIdentity[]> {
  return page.evaluate(async (expectedNames) => {
    type InstalledScript = {
      name: string;
      uuid: string;
      metadata?: { storagename?: string[] };
    };

    const response = (await chrome.runtime.sendMessage({
      action: "serviceWorker/script/getAllScripts",
    })) as ScriptActionResponse<InstalledScript[]>;
    if (!response || response.code) {
      throw new Error(`读取已安装脚本失败: ${response?.message || "无响应"}`);
    }

    return (response.data || [])
      .filter((script) => expectedNames.includes(script.name))
      .map((script) => ({
        name: script.name,
        uuid: script.uuid,
        storageNames: script.metadata?.storagename || [],
      }));
  }, names);
}

async function installSharedScriptPair(
  context: BrowserContext,
  extensionId: string,
  pair: SharedScriptPair
): Promise<ScriptIdentity[]> {
  await installScriptByCode(context, extensionId, pair.writerCode);
  await installScriptByCode(context, extensionId, pair.readerCode);
  autoApprovePermissions(context);

  const optionsPage = await openOptionsPage(context, extensionId);
  try {
    return await readScriptIdentities(optionsPage, [pair.writerName, pair.readerName]);
  } finally {
    await optionsPage.close();
  }
}

function assertSharedMetadataUsesDifferentIdentities(identities: ScriptIdentity[], pair: SharedScriptPair): void {
  expect(identities).toHaveLength(2);
  const writer = identities.find((script) => script.name === pair.writerName);
  const reader = identities.find((script) => script.name === pair.readerName);
  expect(writer, "未找到 storageName 写入脚本").toBeDefined();
  expect(reader, "未找到 storageName 读取脚本").toBeDefined();
  expect(writer!.storageNames).toEqual([pair.storageName]);
  expect(reader!.storageNames).toEqual([pair.storageName]);
  expect(writer!.uuid).not.toBe(reader!.uuid);
}

async function waitForReady(page: Page, pair: SharedScriptPair, includeWriter: boolean): Promise<void> {
  const root = page.locator("html");
  await expect(root).toHaveAttribute(pair.readerReadyAttribute, "true", { timeout: 20_000 });
  if (includeWriter) {
    await expect(root).toHaveAttribute(pair.writerReadyAttribute, "true", { timeout: 20_000 });
  }
}

async function waitForJsonAttribute<T>(page: Page, attribute: string): Promise<T> {
  const root = page.locator("html");
  await expect.poll(() => root.getAttribute(attribute), { timeout: 20_000, intervals: [100, 250, 500] }).not.toBeNull();
  const serialized = await root.getAttribute(attribute);
  if (serialized === null) throw new Error(`页面未写入 ${attribute}`);
  return JSON.parse(serialized) as T;
}

async function triggerWrite(page: Page, pair: SharedScriptPair): Promise<void> {
  await page.evaluate((eventName) => document.dispatchEvent(new Event(eventName)), pair.writeEvent);
  const result = await waitForJsonAttribute<WriterResult>(page, pair.writerResultAttribute);
  expect(result).toEqual({ ok: true });
}

async function readSharedValues(page: Page, pair: SharedScriptPair): Promise<SharedReadResult> {
  await page.evaluate((eventName) => document.dispatchEvent(new Event(eventName)), pair.readEvent);
  return waitForJsonAttribute<SharedReadResult>(page, pair.readerResultAttribute);
}

async function deleteAndPurgeScript(page: Page, uuid: string): Promise<void> {
  // 使用 options 页产品代码调用的同一消息端点，覆盖真实 SW 删除链路且不依赖界面语言。
  const results = await page.evaluate(async (scriptUuid) => {
    const send = (action: string) =>
      chrome.runtime.sendMessage({ action, data: [scriptUuid] }) as Promise<ScriptActionResponse<boolean>>;
    return {
      deleted: await send("serviceWorker/script/deletes"),
      purged: await send("serviceWorker/script/purges"),
    };
  }, uuid);

  expect(results.deleted.code || 0, results.deleted.message).toBe(0);
  expect(results.deleted.data).toBe(true);
  expect(results.purged.code || 0, results.purged.message).toBe(0);
  expect(results.purged.data).toBe(true);
}

test.describe("@storageName 真实浏览器共享存储", () => {
  test.setTimeout(180_000);

  test("两个不同 UUID 的普通脚本应共享同步与异步值，并报告远程变更", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createSharedScriptPair();
    const identities = await installSharedScriptPair(context, extensionId, pair);
    assertSharedMetadataUsesDifferentIdentities(identities, pair);

    const page = await context.newPage();
    try {
      await page.goto(`${TARGET_ORIGIN}/page?shared=${pair.token}`, { waitUntil: "domcontentloaded" });
      await waitForReady(page, pair, true);
      await triggerWrite(page, pair);

      const remoteChange = await waitForJsonAttribute<RemoteChangeResult>(page, pair.remoteChangeAttribute);
      expect(remoteChange).toEqual({
        name: pair.asyncKey,
        oldValue: null,
        newValue: pair.asyncValue,
        remote: true,
      });
      await expect(readSharedValues(page, pair)).resolves.toEqual({
        ok: true,
        asyncReadOfSyncWrite: pair.syncValue,
        syncReadOfAsyncWrite: pair.asyncValue,
      });
    } finally {
      await page.close();
    }
  });

  test("彻底删除写入脚本后，另一个共享脚本应在新页面继续读取值", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createSharedScriptPair();
    const identities = await installSharedScriptPair(context, extensionId, pair);
    assertSharedMetadataUsesDifferentIdentities(identities, pair);

    const writer = identities.find((script) => script.name === pair.writerName)!;
    const initialPage = await context.newPage();
    try {
      await initialPage.goto(`${TARGET_ORIGIN}/page?before-purge=${pair.token}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForReady(initialPage, pair, true);
      await triggerWrite(initialPage, pair);
      await expect(readSharedValues(initialPage, pair)).resolves.toEqual({
        ok: true,
        asyncReadOfSyncWrite: pair.syncValue,
        syncReadOfAsyncWrite: pair.asyncValue,
      });
    } finally {
      await initialPage.close();
    }

    const optionsPage = await openOptionsPage(context, extensionId);
    try {
      await deleteAndPurgeScript(optionsPage, writer.uuid);
      await expect
        .poll(() => readScriptIdentities(optionsPage, [pair.writerName, pair.readerName]))
        .toEqual([expect.objectContaining({ name: pair.readerName, storageNames: [pair.storageName] })]);
    } finally {
      await optionsPage.close();
    }

    const reloadedPage = await context.newPage();
    try {
      await reloadedPage.goto(`${TARGET_ORIGIN}/page?after-purge=${pair.token}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForReady(reloadedPage, pair, false);
      await expect(readSharedValues(reloadedPage, pair)).resolves.toEqual({
        ok: true,
        asyncReadOfSyncWrite: pair.syncValue,
        syncReadOfAsyncWrite: pair.asyncValue,
      });
    } finally {
      await reloadedPage.close();
    }
  });
});
