import type { BrowserContext, Page } from "@playwright/test";
import { testWithUserScripts as test, expect } from "./fixtures";

const SCRIPT_URL = "https://e2e.test/install-update.user.js";
const TARGET_ORIGIN = "http://install-update.test";
const SCRIPT_NAME = "E2E Install Update";

function scriptBody(version: string): string {
  return `// ==UserScript==
// @name         ${SCRIPT_NAME}
// @namespace    https://e2e.test/install-update
// @version      ${version}
// @description  install and update e2e
// @match        ${TARGET_ORIGIN}/*
// @updateURL    ${SCRIPT_URL}
// @downloadURL  ${SCRIPT_URL}
// @grant        none
// ==/UserScript==

document.documentElement.setAttribute("data-install-update-version", ${JSON.stringify(version)});
`;
}

async function openInstallPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/install.html?url=${SCRIPT_URL}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText(SCRIPT_NAME).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("install-primary")).toBeEnabled({ timeout: 10_000 });
  return page;
}

async function installFromPage(page: Page): Promise<void> {
  await page.getByTestId("install-primary").click();
  await page.waitForEvent("close", { timeout: 10_000 });
}

async function expectExecutedVersion(context: BrowserContext, version: string): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(`${TARGET_ORIGIN}/?version=${version}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-install-update-version", version, { timeout: 20_000 });
  } finally {
    await page.close();
  }
}

test.describe("安装与更新真实执行链路", () => {
  test("从安装页安装 v1 后应执行，并可从同一来源更新到 v2", async ({ context, extensionId }) => {
    let version = "1.0.0";
    await context.route(SCRIPT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript; charset=utf-8",
        body: scriptBody(version),
      })
    );
    await context.route(`${TARGET_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" })
    );

    await installFromPage(await openInstallPage(context, extensionId));
    await expectExecutedVersion(context, "1.0.0");

    version = "2.0.0";
    const updatePage = await openInstallPage(context, extensionId);
    await expect(updatePage.getByTestId("version-old")).toHaveText("v1.0.0");
    await expect(updatePage.getByTestId("version-new")).toHaveText("v2.0.0");
    await installFromPage(updatePage);
    await expectExecutedVersion(context, "2.0.0");
  });
});
