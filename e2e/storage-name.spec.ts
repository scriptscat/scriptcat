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

type CrossContextResult = {
  ok: boolean;
  backgroundValue?: string;
  foregroundObservedRemote?: boolean;
  backgroundObservedRemote?: boolean;
  error?: string;
};

type CrossContextScriptPair = {
  token: string;
  storageName: string;
  backgroundName: string;
  foregroundName: string;
  runEvent: string;
  readyAttribute: string;
  resultAttribute: string;
  backgroundCode: string;
  foregroundCode: string;
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

function createSharedScriptPair(options: { storageName?: string; readerStorageName?: string } = {}): SharedScriptPair {
  const token = randomUUID().replaceAll("-", "");
  const storageName = options.storageName || `scriptcat-e2e-storage-${token}`;
  const readerStorageName = options.readerStorageName || storageName;
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
// @storageName  ${readerStorageName}
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

function createCrossContextScriptPair(): CrossContextScriptPair {
  const token = randomUUID().replaceAll("-", "");
  const storageName = `scriptcat-e2e-cross-context-${token}`;
  const backgroundName = `E2E storageName background ${token}`;
  const foregroundName = `E2E storageName foreground ${token}`;
  const backgroundKey = `background-${token}`;
  const requestKey = `request-${token}`;
  const responseKey = `response-${token}`;
  const backgroundValue = `background-value-${token}`;
  const foregroundValue = `foreground-value-${token}`;
  const runEvent = `scriptcat-e2e-${token}-cross-context`;
  const readyAttribute = `data-sc-${token}-cross-ready`;
  const resultAttribute = `data-sc-${token}-cross-result`;

  const backgroundCode = `// ==UserScript==
// @name         ${backgroundName}
// @namespace    https://e2e.scriptcat.test/${token}/background
// @version      1.0.0
// @background
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @storageName  ${storageName}
// ==/UserScript==

return new Promise(() => {
  GM_addValueChangeListener(${JSON.stringify(requestKey)}, (name, oldValue, newValue, remote) => {
    GM_setValue(
      ${JSON.stringify(responseKey)},
      JSON.stringify({ requestValue: newValue, backgroundObservedRemote: remote }),
    );
  });
  GM_setValue(${JSON.stringify(backgroundKey)}, ${JSON.stringify(backgroundValue)});
});
`;

  const foregroundCode = `// ==UserScript==
// @name         ${foregroundName}
// @namespace    https://e2e.scriptcat.test/${token}/foreground
// @version      1.0.0
// @match        ${TARGET_ORIGIN}/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @storageName  ${storageName}
// ==/UserScript==

const setMarker = (name, value) => {
  const apply = () => document.documentElement?.setAttribute(name, value);
  if (document.documentElement) apply();
  else document.addEventListener("DOMContentLoaded", apply, { once: true });
};

document.addEventListener(${JSON.stringify(runEvent)}, () => {
  try {
    const sharedBackgroundValue = GM_getValue(${JSON.stringify(backgroundKey)}, "missing");
    GM_addValueChangeListener(${JSON.stringify(responseKey)}, (name, oldValue, newValue, remote) => {
      const response = JSON.parse(newValue);
      setMarker(
        ${JSON.stringify(resultAttribute)},
        JSON.stringify({
          ok: response.requestValue === ${JSON.stringify(foregroundValue)},
          backgroundValue: sharedBackgroundValue,
          foregroundObservedRemote: remote,
          backgroundObservedRemote: response.backgroundObservedRemote,
        }),
      );
    });
    GM_setValue(${JSON.stringify(requestKey)}, ${JSON.stringify(foregroundValue)});
  } catch (error) {
    setMarker(${JSON.stringify(resultAttribute)}, JSON.stringify({ ok: false, error: String(error) }));
  }
});

setMarker(${JSON.stringify(readyAttribute)}, "true");
`;

  return {
    token,
    storageName,
    backgroundName,
    foregroundName,
    runEvent,
    readyAttribute,
    resultAttribute,
    backgroundCode,
    foregroundCode,
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

async function installCrossContextScriptPair(
  context: BrowserContext,
  extensionId: string,
  pair: CrossContextScriptPair
): Promise<ScriptIdentity[]> {
  await installScriptByCode(context, extensionId, pair.backgroundCode);
  await installScriptByCode(context, extensionId, pair.foregroundCode);
  autoApprovePermissions(context);

  const optionsPage = await openOptionsPage(context, extensionId);
  try {
    const identities = await readScriptIdentities(optionsPage, [pair.backgroundName, pair.foregroundName]);
    const background = identities.find((script) => script.name === pair.backgroundName);
    expect(background, "未找到 storageName 后台脚本").toBeDefined();
    const response = await optionsPage.evaluate(async (uuid) => {
      return chrome.runtime.sendMessage({
        action: "serviceWorker/script/enable",
        data: { uuid, enable: true },
      }) as Promise<ScriptActionResponse<Record<string, never>>>;
    }, background!.uuid);
    expect(response.code || 0, response.message).toBe(0);
    return identities;
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

async function runScriptAction<T>(page: Page, action: "deletes" | "purges" | "restores", uuids: string[]): Promise<T> {
  // 使用 options 页产品代码调用的同一消息端点，专注验证 SW 中的存储生命周期。
  const response = await page.evaluate(
    async ({ scriptAction, scriptUuids }) =>
      chrome.runtime.sendMessage({
        action: `serviceWorker/script/${scriptAction}`,
        data: scriptUuids,
      }) as Promise<ScriptActionResponse<T>>,
    { scriptAction: action, scriptUuids: uuids }
  );
  expect(response.code || 0, response.message).toBe(0);
  return response.data as T;
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

  test("后台脚本与前台脚本应跨运行环境双向共享值，并报告远程变更", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createCrossContextScriptPair();
    const identities = await installCrossContextScriptPair(context, extensionId, pair);
    expect(identities).toHaveLength(2);
    expect(identities.map((script) => script.storageNames)).toEqual([[pair.storageName], [pair.storageName]]);
    expect(new Set(identities.map((script) => script.uuid)).size).toBe(2);

    const page = await context.newPage();
    try {
      await page.goto(`${TARGET_ORIGIN}/page?cross-context=${pair.token}`, { waitUntil: "domcontentloaded" });
      const root = page.locator("html");
      await expect(root).toHaveAttribute(pair.readyAttribute, "true", { timeout: 20_000 });
      await page.evaluate((eventName) => document.dispatchEvent(new Event(eventName)), pair.runEvent);
      const result = await waitForJsonAttribute<CrossContextResult>(page, pair.resultAttribute);
      expect(result).toEqual({
        ok: true,
        backgroundValue: `background-value-${pair.token}`,
        foregroundObservedRemote: true,
        backgroundObservedRemote: true,
      });
    } finally {
      await page.close();
    }
  });

  test("不同 storageName 的脚本使用相同 key 时应严格隔离", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createSharedScriptPair({
      readerStorageName: `scriptcat-e2e-isolated-${randomUUID().replaceAll("-", "")}`,
    });
    await installSharedScriptPair(context, extensionId, pair);

    const page = await context.newPage();
    try {
      await page.goto(`${TARGET_ORIGIN}/page?isolated=${pair.token}`, { waitUntil: "domcontentloaded" });
      await waitForReady(page, pair, true);
      await triggerWrite(page, pair);
      await expect(readSharedValues(page, pair)).resolves.toEqual({
        ok: true,
        asyncReadOfSyncWrite: "missing",
        syncReadOfAsyncWrite: "missing",
      });
    } finally {
      await page.close();
    }
  });

  test("共享脚本仅剩回收站 owner 时，purge 其他脚本不得清理共享值", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createSharedScriptPair();
    const identities = await installSharedScriptPair(context, extensionId, pair);
    assertSharedMetadataUsesDifferentIdentities(identities, pair);

    const writer = identities.find((script) => script.name === pair.writerName)!;
    const reader = identities.find((script) => script.name === pair.readerName)!;
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
      expect(await runScriptAction<boolean>(optionsPage, "deletes", [writer.uuid, reader.uuid])).toBe(true);
      expect(await runScriptAction<boolean>(optionsPage, "purges", [writer.uuid])).toBe(true);
      await expect.poll(() => readScriptIdentities(optionsPage, [pair.writerName, pair.readerName])).toEqual([]);
      const restore = await runScriptAction<{ restored: string[]; conflicts: unknown[] }>(optionsPage, "restores", [
        reader.uuid,
      ]);
      expect(restore).toEqual({ restored: [reader.uuid], conflicts: [] });
      await expect
        .poll(() => readScriptIdentities(optionsPage, [pair.writerName, pair.readerName]))
        .toEqual([expect.objectContaining({ name: pair.readerName })]);
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

  test("最后一个 storageName owner 被 purge 后，后续安装的脚本不得读到旧值", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createSharedScriptPair();
    const identities = await installSharedScriptPair(context, extensionId, pair);
    assertSharedMetadataUsesDifferentIdentities(identities, pair);

    const initialPage = await context.newPage();
    try {
      await initialPage.goto(`${TARGET_ORIGIN}/page?before-final-purge=${pair.token}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForReady(initialPage, pair, true);
      await triggerWrite(initialPage, pair);
    } finally {
      await initialPage.close();
    }

    const optionsPage = await openOptionsPage(context, extensionId);
    try {
      const uuids = identities.map((script) => script.uuid);
      expect(await runScriptAction<boolean>(optionsPage, "deletes", uuids)).toBe(true);
      expect(await runScriptAction<boolean>(optionsPage, "purges", uuids)).toBe(true);
      await expect.poll(() => readScriptIdentities(optionsPage, [pair.writerName, pair.readerName])).toEqual([]);
    } finally {
      await optionsPage.close();
    }

    await installScriptByCode(context, extensionId, pair.readerCode);
    autoApprovePermissions(context);
    const reinstalledPage = await context.newPage();
    try {
      await reinstalledPage.goto(`${TARGET_ORIGIN}/page?after-final-purge=${pair.token}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForReady(reinstalledPage, pair, false);
      await expect(readSharedValues(reinstalledPage, pair)).resolves.toEqual({
        ok: true,
        asyncReadOfSyncWrite: "missing",
        syncReadOfAsyncWrite: "missing",
      });
    } finally {
      await reinstalledPage.close();
    }
  });
});
