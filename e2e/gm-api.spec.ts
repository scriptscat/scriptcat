import { expect } from "@playwright/test";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { testWithUserScripts } from "./fixtures";
import { runTestScript } from "./utils";

const TARGET_URL = "https://content-security-policy.com/";
const GITHUB_REPO_API_URL = "https://api.github.com/repos/scriptscat/scriptcat";
const MOCK_CONNECT_HOST = "127.0.0.1";

type GMApiMockServer = {
  origin: string;
  close: () => Promise<void>;
};

async function startGMApiMockServer(): Promise<GMApiMockServer> {
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/repos/scriptscat/scriptcat") {
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

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
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
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

function patchGMApiTestCode(code: string, mockOrigin: string): string {
  return code
    .replace(/^\/\/\s*@connect\s+api\.github\.com$/gm, `// @connect      ${MOCK_CONNECT_HOST}`)
    .replace(
      new RegExp(GITHUB_REPO_API_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      `${mockOrigin}/repos/scriptscat/scriptcat`
    );
}

testWithUserScripts.describe("GM API", () => {
  let gmApiMockServer: GMApiMockServer;

  testWithUserScripts.beforeAll(async () => {
    gmApiMockServer = await startGMApiMockServer();
  });

  testWithUserScripts.afterAll(async () => {
    await gmApiMockServer.close();
  });

  function patchCode(code: string): string {
    return patchGMApiTestCode(code, gmApiMockServer.origin);
  }

  // Two-phase launch + script install + network fetches + permission dialogs
  testWithUserScripts.setTimeout(300_000);

  testWithUserScripts("GM_ sync API tests (gm_api_sync_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_api_sync_test.js",
      `${TARGET_URL}?gm_api_sync`,
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

  testWithUserScripts("GM.* async API tests (gm_api_async_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "gm_api_async_test.js",
      `${TARGET_URL}?gm_api_async`,
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

  testWithUserScripts("Content inject tests (inject_content_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "inject_content_test.js",
      `${TARGET_URL}?inject_content`,
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

  testWithUserScripts("WindowMessage Transport Test (window_message_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "window_message_test.js",
      `${TARGET_URL}?WINDOW_MESSAGE_TEST_SC`,
      8_000
    );

    console.log(`[window_message_test] passed=${passed}, failed=${failed}`);
    if (failed !== 0) {
      console.log("[window_message_test] logs:", logs.join("\n"));
    }
    expect(failed, "Some window message tests failed").toBe(0);
    expect(passed, "No test results found - script may not have run").toBeGreaterThan(0);
  });

  testWithUserScripts("Sandbox Test (sandbox_test.js)", async ({ context, extensionId }) => {
    const { passed, failed, logs } = await runTestScript(
      context,
      extensionId,
      "sandbox_test.js",
      `${TARGET_URL}?SANDBOX_TEST_SC`,
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
