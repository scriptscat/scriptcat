import fs from "fs";
import path from "path";
import os from "os";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { autoApprovePermissions, installScriptByCode } from "./utils";

const MOCK_CONNECT_HOST = "127.0.0.1";
const CSP_TARGET_HOST = "content-security-policy.test";

const pathToExtension = path.resolve(__dirname, "../dist/ext");
const chromeArgs = [
  `--disable-extensions-except=${pathToExtension}`,
  `--load-extension=${pathToExtension}`,
  `--host-resolver-rules=MAP ${CSP_TARGET_HOST} ${MOCK_CONNECT_HOST},EXCLUDE localhost`,
  "--disable-gpu",
];

// CI（GitHub Actions）跑在非 root 用户下不会自动应用 --no-sandbox，关掉沙箱能省下每次
// launchPersistentContext 的 sandbox/fork 开销；本地开发机上仍保留沙箱隔离。
const chromiumSandbox = !process.env.CI;

type GMApiMockServer = {
  origin: string;
  cspOrigin: string;
  close: () => Promise<void>;
};

const test = base.extend<
  {
    context: BrowserContext;
    extensionId: string;
  },
  { gmApiProfileDir: string }
>({
  // Worker 级 fixture：启用 user scripts 权限的 Phase 1（含 chrome://extensions 导航 +
  // developerPrivate 调用）每个 worker 只做一次，而不是每个 test 都重新做一遍。
  // 之前每个 test 都要完整走两次 launchPersistentContext，CI 下 workers 并行时
  // 大量并发 Chrome 启动会互相抢占 CPU，把扩展 service worker 的启动拖到超过 30s 超时。
  gmApiProfileDir: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-profile-"));

      const ctx1 = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ["--headless=new", ...chromeArgs],
        timeout: 60_000,
        chromiumSandbox,
      });
      let [bg] = ctx1.serviceWorkers();
      if (!bg) bg = await ctx1.waitForEvent("serviceworker", { timeout: 14_000 });
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
  context: async ({ gmApiProfileDir }, use) => {
    // 每个测试使用从预配置 profile 拷贝出的独立目录，避免脚本/storage 状态泄漏到后续测试，
    // 同时跳过每个测试都重新做一次的 Phase 1 权限配置。
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-test-"));
    fs.cpSync(gmApiProfileDir, userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      timeout: 60_000,
      chromiumSandbox,
    });
    const [sw] = context.serviceWorkers();
    if (!sw) await context.waitForEvent("serviceworker", { timeout: 14_000 });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker", { timeout: 14_000 });
    const extensionId = background.url().split("/")[2];
    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/src/options.html`);
    await initPage.waitForLoadState("domcontentloaded");
    await initPage.evaluate(() => localStorage.setItem("firstUse", "false"));
    await initPage.close();
    await use(extensionId);
  },
});

function patchScriptCode(code: string): string {
  return code
    .replace(/^(\/\/\s*@(?:require|resource)\s+.*?)#sha(?:256|384|512)[=-][^\s]+/gm, "$1")
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\//g, "https://unpkg.com/");
}

async function startGMApiMockServer(): Promise<GMApiMockServer> {
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/get") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const args = Object.fromEntries(url.searchParams.entries());
      res.end(
        JSON.stringify({
          // Include the query string — gm_xhr_redirect_test.js asserts the reflected url matches
          // the exact request URL it sent, search params included (mirrors real httpbun.com/get).
          url: `http://${req.headers.host}${url.pathname}${url.search}`,
          args,
        })
      );
      return;
    }

    if (url.pathname === "/repos/scriptscat/scriptcat") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: "scriptcat",
          full_name: "scriptscat/scriptcat",
          description: "ScriptCat",
        })
      );
      return;
    }

    if (url.pathname === "/favicon.ico") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          "base64"
        )
      );
      return;
    }

    if (url.pathname === "/lib/sctest.js") {
      const source = fs.readFileSync(path.join(__dirname, "../example/tests/lib/sctest.js"), "utf-8");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(source);
      return;
    }

    if (url.pathname === "/redirect-to") {
      const target = url.searchParams.get("url") || "/";
      res.writeHead(302, { Location: target });
      res.end();
      return;
    }

    const bytesMatch = url.pathname.match(/^\/bytes\/(\d+)$/);
    if (bytesMatch) {
      const size = Number(bytesMatch[1]);
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(Buffer.alloc(size, "a"));
      return;
    }

    const delayMatch = url.pathname.match(/^\/delay\/(\d+)$/);
    if (delayMatch) {
      const delayMs = Number(delayMatch[1]) * 1000;
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url: `http://${req.headers.host}${url.pathname}` }));
      }, delayMs);
      return;
    }

    if (req.headers.host?.startsWith(CSP_TARGET_HOST)) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self'; connect-src 'self'"
      );
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><html><head><title>ScriptCat E2E</title></head><body><main class="container"><div class="masthead">ScriptCat E2E</div></main></body></html>'
    );
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, MOCK_CONNECT_HOST, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    origin: `http://${MOCK_CONNECT_HOST}:${address.port}`,
    cspOrigin: `http://${CSP_TARGET_HOST}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

function patchTargetMatchCode(code: string, targetUrl: string): string {
  const url = new URL(targetUrl);
  const targetPattern = `${url.protocol}//${url.hostname}/*${url.search}`;
  return code.replace(
    /^\/\/\s*@match\s+.*\?(gm_api_sync|gm_api_async|inject_content|WINDOW_MESSAGE_TEST_SC|SANDBOX_TEST_SC|unwrap_e2e_test|GM_XHR_REDIRECT_TEST_SC|GM_DOWNLOAD_TEST_SC)$/gm,
    `// @match        ${targetPattern}`
  );
}

