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

function getRecordVideoOptions() {
  return process.env.E2E_RECORD_VIDEO_DIR ? { recordVideo: { dir: process.env.E2E_RECORD_VIDEO_DIR } } : {};
}

const chromeArgs = [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`];

// 预先标记「非首次使用」，避免新手引导欢迎弹窗的模态遮罩拦截测试交互。
// 用 addInitScript 在每个页面脚本执行前注入，避开持久化 profile 下「开页→写→关页」的 localStorage 落盘竞态。
function dismissOnboarding() {
  try {
    localStorage.setItem("firstUse", "false");
  } catch {
    // about:blank 等不透明来源无法访问 localStorage，忽略即可
  }
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
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      ...getProxyOptions(),
      ...getRecordVideoOptions(),
    });
    await context.addInitScript(dismissOnboarding);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }
    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },
});

export const expect = test.expect;

/**
 * 两阶段启动 fixture — 需要 userScripts 权限的测试使用
 *
 * Phase 1（worker 级，每个 worker 只做一次）：启动浏览器 → 启用 userScripts 权限 → 关闭
 * Phase 2（每个 test）：拷贝 Phase 1 的 profile 目录后重新启动（权限已持久化）
 *
 * 参照 e2e/gm-api.spec.ts 已验证过的模式：避免每个 test 都完整走两次
 * launchPersistentContext，CI 下 workers 并行时大量并发 Chrome 启动会互相
 * 抢占 CPU，把扩展 service worker 的启动拖到超过 30s 超时。
 */
export const testWithUserScripts = base.extend<
  {
    context: BrowserContext;
    extensionId: string;
  },
  { userScriptsProfileDir: string }
>({
  userScriptsProfileDir: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-profile-"));

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

      await use(userDataDir);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
    { scope: "worker" },
  ],
  context: async ({ userScriptsProfileDir }, use) => {
    // 每个测试使用从预配置 profile 拷贝出的独立目录，避免脚本/storage 状态泄漏到后续测试，
    // 同时跳过每个测试都重新做一次的 Phase 1 权限配置。
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-test-"));
    fs.cpSync(userScriptsProfileDir, userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      ...getProxyOptions(),
      ...getRecordVideoOptions(),
    });
    await context.addInitScript(dismissOnboarding);
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
    await use(extensionId);
  },
});
