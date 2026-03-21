import fs from "fs";
import path from "path";
import os from "os";
import { test as base, expect, chromium, type BrowserContext } from "@playwright/test";
import { installScriptByCode } from "./utils";

const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, "../dist/ext");
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-"));
    const chromeArgs = [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`];

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
    // Wait for developerPrivate API to be available instead of a fixed delay
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
    // Ensure service worker is registered before handing context to fixtures,
    // preventing extensionId fixture from timing out with the global 10s timeout.
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

/** Strip SRI hashes and replace slow CDN with faster alternative */
function patchScriptCode(code: string): string {
  return code
    .replace(/^(\/\/\s*@(?:require|resource)\s+.*?)#sha(?:256|384|512)[=-][^\s]+/gm, "$1")
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\//g, "https://unpkg.com/");
}

/**
 * Auto-approve permission confirm dialogs opened by the extension.
 * Listens for new pages matching confirm.html and clicks the
 * "permanent allow all" button (type=4, allow=true).
 */
function autoApprovePermissions(context: BrowserContext): void {
  context.on("page", async (page) => {
    const url = page.url();
    if (!url.includes("confirm.html")) return;

    try {
      await page.waitForLoadState("domcontentloaded");
      // Click the "permanent allow" button (4th success button = type=5 permanent allow this)
      // The buttons in order are: allow_once(1), temporary_allow(3), permanent_allow(5)
      // We want "permanent_allow" which is the 3rd success button
      const successButtons = page.locator("button.arco-btn-status-success");
      await successButtons.first().waitFor({ timeout: 5_000 });
      // Find and click the last always-visible success button (permanent_allow, type=5)
      // Button order: allow_once(type=1), temporary_allow(type=3), permanent_allow(type=5)
      // Index 2 = permanent_allow (always visible)
      const count = await successButtons.count();
      if (count >= 3) {
        // permanent_allow is at index 2
        await successButtons.nth(2).click();
      } else {
        // Fallback: click the last visible success button
        await successButtons.last().click();
      }
      console.log("[autoApprove] Permission approved on confirm page");
    } catch (e) {
      console.log("[autoApprove] Failed to approve:", e);
    }
  });
}

/** Run a test script on the target page and collect console results */
async function runTestScript(
  context: BrowserContext,
  extensionId: string,
  scriptFile: string,
  targetUrl: string,
  timeoutMs: number
): Promise<{ passed: number; failed: number; logs: string[] }> {
  let code = fs.readFileSync(path.join(__dirname, `../example/tests/${scriptFile}`), "utf-8");
  code = patchScriptCode(code);

  await installScriptByCode(context, extensionId, code);

  // Start auto-approving permission dialogs
  autoApprovePermissions(context);

  const page = await context.newPage();
  const logs: string[] = [];
  let passed = -1;
  let failed = -1;

  // Resolve as soon as both pass and fail counts appear in console output
  const resultReady = new Promise<void>((resolve) => {
    page.on("console", (msg) => {
      const text = msg.text();
      logs.push(text);
      const passMatch = text.match(/通过[:：]\s*(\d+)/);
      const failMatch = text.match(/失败[:：]\s*(\d+)/);
      if (passMatch) passed = parseInt(passMatch[1], 10);
      if (failMatch) failed = parseInt(failMatch[1], 10);
      if (passed >= 0 && failed >= 0) resolve();
    });
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  // Race: resolve immediately when results arrive, or fall through after timeout
  await Promise.race([resultReady, page.waitForTimeout(timeoutMs)]);

  await page.close();
  return { passed, failed, logs };
}

const TARGET_URL = "https://content-security-policy.com/";

test.describe("GM API", () => {
  // Two-phase launch + script install + network fetches + permission dialogs
  test.setTimeout(300_000);

  test("GM_ sync API tests (gm_api_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(context, extensionId, "gm_api_test.js", TARGET_URL, 90_000);

    console.log(`[gm_api_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_api_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_ sync API tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  test("GM.* async API tests (gm_api_async_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_api_async_test.js",
      TARGET_URL,
      90_000
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
      TARGET_URL,
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
      TARGET_URL,
      60_000
    );

    console.log(`[unwrap_e2e_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[unwrap_e2e_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some unwrap scriptlet tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });
});