// 把框架的 CDN @require 重写到本地 mock server：CI 不依赖外网，且始终测工作区版本而非 CDN 上的旧版。
function patchRequireCode(code: string, origin: string): string {
  return code.replace(
    /https:\/\/cdn\.jsdelivr\.net\/gh\/scriptscat\/scriptcat@[^/]+\/example\/tests\/lib\/sctest\.js/g,
    `${origin}/lib/sctest.js`
  );
}

function patchGMApiTestCode(code: string, mockOrigin: string): string {
  const mockHost = new URL(mockOrigin).host;
  return (
    code
      .replace(/^\/\/\s*@connect\s+api\.github\.com$/gm, `// @connect      ${MOCK_CONNECT_HOST}`)
      .replace(/^\/\/\s*@connect\s+httpbun\.com$/gm, `// @connect      ${MOCK_CONNECT_HOST}`)
      .replace(/https:\/\/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockOrigin}/repos/scriptscat/scriptcat`)
      .replace(/https:\/\/httpbun\.com\/get/g, `${mockOrigin}/get`)
      .replace(/https:\/\/httpbun\.com\/bytes\/64/g, `${mockOrigin}/bytes/64`)
      .replace(/https:\/\/httpbun\.com\/delay\/5/g, `${mockOrigin}/delay/5`)
      .replace(/https:\/\/www\.tampermonkey\.net\/favicon\.ico/g, `${mockOrigin}/favicon.ico`)
      .replace(/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockHost}/repos/scriptscat/scriptcat`)
      .replace(/httpbun\.com\/get/g, `${mockHost}/get`)
      // gm_xhr_redirect_test.js / gm_download_test.js / gm_xhr_test.js build every request URL off
      // this constant rather than writing literal https://httpbun.com/... URLs.
      .replace(/const HB = "https:\/\/httpbun\.com";/, `const HB = "${mockOrigin}";`)
  );
}

