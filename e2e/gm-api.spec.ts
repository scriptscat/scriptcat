import { expect } from "@playwright/test";
import { testWithUserScripts } from "./fixtures";
import { runTestScript } from "./utils";

const TARGET_URL = "https://content-security-policy.com/";

testWithUserScripts.describe("GM API", () => {
  // Two-phase launch + script install + network fetches + permission dialogs
  testWithUserScripts.setTimeout(300_000);

  testWithUserScripts("GM_ sync API tests (gm_api_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(context, extensionId, "gm_api_test.js", TARGET_URL, 90_000);

    console.log(`[gm_api_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[gm_api_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some GM_ sync API tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  testWithUserScripts("GM.* async API tests (gm_api_async_test.js)", async ({ context, extensionId }) => {
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

  testWithUserScripts("Content inject tests (inject_content_test.js)", async ({ context, extensionId }) => {
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

  testWithUserScripts("Unwrap scriptlet tests (unwrap_e2e_test.js)", async ({ context, extensionId }) => {
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
