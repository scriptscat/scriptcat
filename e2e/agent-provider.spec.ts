import { test, expect } from "./fixtures";
import { openAgentProviderPage } from "./utils";

test.describe("Agent Provider Management", () => {
  test("should show empty state when no models configured", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await page.waitForTimeout(2000);

    await expect(page.locator(".arco-empty")).toBeVisible({ timeout: 10000 });
    await page.close();
  });

  test("should open add model dialog with correct form fields", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 点击添加按钮
    const addBtn = page.locator("button.arco-btn-primary").first();
    await addBtn.click();

    // 验证弹窗出现
    const modal = page.locator(".arco-modal");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 验证表单包含名称输入框
    const nameInput = modal.locator('input[placeholder*="GPT"]').first();
    await expect(nameInput).toBeVisible();

    // 验证 Provider 选择器（默认 OpenAI）
    const providerSelect = modal.locator(".arco-select").first();
    await expect(providerSelect).toBeVisible();
    await expect(providerSelect.locator("text=OpenAI")).toBeVisible();

    // 验证 API Base URL 输入框
    const baseUrlInput = modal.locator('input[placeholder*="openai"]').first();
    await expect(baseUrlInput).toBeVisible();

    // 验证 API Key 输入框
    await expect(modal.locator("input[type='password']").first()).toBeVisible();

    // 验证模型 Select
    await expect(modal.locator(".arco-select").last()).toBeVisible();

    // 验证测试连接按钮
    const testBtn = modal.locator("button", { hasText: /test|测试/i }).first();
    await expect(testBtn).toBeVisible();

    // 取消关闭弹窗
    await modal
      .locator("button", { hasText: /cancel|取消/i })
      .first()
      .click();
    await page.waitForTimeout(500);
    await expect(modal).not.toBeVisible();

    await page.close();
  });

  test("should switch provider between OpenAI and Anthropic", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 打开添加弹窗
    await page.locator("button.arco-btn-primary").first().click();
    const modal = page.locator(".arco-modal");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 默认是 OpenAI，placeholder 应包含 openai.com
    const baseUrlInput = modal.locator('input[placeholder*="openai"]');
    await expect(baseUrlInput.first()).toBeVisible();

    // 切换到 Anthropic
    const providerSelect = modal.locator(".arco-select").first();
    await providerSelect.click();
    await page.waitForTimeout(300);
    await page.locator(".arco-select-option", { hasText: "Anthropic" }).click();
    await page.waitForTimeout(500);

    // placeholder 应变为 anthropic.com
    const anthropicInput = modal.locator('input[placeholder*="anthropic"]');
    await expect(anthropicInput.first()).toBeVisible();

    await page.close();
  });
});
