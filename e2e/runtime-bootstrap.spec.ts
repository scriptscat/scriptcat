import { testWithUserScripts as test, expect } from "./fixtures";
import { installScriptByCode } from "./utils";
import type { Worker } from "@playwright/test";

const TARGET_URL = "http://runtime-bootstrap.test/";

const RUNTIME_SMOKE_SCRIPT = `// ==UserScript==
// @name         Runtime bootstrap smoke
// @namespace    https://e2e.test/runtime-bootstrap
// @version      1.0.0
// @match        ${TARGET_URL}*
// @grant        GM_info
// @inject-into  page
// ==/UserScript==

document.documentElement.setAttribute(
  "data-scriptcat-runtime-smoke",
  typeof GM_info === "object" && GM_info?.script?.name === "Runtime bootstrap smoke" ? "ok" : "bad"
);
`;

test.describe("runtime bootstrap smoke", () => {
  test("executes one page userscript within the local fail-fast budget", async ({ context, extensionId }) => {
    test.setTimeout(60_000);
    await context.route(`${TARGET_URL}**`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" })
    );

    const serviceWorkerLogs: string[] = [];
    const attachServiceWorker = (worker: Worker) => {
      worker.on("console", (message) => serviceWorkerLogs.push(message.text()));
    };
    for (const worker of context.serviceWorkers()) attachServiceWorker(worker);
    context.on("serviceworker", attachServiceWorker);

    await installScriptByCode(context, extensionId, RUNTIME_SMOKE_SCRIPT);

    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("data-scriptcat-runtime-smoke", "ok", { timeout: 5_000 });
    } catch (error) {
      console.error("[runtime-smoke] page errors:", pageErrors);
      console.error("[runtime-smoke] service-worker console:", serviceWorkerLogs);
      throw error;
    } finally {
      await page.close();
      context.off("serviceworker", attachServiceWorker);
    }
  });
});
