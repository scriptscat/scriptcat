import { createServer } from "http";
import type { AddressInfo } from "net";
import type { BrowserContext, Page } from "@playwright/test";
import { testWithUserScripts as test, expect } from "./fixtures";

const SUBSCRIBE_NAME = "E2E Subscribe Lifecycle";

function subscribeBody(version: "1.0.0" | "2.0.0" | "3.0.0", scriptUrls: string[]): string {
  return `// ==UserSubscribe==
// @name         ${SUBSCRIBE_NAME}
// @description  subscribe lifecycle e2e
// @version      ${version}
// @author       E2E
${scriptUrls.map((url) => `// @scriptURL    ${url}`).join("\n")}
// ==/UserSubscribe==`;
}

function childScript(name: string, marker: string, origin: string): string {
  return `// ==UserScript==
// @name         ${name}
// @namespace    ${origin}/subscribe-lifecycle
// @version      1.0.0
// @match        ${origin}/*
// @grant        none
// ==/UserScript==

document.documentElement.setAttribute(${JSON.stringify(marker)}, "true");
`;
}

async function installSubscription(context: BrowserContext, extensionId: string, subscribeUrl: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/install.html?url=${subscribeUrl}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText(SUBSCRIBE_NAME).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("install-primary")).toBeEnabled();
  await Promise.all([page.waitForEvent("close", { timeout: 10_000 }), page.getByTestId("install-primary").click()]);
}

async function openTarget(context: BrowserContext, origin: string, suffix: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${origin}/${suffix}`, { waitUntil: "domcontentloaded" });
  return page;
}

test.describe("订阅真实生命周期", () => {
  test("订阅更新应增删关联脚本，删除订阅后脚本不再执行", async ({ context, extensionId }) => {
    let subscribeVersion: "1.0.0" | "2.0.0" | "3.0.0" = "1.0.0";
    let origin = "";
    const server = createServer((req, res) => {
      const scriptAUrl = `${origin}/sub-a.user.js`;
      const scriptBUrl = `${origin}/sub-b.user.js`;
      const scriptCUrl = `${origin}/sub-c.user.js`;
      const bodies = new Map([
        [
          "/lifecycle.user.sub.js",
          subscribeBody(subscribeVersion, [
            scriptAUrl,
            ...(subscribeVersion === "3.0.0" ? [] : [scriptBUrl]),
            ...(subscribeVersion === "1.0.0" ? [] : [scriptCUrl]),
          ]),
        ],
        ["/sub-a.user.js", childScript("E2E Subscribe A", "data-subscribe-a", origin)],
        ["/sub-b.user.js", childScript("E2E Subscribe B", "data-subscribe-b", origin)],
        ["/sub-c.user.js", childScript("E2E Subscribe C", "data-subscribe-c", origin)],
      ]);
      const path = new URL(req.url || "/", origin).pathname;
      const body = bodies.get(path);
      res.setHeader("Cache-Control", "no-store");
      if (body) {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(body);
      } else {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!doctype html><html><body></body></html>");
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const subscribeUrl = `${origin}/lifecycle.user.sub.js`;

    try {
      await installSubscription(context, extensionId, subscribeUrl);
      const initial = await openTarget(context, origin, "initial");
      await expect(initial.locator("html")).toHaveAttribute("data-subscribe-a", "true", { timeout: 20_000 });
      await expect(initial.locator("html")).toHaveAttribute("data-subscribe-b", "true", { timeout: 20_000 });
      await expect(initial.locator("html")).not.toHaveAttribute("data-subscribe-c", "true");
      await initial.close();

      subscribeVersion = "2.0.0";
      await installSubscription(context, extensionId, subscribeUrl);
      const updated = await openTarget(context, origin, "updated");
      await expect
        .poll(
          async () => {
            await updated.reload({ waitUntil: "domcontentloaded" });
            const root = updated.locator("html");
            return {
              a: await root.getAttribute("data-subscribe-a"),
              b: await root.getAttribute("data-subscribe-b"),
              c: await root.getAttribute("data-subscribe-c"),
            };
          },
          { timeout: 30_000, intervals: [250, 500, 1_000] }
        )
        .toEqual({ a: "true", b: "true", c: "true" });

      subscribeVersion = "3.0.0";
      await installSubscription(context, extensionId, subscribeUrl);
      await expect
        .poll(
          async () => {
            await updated.reload({ waitUntil: "domcontentloaded" });
            const root = updated.locator("html");
            return {
              a: await root.getAttribute("data-subscribe-a"),
              b: await root.getAttribute("data-subscribe-b"),
              c: await root.getAttribute("data-subscribe-c"),
            };
          },
          { timeout: 30_000, intervals: [250, 500, 1_000] }
        )
        .toEqual({ a: "true", b: null, c: "true" });
      await updated.close();

      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/src/options.html#/subscribe`, {
        waitUntil: "domcontentloaded",
      });
      const row = optionsPage
        .getByText(SUBSCRIBE_NAME, { exact: true })
        .locator("xpath=ancestor::div[contains(@class, 'group/row')]");
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole("button", { name: /delete|删除/i }).click();
      await optionsPage
        .getByRole("alertdialog")
        .getByRole("button", { name: /delete|删除/i })
        .click();
      await expect(optionsPage.getByText(SUBSCRIBE_NAME, { exact: true })).toHaveCount(0, { timeout: 20_000 });

      const afterDelete = await openTarget(context, origin, "deleted");
      await expect(afterDelete.locator("html")).not.toHaveAttribute("data-subscribe-a", "true");
      await expect(afterDelete.locator("html")).not.toHaveAttribute("data-subscribe-c", "true");
      await afterDelete.close();
      await optionsPage.close();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
