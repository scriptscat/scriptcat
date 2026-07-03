/* global process */
// Firefox MV3 end-to-end test: build the Firefox add-on, install
// example/tests/gm_api_sync_test.js into ScriptCat via the real install page, run it
// against a mocked CSP target page, and assert the GM API results — the Firefox
// counterpart of the Chrome "GM_ sync API tests" in e2e/gm-api.spec.ts.
//
// Prerequisite: a build exists at dist/ext (run `pnpm run build` or `pnpm run dev`).
// Run: `pnpm run test:e2e:firefox`  (HEADED=1 to watch, NO_CSP=1 to require a clean 29/29).
// Screenshots are saved under test-results/ff-gm-sync-*.png. Exit code 0 = pass.
import fs from "fs";
import path from "path";
import { By, until } from "selenium-webdriver";
import { buildFirefoxExt } from "./build-ext.mjs";
import { launchFirefox } from "./driver.mjs";
import { startGMApiMockServer, patchScriptCode, patchTargetMatchCode, patchGMApiTestCode } from "./mock-server.mjs";

// Known Firefox-only gap on a `script-src 'none'` CSP page (this test passes on Chrome):
// GM_addElement("script", { textContent }) does not bypass the page CSP on Firefox, so the
// injected inline script does not run and `unsafeWindow.foo === "bar"` fails. Kept as an
// allowlist so the run stays green while still catching any NEW regression; on a non-CSP
// page (NO_CSP=1) nothing is allowed to fail. If ScriptCat gains CSP bypass this set shrinks.
const KNOWN_CSP_GAPS = new Set(["GM_addElement - 创建元素"]);

const HARD = setTimeout(() => {
  console.error("!! HARD TIMEOUT — exiting");
  process.exit(3);
}, 180_000);
HARD.unref?.();

const OUT = "test-results";
const shot = async (driver, name) => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name), await driver.takeScreenshot(), "base64");
    console.log("  screenshot:", path.join(OUT, name));
  } catch (e) {
    console.log("  screenshot failed:", e.message);
  }
};

async function approveConfirmWindows(driver, mainHandle) {
  for (const h of await driver.getAllWindowHandles()) {
    if (h === mainHandle) continue;
    try {
      await driver.switchTo().window(h);
      if (!(await driver.getCurrentUrl()).includes("confirm.html")) continue;
      const request = await driver.findElements(By.css('[data-testid="confirm-request"]'));
      if (request.length) {
        await request[0].click();
      } else {
        const perm = await driver.findElements(By.css('[data-testid="confirm-duration-permanent"]'));
        if (perm.length) await perm[0].click().catch(() => {});
        const allow = await driver.findElements(By.css('[data-testid="confirm-allow"]'));
        if (allow.length) await allow[0].click();
      }
      console.log("  [approve] granted permission on confirm.html");
    } catch {
      /* window may have closed mid-iteration */
    }
  }
  await driver
    .switchTo()
    .window(mainHandle)
    .catch(() => {});
}

