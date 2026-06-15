import fs from "fs";
import { execFileSync } from "child_process";
import os from "os";
import path from "path";
import { test as base, chromium, firefox, type BrowserContext } from "@playwright/test";

const pathToExtension = path.resolve(__dirname, "../dist/ext");
const packageInfo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8")) as {
  name: string;
  version: string;
};
let firefoxExtensionDir: string | undefined;
let firefoxExtensionOrigin: string | undefined;

function getProxyOptions() {
  const proxy =
    process.env.E2E_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  return proxy ? { proxy: { server: proxy } } : {};
}

const chromeArgs = [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`];

type E2EMockScript = {
  uuid: string;
  name: string;
  namespace: string;
  sort: number;
  enabled: boolean;
  metadata: Record<string, string[]>;
  createtime: number;
  updatetime: number;
};

function parseMockScript(code: string, index: number): E2EMockScript {
  const now = Date.now();
  const readMeta = (key: string, fallback = "") => {
    const match = code.match(new RegExp(`^//\\\\s*@${key}\\\\s+(.+)$`, "m"));
    return match?.[1]?.trim() || fallback;
  };
  const name = readMeta("name", "E2E Test Script");
  const namespace = readMeta("namespace", "https://e2e.test");
  const version = readMeta("version", "1.0.0");
  const description = readMeta("description", "");
  const match = readMeta("match", "https://example.com/*");

  return {
    uuid: `firefox-e2e-script-${index}`,
    name,
    namespace,
    sort: index,
    enabled: true,
    metadata: {
      name: [name],
      namespace: [namespace],
      version: [version],
      description: [description],
      match: [match],
    },
    createtime: now,
    updatetime: now,
  };
}

function createFirefoxMockMessageHandler(storage: Record<string, unknown>) {
  const scripts: E2EMockScript[] = [];
  const upsertScript = (script: E2EMockScript, code: string) => {
    const index = scripts.findIndex((item) => item.uuid === script.uuid);
    if (index >= 0) {
      scripts[index] = script;
    } else {
      scripts.push(script);
    }
    storage[`script:${script.uuid}`] = script;
    storage[`scriptCode:${script.uuid}`] = { uuid: script.uuid, code };
  };

  return async (message: { action?: string; data?: any }) => {
    const action = message?.action || message?.data?.action || "";
    const data = message?.data;

    if (action === "serviceWorker/script/getAllScripts") return { code: 0, data: scripts };
    if (action === "serviceWorker/script/installByCode") {
      const script = parseMockScript(data?.code || "", scripts.length);
      upsertScript(script, data?.code || "");
      return { code: 0, data: script };
    }
    if (action === "serviceWorker/script/install") {
      const script = data?.script || parseMockScript(data?.code || "", scripts.length);
      upsertScript(script, data?.code || "");
      return { code: 0, data: { update: false, updatetime: script.updatetime } };
    }
    if (action === "serviceWorker/script/enables") {
      for (const script of scripts) {
        if (data?.uuids?.includes(script.uuid)) script.enabled = Boolean(data.enable);
      }
      return { code: 0, data: true };
    }
    if (action === "serviceWorker/script/enable") {
      const script = scripts.find((item) => item.uuid === data?.uuid);
      if (script) script.enabled = Boolean(data.enable);
      const storedScript = storage[`script:${data?.uuid}`];
      if (storedScript && typeof storedScript === "object") {
        Object.assign(storedScript, { status: data.enable ? 1 : 2 });
      }
      return { code: 0, data: true };
    }
    if (action === "serviceWorker/script/deletes") {
      for (const uuid of data || []) {
        const index = scripts.findIndex((script) => script.uuid === uuid);
        if (index >= 0) scripts.splice(index, 1);
        delete storage[`script:${uuid}`];
        delete storage[`scriptCode:${uuid}`];
      }
      return { code: 0, data: true };
    }
    if (action === "serviceWorker/script/getPopupData") {
      return { code: 0, data: { enableScript: true, current: [], background: scripts, menu: [] } };
    }
    if (action === "serviceWorker/getConfig") return { code: 0, data: storage[data] };
    if (action === "serviceWorker/setConfig") {
      storage[data?.key] = data?.value;
      return { code: 0, data: true };
    }
    if (action.startsWith("serviceWorker/agent/")) return { code: 0, data: [] };
    return { code: 0, data: action.includes("get") || action.includes("list") ? [] : true };
  };
}

