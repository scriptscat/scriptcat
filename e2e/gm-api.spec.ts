import fs from "fs";
import path from "path";
import os from "os";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { test as base, expect, chromium, type BrowserContext } from "@playwright/test";
import { autoApprovePermissions, installScriptByCode } from "./utils";

const MOCK_CONNECT_HOST = "127.0.0.1";
const CSP_TARGET_HOST = "content-security-policy.test";

type GMApiMockServer = {
  origin: string;
  cspOrigin: string;
  close: () => Promise<void>;
};

const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, "../dist/ext");
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-"));
    const chromeArgs = [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      `--host-resolver-rules=MAP ${CSP_TARGET_HOST} ${MOCK_CONNECT_HOST},EXCLUDE localhost`,
    ];

    // Phase 1: Enable user scripts permission
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

    // Phase 2: Relaunch with user scripts enabled
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
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
          url: `http://${req.headers.host}${url.pathname}`,
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
    /^\/\/\s*@match\s+.*\?(gm_api_sync|gm_api_async|inject_content|WINDOW_MESSAGE_TEST_SC|SANDBOX_TEST_SC|unwrap_e2e_test)$/gm,
    `// @match        ${targetPattern}`
  );
}

function patchGMApiTestCode(code: string, mockOrigin: string): string {
  const mockHost = new URL(mockOrigin).host;
  return code
    .replace(/^\/\/\s*@connect\s+api\.github\.com$/gm, `// @connect      ${MOCK_CONNECT_HOST}`)
    .replace(/^\/\/\s*@connect\s+httpbun\.com$/gm, `// @connect      ${MOCK_CONNECT_HOST}`)
    .replace(/https:\/\/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockOrigin}/repos/scriptscat/scriptcat`)
    .replace(/https:\/\/httpbun\.com\/get/g, `${mockOrigin}/get`)
    .replace(/https:\/\/httpbun\.com\/bytes\/64/g, `${mockOrigin}/bytes/64`)
    .replace(/https:\/\/httpbun\.com\/delay\/5/g, `${mockOrigin}/delay/5`)
    .replace(/https:\/\/www\.tampermonkey\.net\/favicon\.ico/g, `${mockOrigin}/favicon.ico`)
    .replace(/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockHost}/repos/scriptscat/scriptcat`)
    .replace(/httpbun\.com\/get/g, `${mockHost}/get`);
}

async function runTestScript(
  context: BrowserContext,
  extensionId: string,
  scriptFile: string,
  targetUrl: string,
  timeoutMs: number,
  options?: { patchCode?: (code: string) => string }
): Promise<{ passed: number; failed: number; logs: string[] }> {
  let code = fs.readFileSync(path.join(__dirname, `../example/tests/${scriptFile}`), "utf-8");
  code = patchScriptCode(code);
  code = patchTargetMatchCode(code, targetUrl);
  code = options?.patchCode ? options.patchCode(code) : code;

  await installScriptByCode(context, extensionId, code);
  autoApprovePermissions(context);

  const page = await context.newPage();
  const logs: string[] = [];
  let passed = -1;
  let failed = -1;

  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(text);
    const passMatch = text.match(/(通过|Passed)[:：]\s*(\d+)/);
    const failMatch = text.match(/(失败|Failed)[:：]\s*(\d+)/);
    if (passMatch) passed = parseInt(passMatch[2], 10);
    if (failMatch) failed = parseInt(failMatch[2], 10);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => passed >= 0 && failed >= 0, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
    .toBe(true)
    .catch(() => undefined);

  await page.close();
  return { passed, failed, logs };
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
      { patchCode }
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
      { patchCode }
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
      60_000
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
      60_000
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
      { patchCode }
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
      8_000
    );

    console.log(`[sandbox_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[sandbox_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some sandbox tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });
});