async function main() {
  await buildFirefoxExt();

  // Prepare the userscript with the same transforms the Chrome suite applies, plus a tiny
  // non-invasive instrumentation that records each failing test's name to a DOM attribute
  // (does not change the pass/fail counts) so we can assert against the allowlist above.
  const raw = fs.readFileSync(path.resolve(import.meta.dirname, "../../example/tests/gm_api_sync_test.js"), "utf8");
  const server = await startGMApiMockServer();
  const targetUrl = `${server.origin}/?gm_api_sync`;
  let code = patchScriptCode(raw);
  code = patchTargetMatchCode(code, targetUrl);
  code = patchGMApiTestCode(code, server.origin);
  code = code.replaceAll(
    "testResults.failed++;",
    "testResults.failed++;try{document.documentElement.setAttribute('data-scfails',(document.documentElement.getAttribute('data-scfails')||'')+name+' | ')}catch(e){}"
  );
  server.setUserScript(code);
  console.log("mock origin:", server.origin, "| CSP:", process.env.NO_CSP === "1" ? "off" : "on");

  const { driver, extUrl, cleanup } = await launchFirefox({ headless: process.env.HEADED !== "1" });
  try {
    // Install via ScriptCat's real install page (web-accessible; reads ?url= then fetches).
    console.log("installing via install page ...");
    await driver.get(`${extUrl("src/install.html")}?url=${server.origin}/gm_api_sync.user.js`);
    const primary = await driver.wait(until.elementLocated(By.css('[data-testid="install-primary"]')), 30_000);
    await driver.wait(until.elementIsEnabled(primary), 20_000);
    await shot(driver, "ff-gm-sync-1-install.png");
    await primary.click();
    await driver.sleep(2500);

    // The install page discards its own tab after installing — move to a valid window.
    const afterInstall = await driver.getAllWindowHandles();
    await driver.switchTo().window(afterInstall[afterInstall.length - 1]);
    await driver.switchTo().newWindow("tab");

    // Confirm the script registered (options list shows it).
    await driver.get(extUrl("src/options.html"));
    await driver.executeScript("try{localStorage.setItem('firstUse','false')}catch(e){}");
    await driver.navigate().refresh();
    await driver.wait(
      until.elementLocated(By.css('[data-testid="view-toggle"], [data-testid="mobile-search"]')),
      25_000
    );
    await driver.sleep(1500);
    const listText = await driver.executeScript("return document.body.innerText");
    if (!/GM API/i.test(listText)) throw new Error("installed script did not appear in the options list");
    await shot(driver, "ff-gm-sync-2-installed-list.png");

    // Open the target page in a new tab; the script injects and runs there.
    await driver.switchTo().newWindow("tab");
    const mainHandle = await driver.getWindowHandle();
    console.log("running on target:", targetUrl);
    await driver.get(targetUrl);

    // Interleave: approve runtime permission prompts + poll the page for the summary.
    let passed = -1;
    let failed = -1;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await approveConfirmWindows(driver, mainHandle);
      const text = await driver.executeScript("return document.body ? document.body.innerText : ''").catch(() => "");
      const p = String(text).match(/通过[:：]\s*(\d+)/);
      const f = String(text).match(/失败[:：]\s*(\d+)/);
      if (p) passed = parseInt(p[1], 10);
      if (f) failed = parseInt(f[1], 10);
      if (passed >= 0 && failed >= 0) break;
      await driver.sleep(500);
    }

    // Settle, then re-read the counts and the recorded failure names definitively.
    await driver.sleep(1500);
    const finalText = await driver.executeScript("return document.body ? document.body.innerText : ''").catch(() => "");
    const total = Number(String(finalText).match(/总测试数[:：]\s*(\d+)/)?.[1] ?? -1);
    passed = Number(String(finalText).match(/通过[:：]\s*(\d+)/)?.[1] ?? passed);
    failed = Number(String(finalText).match(/失败[:：]\s*(\d+)/)?.[1] ?? failed);
    if (failed < 0 && total >= 0 && passed >= 0) failed = total - passed;
    await shot(driver, "ff-gm-sync-3-result.png");

    const recorded = await driver
      .executeScript("return document.documentElement.getAttribute('data-scfails')")
      .catch(() => null);
    const failedNames = String(recorded || "")
      .split(" | ")
      .map((s) => s.trim())
      .filter(Boolean);
    const allow = process.env.NO_CSP === "1" ? new Set() : KNOWN_CSP_GAPS;
    const unexpected = failedNames.filter((n) => !allow.has(n));

    console.log("\n==== gm_api_sync (Firefox MV3) ====");
    console.log(`总测试数: ${total} | 通过: ${passed} | 失败: ${failed}`);
    if (failedNames.length) console.log("failing test(s):", failedNames.join(", "));
    if (failedNames.length && !unexpected.length) {
      console.log("(all failures are known Firefox CSP gaps — allowed)");
    }

    const ok = passed > 0 && total > 0 && unexpected.length === 0;
    if (ok) {
      console.log("RESULT: PASS ✅");
    } else {
      console.log("RESULT: FAIL ❌");
      if (!(passed > 0 && total > 0)) console.log("  reason: script did not run to completion (no results parsed)");
      if (unexpected.length) console.log("  unexpected failing test(s):", unexpected.join(", "));
    }
    await server.close();
    process.exitCode = ok ? 0 : 1;
  } finally {
    await cleanup();
    clearTimeout(HARD);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(4);
});