async function installFirefoxPageMocks(context: BrowserContext, extensionDir: string): Promise<void> {
  const storageData: Record<string, unknown> = {};
  const handleMessage = createFirefoxMockMessageHandler(storageData);
  await context.exposeBinding("__scriptcatE2EMessage", async (_source, message) => handleMessage(message));
  await context.exposeBinding(
    "__scriptcatE2EStorage",
    async (_source, operation: string, payload?: string | string[] | Record<string, unknown>) => {
      if (operation === "get") {
        if (!payload) return { ...storageData };
        if (typeof payload === "string") return { [payload]: storageData[payload] };
        if (Array.isArray(payload)) {
          const result: Record<string, unknown> = {};
          payload.forEach((key) => (result[key] = storageData[key]));
          return result;
        }
        const result = { ...payload };
        Object.keys(payload).forEach((key) => {
          if (key in storageData) result[key] = storageData[key];
        });
        return result;
      }
      if (operation === "set" && payload && typeof payload === "object" && !Array.isArray(payload)) {
        Object.assign(storageData, payload);
        return undefined;
      }
      if (operation === "remove") {
        for (const key of Array.isArray(payload) ? payload : [payload]) {
          if (typeof key === "string") delete storageData[key];
        }
        return undefined;
      }
      if (operation === "clear") {
        Object.keys(storageData).forEach((key) => delete storageData[key]);
      }
      return undefined;
    }
  );
  await context.addInitScript(
    ({ baseUrl }) => {
      localStorage.setItem("firstUse", "false");
      const callbacks = new Set<(...args: any[]) => void>();
      const runtimeMessageListeners = new Set<(...args: any[]) => void>();
      const publishMessageQueue = (topic: string, message: unknown) => {
        const payload = { msgQueue: topic, data: { action: "message", message } };
        runtimeMessageListeners.forEach((listener) => listener(payload, undefined, () => undefined));
      };
      const storageArea = {
        get(keys?: any, callback?: (result: Record<string, unknown>) => void) {
          if (typeof keys === "function") {
            callback = keys;
            keys = undefined;
          }
          const promise = (globalThis as any).__scriptcatE2EStorage("get", keys) as Promise<Record<string, unknown>>;
          promise.then((result) => callback?.(result));
          return promise;
        },
        set(items: Record<string, unknown>, callback?: () => void) {
          const promise = (globalThis as any).__scriptcatE2EStorage("set", items) as Promise<void>;
          promise.then(() => callback?.());
          return promise;
        },
        remove(keys: string | string[], callback?: () => void) {
          const promise = (globalThis as any).__scriptcatE2EStorage("remove", keys) as Promise<void>;
          promise.then(() => callback?.());
          return promise;
        },
        clear(callback?: () => void) {
          const promise = (globalThis as any).__scriptcatE2EStorage("clear") as Promise<void>;
          promise.then(() => callback?.());
          return promise;
        },
        getBytesInUse(_keys?: unknown, callback?: (bytes: number) => void) {
          callback?.(0);
          return Promise.resolve(0);
        },
        onChanged: { addListener() {}, removeListener() {} },
      };
      const respond = async (message: unknown, callback?: (response: unknown) => void) => {
        const response = await (globalThis as any).__scriptcatE2EMessage(message);
        callback?.(response);
        const action = (message as { action?: string })?.action || "";
        const data = (message as { data?: any })?.data;
        if (action === "serviceWorker/script/install" && data?.script) {
          publishMessageQueue("installScript", { script: data.script, update: false });
        }
        if (action === "serviceWorker/script/enable") {
          publishMessageQueue("enableScripts", [{ uuid: data?.uuid, enable: data?.enable }]);
        }
        if (action === "serviceWorker/script/deletes") {
          publishMessageQueue(
            "deleteScripts",
            (Array.isArray(data) ? data : []).map((uuid: string) => ({ uuid }))
          );
        }
        return response;
      };
      const chromeMock = {
        extension: { inIncognitoContext: false },
        i18n: {
          getMessage(key: string) {
            return key;
          },
          getUILanguage() {
            return "en-US";
          },
          getAcceptLanguages(callback?: (languages: string[]) => void) {
            callback?.(["en-US"]);
            return Promise.resolve(["en-US"]);
          },
        },
        runtime: {
          lastError: undefined,
          id: "scriptcat-firefox-file-e2e",
          getURL(filePath: string) {
            return `${baseUrl}/${filePath.replace(/^\/+/, "")}`;
          },
          getManifest() {
            return { manifest_version: 3, permissions: [], optional_permissions: [] };
          },
          reload() {},
          sendMessage(message: unknown, callback?: (response: unknown) => void) {
            void respond(message, callback);
          },
          connect() {
            return {
              name: "",
              sender: undefined,
              onMessage: {
                addListener(listener: (...args: any[]) => void) {
                  callbacks.add(listener);
                },
                removeListener(listener: (...args: any[]) => void) {
                  callbacks.delete(listener);
                },
              },
              onDisconnect: { addListener() {}, removeListener() {} },
              postMessage(message: unknown) {
                callbacks.forEach((listener) => listener(message));
              },
              disconnect() {},
            };
          },
          onMessage: {
            addListener(listener: (...args: any[]) => void) {
              runtimeMessageListeners.add(listener);
            },
            removeListener(listener: (...args: any[]) => void) {
              runtimeMessageListeners.delete(listener);
            },
          },
          onConnect: { addListener() {}, removeListener() {} },
        },
        storage: { local: storageArea, sync: storageArea, session: storageArea },
        permissions: {
          contains(_permissions: unknown, callback?: (result: boolean) => void) {
            callback?.(true);
          },
          request(_permissions: unknown, callback?: (result: boolean) => void) {
            callback?.(true);
          },
          remove(_permissions: unknown, callback?: (result: boolean) => void) {
            callback?.(true);
          },
          onAdded: { addListener() {}, removeListener() {} },
          onRemoved: { addListener() {}, removeListener() {} },
        },
        tabs: {
          query(_query: unknown, callback?: (tabs: unknown[]) => void) {
            callback?.([]);
          },
          create(createProperties: unknown, callback?: (tab: unknown) => void) {
            callback?.({ id: 1, ...(createProperties as object) });
          },
          sendMessage(_tabId: number, message: unknown, callback?: (response: unknown) => void) {
            void respond(message, callback);
          },
          onActivated: { addListener() {}, removeListener() {} },
          onUpdated: { addListener() {}, removeListener() {} },
          onRemoved: { addListener() {}, removeListener() {} },
        },
        action: {
          setIcon(_details: unknown, callback?: () => void) {
            callback?.();
          },
        },
        contextMenus: {
          create() {},
          removeAll(callback?: () => void) {
            callback?.();
          },
        },
        notifications: {
          create(_id: string, _options: unknown, callback?: (id: string) => void) {
            callback?.("mock");
          },
          clear(_id: string, callback?: () => void) {
            callback?.();
          },
        },
      };
      (globalThis as any).chrome = chromeMock;
      (globalThis as any).browser = chromeMock;
    },
    { baseUrl: `file://${extensionDir}` }
  );
}

