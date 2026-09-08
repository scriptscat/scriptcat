import { randomUUID } from "crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { testWithUserScripts as test, expect } from "./fixtures";
import { autoApprovePermissions, installScriptByCode, openOptionsPage } from "./utils";

const TARGET_ORIGIN = "http://storage-name.test";

type ScriptIdentity = {
  name: string;
  uuid: string;
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
  backgroundName: string;
  runEvent: string;
  readyAttribute: string;
  resultAttribute: string;
  backgroundCode: string;
  foregroundCode: string;
};

type StorageReaderScript = {
  name: string;
  readEvent: string;
  readyAttribute: string;
  resultAttribute: string;
  remoteChangeAttribute: string;
  code: string;
};

type SharedScriptPair = {
  token: string;
  storageName: string;
  syncKey: string;
  asyncKey: string;
  syncValue: string;
  asyncValue: string;
  writerName: string;
  writeEvent: string;
  writerReadyAttribute: string;
  writerResultAttribute: string;
  writerCode: string;
  reader: StorageReaderScript;
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

function createStorageReaderScript(options: {
  token: string;
  role: "shared" | "isolated";
  storageName: string;
  syncKey: string;
  asyncKey: string;
}): StorageReaderScript {
  const { token, role, storageName, syncKey, asyncKey } = options;
  const name = `E2E storageName ${role} reader ${token}`;
  const readEvent = `scriptcat-e2e-${token}-${role}-read`;
  const readyAttribute = `data-sc-${token}-${role}-reader-ready`;
  const resultAttribute = `data-sc-${token}-${role}-reader-result`;
  const remoteChangeAttribute = `data-sc-${token}-${role}-remote-change`;
  const code = `// ==UserScript==
// @name         ${name}
// @namespace    https://e2e.scriptcat.test/${token}/${role}-reader
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
      ${JSON.stringify(resultAttribute)},
      JSON.stringify({
        ok: true,
        asyncReadOfSyncWrite: await GM.getValue(${JSON.stringify(syncKey)}, "missing"),
        syncReadOfAsyncWrite: GM_getValue(${JSON.stringify(asyncKey)}, "missing"),
      }),
    );
  } catch (error) {
    setReaderMarker(
      ${JSON.stringify(resultAttribute)},
      JSON.stringify({ ok: false, error: String(error) }),
    );
  }
});

setReaderMarker(${JSON.stringify(readyAttribute)}, "true");
`;

  return { name, readEvent, readyAttribute, resultAttribute, remoteChangeAttribute, code };
}

function createSharedScriptPair(): SharedScriptPair {
  const token = randomUUID().replaceAll("-", "");
  const storageName = `scriptcat-e2e-storage-${token}`;
  const syncKey = `sync-${token}`;
  const asyncKey = `async-${token}`;
  const syncValue = `sync-value-${token}`;
  const asyncValue = `async-value-${token}`;
  const writerName = `E2E storageName writer ${token}`;
  const writeEvent = `scriptcat-e2e-${token}-write`;
  const writerReadyAttribute = `data-sc-${token}-writer-ready`;
  const writerResultAttribute = `data-sc-${token}-writer-result`;

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
  const reader = createStorageReaderScript({ token, role: "shared", storageName, syncKey, asyncKey });

  return {
    token,
    storageName,
    syncKey,
    asyncKey,
    syncValue,
    asyncValue,
    writerName,
    writeEvent,
    writerReadyAttribute,
    writerResultAttribute,
    writerCode,
    reader,
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

let backgroundReady = false;
const markBackgroundReady = (value) => {
  if (backgroundReady || value !== ${JSON.stringify(backgroundValue)}) return;
  backgroundReady = true;
  setMarker(${JSON.stringify(readyAttribute)}, "true");
};

GM_addValueChangeListener(${JSON.stringify(backgroundKey)}, (name, oldValue, newValue) => {
  markBackgroundReady(newValue);
});
markBackgroundReady(GM_getValue(${JSON.stringify(backgroundKey)}, "missing"));

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
`;

  return {
    token,
    backgroundName,
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
      }));
  }, names);
}

async function installSharedScripts(
  context: BrowserContext,
  extensionId: string,
  pair: SharedScriptPair,
  readers: StorageReaderScript[] = [pair.reader]
): Promise<void> {
  await installScriptByCode(context, extensionId, pair.writerCode);
  for (const reader of readers) await installScriptByCode(context, extensionId, reader.code);
  autoApprovePermissions(context);
}

async function installCrossContextScriptPair(
  context: BrowserContext,
  extensionId: string,
  pair: CrossContextScriptPair
): Promise<void> {
  await installScriptByCode(context, extensionId, pair.backgroundCode);
  await installScriptByCode(context, extensionId, pair.foregroundCode);
  autoApprovePermissions(context);

  const optionsPage = await openOptionsPage(context, extensionId);
  try {
    const identities = await readScriptIdentities(optionsPage, [pair.backgroundName]);
    const background = identities.find((script) => script.name === pair.backgroundName);
    expect(background, "未找到 storageName 后台脚本").toBeDefined();
    const response = await optionsPage.evaluate(async (uuid) => {
      return chrome.runtime.sendMessage({
        action: "serviceWorker/script/enable",
        data: { uuid, enable: true },
      }) as Promise<ScriptActionResponse<Record<string, never>>>;
    }, background!.uuid);
    expect(response.code || 0, response.message).toBe(0);
  } finally {
    await optionsPage.close();
  }
}

async function waitForReady(
  page: Page,
  pair: SharedScriptPair,
  readers: StorageReaderScript[],
  includeWriter: boolean
): Promise<void> {
  const root = page.locator("html");
  for (const reader of readers) {
    await expect(root).toHaveAttribute(reader.readyAttribute, "true", { timeout: 20_000 });
  }
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

async function readStorageValues(page: Page, reader: StorageReaderScript): Promise<SharedReadResult> {
  await page.evaluate((eventName) => document.dispatchEvent(new Event(eventName)), reader.readEvent);
  return waitForJsonAttribute<SharedReadResult>(page, reader.resultAttribute);
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

  test("普通脚本应按 storageName 共享或隔离值与变更事件", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createSharedScriptPair();
    const isolatedReader = createStorageReaderScript({
      token: pair.token,
      role: "isolated",
      storageName: `scriptcat-e2e-isolated-${pair.token}`,
      syncKey: pair.syncKey,
      asyncKey: pair.asyncKey,
    });
    await installSharedScripts(context, extensionId, pair, [pair.reader, isolatedReader]);

    const page = await context.newPage();
    try {
      await page.goto(`${TARGET_ORIGIN}/page?shared-and-isolated=${pair.token}`, { waitUntil: "domcontentloaded" });
      await waitForReady(page, pair, [pair.reader, isolatedReader], true);

      await test.step("writer 一次写入同步与异步值", async () => {
        await triggerWrite(page, pair);
      });

      await test.step("相同 storageName reader 交叉读取并收到远程变更", async () => {
        const remoteChange = await waitForJsonAttribute<RemoteChangeResult>(page, pair.reader.remoteChangeAttribute);
        expect(remoteChange).toEqual({
          name: pair.asyncKey,
          oldValue: null,
          newValue: pair.asyncValue,
          remote: true,
        });
        await expect(readStorageValues(page, pair.reader)).resolves.toEqual({
          ok: true,
          asyncReadOfSyncWrite: pair.syncValue,
          syncReadOfAsyncWrite: pair.asyncValue,
        });
      });

      await test.step("不同 storageName reader 读取 missing 且不收到变更标记", async () => {
        await expect(readStorageValues(page, isolatedReader)).resolves.toEqual({
          ok: true,
          asyncReadOfSyncWrite: "missing",
          syncReadOfAsyncWrite: "missing",
        });
        // shared marker 与 isolated reader 的异步读取均已完成，无需用固定长等待证明隔离事件不存在。
        expect(await page.locator("html").getAttribute(isolatedReader.remoteChangeAttribute)).toBeNull();
      });
    } finally {
      await page.close();
    }
  });

  test("后台脚本与前台脚本应跨运行环境双向共享值，并报告远程变更", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createCrossContextScriptPair();
    await installCrossContextScriptPair(context, extensionId, pair);

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

  test("storageName owner 应在 2→1→0 生命周期中保留并最终清理共享值", async ({ context, extensionId }) => {
    await serveTargetPage(context);
    const pair = createSharedScriptPair();

    const owners = await test.step("seed：两个 owner 写入并读回共享值", async () => {
      await installSharedScripts(context, extensionId, pair);

      const optionsPage = await openOptionsPage(context, extensionId);
      let identities: ScriptIdentity[];
      try {
        identities = await readScriptIdentities(optionsPage, [pair.writerName, pair.reader.name]);
      } finally {
        await optionsPage.close();
      }
      const writer = identities.find((script) => script.name === pair.writerName);
      const reader = identities.find((script) => script.name === pair.reader.name);
      expect(writer, "未找到 storageName 写入脚本").toBeDefined();
      expect(reader, "未找到 storageName 读取脚本").toBeDefined();

      const seedPage = await context.newPage();
      try {
        await seedPage.goto(`${TARGET_ORIGIN}/page?seed=${pair.token}`, { waitUntil: "domcontentloaded" });
        await waitForReady(seedPage, pair, [pair.reader], true);
        await triggerWrite(seedPage, pair);
        await expect(readStorageValues(seedPage, pair.reader)).resolves.toEqual({
          ok: true,
          asyncReadOfSyncWrite: pair.syncValue,
          syncReadOfAsyncWrite: pair.asyncValue,
        });
      } finally {
        await seedPage.close();
      }

      return { writer: writer!, reader: reader! };
    });

    await test.step("2→1 owner：purge writer 后 restore reader 仍保留旧值", async () => {
      const optionsPage = await openOptionsPage(context, extensionId);
      try {
        expect(await runScriptAction<boolean>(optionsPage, "deletes", [owners.writer.uuid, owners.reader.uuid])).toBe(
          true
        );
        expect(await runScriptAction<boolean>(optionsPage, "purges", [owners.writer.uuid])).toBe(true);
        await expect.poll(() => readScriptIdentities(optionsPage, [pair.writerName, pair.reader.name])).toEqual([]);
        const restore = await runScriptAction<{ restored: string[]; conflicts: unknown[] }>(optionsPage, "restores", [
          owners.reader.uuid,
        ]);
        expect(restore).toEqual({ restored: [owners.reader.uuid], conflicts: [] });
        await expect
          .poll(() => readScriptIdentities(optionsPage, [pair.writerName, pair.reader.name]))
          .toEqual([expect.objectContaining({ name: pair.reader.name })]);
      } finally {
        await optionsPage.close();
      }

      const restoredPage = await context.newPage();
      try {
        await restoredPage.goto(`${TARGET_ORIGIN}/page?one-owner=${pair.token}`, {
          waitUntil: "domcontentloaded",
        });
        await waitForReady(restoredPage, pair, [pair.reader], false);
        await expect(readStorageValues(restoredPage, pair.reader)).resolves.toEqual({
          ok: true,
          asyncReadOfSyncWrite: pair.syncValue,
          syncReadOfAsyncWrite: pair.asyncValue,
        });
      } finally {
        await restoredPage.close();
      }
    });

    await test.step("1→0 owner：purge reader 后重装不得读到旧值", async () => {
      const optionsPage = await openOptionsPage(context, extensionId);
      try {
        expect(await runScriptAction<boolean>(optionsPage, "deletes", [owners.reader.uuid])).toBe(true);
        expect(await runScriptAction<boolean>(optionsPage, "purges", [owners.reader.uuid])).toBe(true);
        await expect.poll(() => readScriptIdentities(optionsPage, [pair.writerName, pair.reader.name])).toEqual([]);
      } finally {
        await optionsPage.close();
      }

      await installScriptByCode(context, extensionId, pair.reader.code);
      const reinstalledPage = await context.newPage();
      try {
        await reinstalledPage.goto(`${TARGET_ORIGIN}/page?zero-owners=${pair.token}`, {
          waitUntil: "domcontentloaded",
        });
        await waitForReady(reinstalledPage, pair, [pair.reader], false);
        await expect(readStorageValues(reinstalledPage, pair.reader)).resolves.toEqual({
          ok: true,
          asyncReadOfSyncWrite: "missing",
          syncReadOfAsyncWrite: "missing",
        });
      } finally {
        await reinstalledPage.close();
      }
    });
  });
});
