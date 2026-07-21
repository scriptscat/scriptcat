import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("独立扩展页面加载冒烟", () => {
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
