import { expect, startMockServer, test } from "./server-fixtures";
import { autoApprovePermissions, installScriptByCode } from "./utils";

const scriptName = "MAIN world keyed bridge GM compatibility";
const scriptCode = `// ==UserScript==
// @name         ${scriptName}
// @namespace    https://e2e.test
// @version      1.0.0
// @match        http://sitea.test/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

const previous = GM_getValue("bridge-value", "missing");
GM_setValue("bridge-value", "stored");
document.documentElement.setAttribute("data-main-world-gm-value", previous + "|" + GM_getValue("bridge-value", "missing"));
`;

test("MAIN-world keyed bridge keeps GM storage working without window message payloads", async ({
  context,
  extensionId,
}) => {
  const server = await startMockServer();
  try {
    autoApprovePermissions(context);
    await installScriptByCode(context, extensionId, scriptCode);

    const page = await context.newPage();
    await page.addInitScript(() => {
      const pageWindow = window as Window & { __scWindowMessageLeaks: unknown[] };
      pageWindow.__scWindowMessageLeaks = [];
      window.addEventListener("message", (event) => pageWindow.__scWindowMessageLeaks.push(event.data));
    });

    await page.goto(server.url("sitea.test", "/page?phase=first"), { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-main-world-gm-value", "missing|stored");
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { __scWindowMessageLeaks: unknown[] }).__scWindowMessageLeaks)
      )
      .toEqual([]);

    await page.goto(server.url("sitea.test", "/page?phase=second"), { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-main-world-gm-value", "stored|stored");
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { __scWindowMessageLeaks: unknown[] }).__scWindowMessageLeaks)
      )
      .toEqual([]);
  } finally {
    await server.close();
  }
});