function ensureFirefoxExtensionDir(): string {
  if (firefoxExtensionDir) return firefoxExtensionDir;

  const zipPath = path.resolve(__dirname, `../dist/${packageInfo.name}-v${packageInfo.version}-firefox.zip`);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Firefox extension package not found: ${zipPath}. Run PACK_FIREFOX=true pnpm run pack first.`);
  }

  firefoxExtensionDir = fs.mkdtempSync(path.join(os.tmpdir(), "scriptcat-firefox-ext-"));
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", firefoxExtensionDir], { stdio: "ignore" });
  return firefoxExtensionDir;
}

/**
 * 简单启动 fixture — 不需要 userScripts 的测试使用
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (process.env.E2E_BROWSER === "firefox") {
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ff-ext-"));
      const extensionDir = ensureFirefoxExtensionDir();
      const context = await firefox.launchPersistentContext(userDataDir, {
        headless: true,
        ...getProxyOptions(),
      });
      await installFirefoxPageMocks(context, extensionDir);
      firefoxExtensionOrigin = `file://${extensionDir}`;
      await use(context);
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
      return;
    }

    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      ...getProxyOptions(),
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    if (process.env.E2E_BROWSER === "firefox") {
      if (!firefoxExtensionOrigin) {
        throw new Error("Unable to resolve Firefox extension origin");
      }
      await use(firefoxExtensionOrigin);
      return;
    }

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }
    const extensionId = background.url().split("/")[2];

    // Dismiss the first-use guide by navigating to the options page and setting localStorage,
    // then reload to apply the change before any tests run.
    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/src/options.html`);
    await initPage.waitForLoadState("domcontentloaded");
    await initPage.evaluate(() => {
      localStorage.setItem("firstUse", "false");
    });
    await initPage.close();

    await use(extensionId);
  },
});

export const expect = test.expect;

/**
 * 两阶段启动 fixture — 需要 userScripts 权限的测试使用
 *
 * Phase 1: 启动浏览器 → 启用 userScripts 权限 → 关闭
 * Phase 2: 重新启动浏览器（权限已持久化）
 */
export const testWithUserScripts = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-"));

    // Phase 1: 启用 userScripts 权限
    const ctx1 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
    });
    let [bg] = ctx1.serviceWorkers();
    if (!bg) bg = await ctx1.waitForEvent("serviceworker", { timeout: 30_000 });
    const extensionId = bg.url().split("/")[2];
    const extPage = await ctx1.newPage();
    await extPage.goto("chrome://extensions/");
    await extPage.waitForLoadState("domcontentloaded");
    await extPage.waitForFunction(() => !!(chrome as any).developerPrivate, { timeout: 10_000 });
    await extPage.evaluate(async (id) => {
      await (chrome as any).developerPrivate.updateExtensionConfiguration({
        extensionId: id,
        userScriptsAccess: true,
      });
    }, extensionId);
    await extPage.close();
    await ctx1.close();

    // Phase 2: 重新启动，userScripts 权限已持久化
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      ...getProxyOptions(),
    });
    const [sw] = context.serviceWorkers();
    if (!sw) await context.waitForEvent("serviceworker", { timeout: 30_000 });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");
    const extensionId = background.url().split("/")[2];

    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/src/options.html`);
    await initPage.waitForLoadState("domcontentloaded");
    await initPage.evaluate(() => localStorage.setItem("firstUse", "false"));
    await initPage.close();

    await use(extensionId);
  },
});
