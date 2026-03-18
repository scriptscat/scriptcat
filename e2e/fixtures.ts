import fs from "fs";
import os from "os";
import path from "path";
import { test as base, chromium, type BrowserContext } from "@playwright/test";

const pathToExtension = path.resolve(__dirname, "../dist/ext");

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

/**
 * 简单启动 fixture — 不需要 userScripts 的测试使用
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      ...getProxyOptions(),
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
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
