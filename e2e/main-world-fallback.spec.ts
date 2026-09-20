import { expect, startMockServer, test } from "./server-fixtures";
import { autoApprovePermissions, installScriptByCode } from "./utils";

const scriptName = "MAIN world fallback GM compatibility";
const scriptCode = `// ==UserScript==
// @name         ${scriptName}
// @namespace    https://e2e.test
// @version      1.0.0
// @match        http://sitea.test/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

const previous = GM_getValue("fallback-value", "missing");
GM_setValue("fallback-value", "stored");
document.documentElement.setAttribute("data-main-world-gm-value", previous + "|" + GM_getValue("fallback-value", "missing"));
`;

test("MAIN-world fallback keeps privileged scripts and stored values working", async ({ context, extensionId }) => {
  const server = await startMockServer();
  try {
    autoApprovePermissions(context);
    await installScriptByCode(context, extensionId, scriptCode);

    const page = await context.newPage();
    await page.addInitScript((expectedScriptName) => {
      const isRecord = (value: unknown): value is Record<string, unknown> =>
        value !== null && typeof value === "object" && !Array.isArray(value);

      window.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (!isRecord(event.data)) return;
        const envelope = event.data;
        if (envelope.source !== "scripting" || envelope.target !== "inject" || envelope.type !== "sendMessage") {
          return;
        }

        if (!isRecord(envelope.data) || envelope.data.action !== "inject/pageLoad" || !isRecord(envelope.data.data)) {
          return;
        }
        const pageLoad = envelope.data.data;
        if (!Array.isArray(pageLoad.scripts)) return;
        const script = pageLoad.scripts.find((item) => isRecord(item) && item.name === expectedScriptName);
        if (!isRecord(script)) return;

        const metadata = isRecord(script.metadata) ? script.metadata : undefined;
        Reflect.set(window, "__scriptcatFallbackScript", {
          grants: metadata?.grant,
          value: script.value,
          executionHandle: script.executionHandle,
          executionEnvTag: script.executionEnvTag,
          executionRunFlag: script.executionRunFlag,
        });
      });
    }, scriptName);

    await page.goto(server.url("sitea.test", "/page?phase=first"), { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-main-world-gm-value", "missing|stored");
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "__scriptcatFallbackScript") !== undefined))
      .toBe(true);

    await page.goto(server.url("sitea.test", "/page?phase=second"), { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-main-world-gm-value", "stored|stored");
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "__scriptcatFallbackScript") !== undefined))
      .toBe(true);

    const fallbackScript = await page.evaluate(() => Reflect.get(window, "__scriptcatFallbackScript"));
    expect(fallbackScript).toMatchObject({
      grants: expect.arrayContaining(["GM_getValue", "GM_setValue"]),
      value: { "fallback-value": "stored" },
      executionEnvTag: "it",
    });
    expect(typeof fallbackScript.executionHandle).toBe("string");
    expect(typeof fallbackScript.executionRunFlag).toBe("string");
  } finally {
    await server.close();
  }
});
