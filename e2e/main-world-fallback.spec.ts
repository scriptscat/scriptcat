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
    await page.goto(server.url("sitea.test", "/page?phase=first"), { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-main-world-gm-value", "missing|stored");

    await page.goto(server.url("sitea.test", "/page?phase=second"), { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-main-world-gm-value", "stored|stored");
  } finally {
    await server.close();
  }
});