async function runTestScript(
  context: BrowserContext,
  extensionId: string,
  scriptFile: string,
  targetUrl: string,
  timeoutMs: number,
  options?: {
    patchCode?: (code: string) => string;
    requireOrigin?: string;
    // B 类文件的 sctest 套件是 auto:false（真实下载副作用），页面加载不会自动跑，需要先点面板的
    // 「运行」按钮。首次加载时 ConsoleReporter 已经打过一次汇总（那时用例全被预置为 skip，
    // 即 "通过: 0 / 失败: 0"），所以点击后必须等**新的一次**汇总，不能沿用已有值。
    beforeCollect?: (page: Page) => Promise<void>;
  }
): Promise<{ passed: number; failed: number; logs: string[] }> {
  let code = fs.readFileSync(path.join(__dirname, `../example/tests/${scriptFile}`), "utf-8");
  code = patchScriptCode(code);
  if (options?.requireOrigin) code = patchRequireCode(code, options.requireOrigin);
  code = patchTargetMatchCode(code, targetUrl);
  code = options?.patchCode ? options.patchCode(code) : code;

  await installScriptByCode(context, extensionId, code);
  autoApprovePermissions(context);

  const page = await context.newPage();
  const logs: string[] = [];
  let passed = -1;
  let failed = -1;

  // 「失败:」是三行汇总里的最后一行，用它计数即可判定又打完了一整组汇总。
  let summaryCount = 0;

  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(text);
    const passMatch = text.match(/(通过|Passed)[:：]\s*(\d+)/);
    const failMatch = text.match(/(失败|Failed)[:：]\s*(\d+)/);
    if (passMatch) passed = parseInt(passMatch[2], 10);
    if (failMatch) {
      failed = parseInt(failMatch[2], 10);
      summaryCount++;
    }
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  if (options?.beforeCollect) {
    // 顺序很重要：先等页面加载时那组汇总打完（那时 auto:false 的用例还全是 skip，
    // 汇总是 "通过: 0 / 失败: 0"），再点按钮，最后等下一组汇总。
    // 若在 goto 之后立刻取快照，首次汇总往往还没打，会让第二个轮询被它立即满足而读到 0/0。
    await expect
      .poll(() => summaryCount > 0, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
      .toBe(true)
      .catch(() => undefined);
    const seenBefore = summaryCount;
    await options.beforeCollect(page);
    await expect
      .poll(() => summaryCount > seenBefore, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
      .toBe(true)
      .catch(() => undefined);
  } else {
    await expect
      .poll(() => passed >= 0 && failed >= 0, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
      .toBe(true)
      .catch(() => undefined);
  }

  await page.close();
  return { passed, failed, logs };
}

// 点击某个 auto:false suite 的面板运行按钮。结果由 sctest.js 的 ConsoleReporter 在
// runManualSuites 结束时重新打出一整组汇总，runTestScript 照常从 console 解析。
function clickSuiteRunButton(suiteName: string) {
  return async (page: Page): Promise<void> => {
    const host = page.locator("#sctest-panel-host");
    await host.waitFor({ state: "attached", timeout: 15_000 });
    await host.evaluate((el: HTMLElement, name: string) => {
      el.shadowRoot?.querySelector<HTMLButtonElement>(`[data-sctest-suite="${name}"]`)?.click();
    }, suiteName);
  };
}

test.describe("GM API", () => {
  let gmApiMockServer: GMApiMockServer;

  test.beforeAll(async () => {
    gmApiMockServer = await startGMApiMockServer();
  });

  test.afterAll(async () => {
    await gmApiMockServer.close();
  });

  function patchCode(code: string): string {
    return patchGMApiTestCode(code, gmApiMockServer.origin);
  }

  test.setTimeout(300_000);

  test("local CSP target blocks page inline scripts", async ({ context }) => {
    const page = await context.newPage();
    await page.goto(`${gmApiMockServer.cspOrigin}/?csp_probe`, { waitUntil: "domcontentloaded" });

    const inlineRan = await page.evaluate(async () => {
      const key = `__scriptcat_csp_probe_${Date.now()}`;
      const script = document.createElement("script");
      script.textContent = `window["${key}"] = true;`;
      document.head.appendChild(script);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return Boolean((window as Record<string, unknown>)[key]);
    });

    await page.close();
    expect(inlineRan, "The local target page must enforce script-src CSP").toBe(false);
  });

  test("GM_ sync API tests (gm_api_sync_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_api_sync_test.js",
      `${gmApiMockServer.cspOrigin}/?gm_api_sync`,
      90_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[gm_api_sync_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_api_sync_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_ sync API tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM.* async API tests (gm_api_async_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_api_async_test.js",
      `${gmApiMockServer.cspOrigin}/?gm_api_async`,
      90_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[gm_api_async_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_api_async_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM.* async API tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("Content inject tests (inject_content_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "inject_content_test.js",
      `${gmApiMockServer.cspOrigin}/?inject_content`,
      60_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[inject_content_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[inject_content_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some content inject tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("Unwrap scriptlet tests (unwrap_e2e_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "unwrap_e2e_test.js",
      `${gmApiMockServer.cspOrigin}/?unwrap_e2e_test`,
      60_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[unwrap_e2e_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[unwrap_e2e_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some unwrap scriptlet tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("WindowMessage Transport Test (window_message_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "window_message_test.js",
      `${gmApiMockServer.cspOrigin}/?WINDOW_MESSAGE_TEST_SC`,
      8_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[window_message_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[window_message_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some window message tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("Sandbox Test (sandbox_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "sandbox_test.js",
      `${gmApiMockServer.cspOrigin}/?SANDBOX_TEST_SC`,
      8_000,
      { requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[sandbox_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[sandbox_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some sandbox tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM_xhr redirect tests (gm_xhr_redirect_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_xhr_redirect_test.js",
      `${gmApiMockServer.origin}/?GM_XHR_REDIRECT_TEST_SC`,
      90_000,
      { patchCode, requireOrigin: gmApiMockServer.origin }
    );

    console.log(`[gm_xhr_redirect_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_xhr_redirect_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_xhr redirect tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM_download tests (gm_download_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_download_test.js",
      `${gmApiMockServer.origin}/?GM_DOWNLOAD_TEST_SC`,
      120_000,
      {
        patchCode,
        requireOrigin: gmApiMockServer.origin,
        // 两个 suite 都是 auto:false，页面加载不会自动跑；只点自动套件的运行按钮，手动用例保持不跑。
        beforeCollect: clickSuiteRunButton("GM_download 自动套件"),
      }
    );

    console.log(`[gm_download_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_download_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_download tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });
});
