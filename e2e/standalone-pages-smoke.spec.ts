import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { openOptionsPage, openPopupPage } from "./utils";

const SCRIPT_URL = "https://e2e.test/standalone-install.user.js";
const SCRIPT_BODY = `// ==UserScript==
// @name         Standalone Install Smoke
// @namespace    https://e2e.test
// @version      1.0.0
// @description  standalone page smoke
// @match        https://example.com/*
// ==/UserScript==

console.log("standalone install smoke");
`;

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("独立扩展页面加载冒烟", () => {
  test("options.html 根页面应渲染脚本列表入口", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    const errors = collectPageErrors(page);

    await expect(page.getByTestId("view-toggle")).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("popup.html 应渲染弹窗主界面", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);
    const errors = collectPageErrors(page);

    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test("install.html 应加载远程脚本并渲染安装操作", async ({ context, extensionId }) => {
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    await page.route("**/standalone-install.user.js", (route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
        body: SCRIPT_BODY,
      })
    );

    await page.goto(`chrome-extension://${extensionId}/src/install.html?url=${SCRIPT_URL}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("Standalone Install Smoke").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("install-primary")).toBeEnabled({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test("import.html 在缺失缓存文件时应渲染可恢复的错误态", async ({ context, extensionId }) => {
    const page = await context.newPage();
    const errors = collectPageErrors(page);

    await page.goto(`chrome-extension://${extensionId}/src/import.html?uuid=missing-e2e`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("import-layout")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("import-error")).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test("batchupdate.html 无待更新脚本时应渲染空状态", async ({ context, extensionId }) => {
    const page = await context.newPage();
    const errors = collectPageErrors(page);

    await page.goto(`chrome-extension://${extensionId}/src/batchupdate.html?site=example.com&autoclose=30`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("update-empty")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("empty-recheck")).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test("confirm.html 在无效授权请求时应渲染过期态", async ({ context, extensionId }) => {
    const page = await context.newPage();
    const errors = collectPageErrors(page);

    await page.goto(`chrome-extension://${extensionId}/src/confirm.html?uuid=missing-e2e`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("confirm-shell")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("confirm-expired")).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });
});
