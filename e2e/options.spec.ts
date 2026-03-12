import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";

test.describe("Options Page", () => {
  test("should load and display ScriptCat title and logo", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Check logo is visible
    const logo = page.locator('img[alt="ScriptCat"]');
    await expect(logo).toBeVisible();

    // Check title text
    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible();
  });

  test("should navigate via sidebar menu items", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Wait for the sidebar menu to be visible (use first() since there are two menus)
    await expect(page.locator(".arco-menu").first()).toBeVisible();

    // Click "Subscribe" / "订阅" menu item and verify route change
    await page
      .locator(".arco-menu-item")
      .filter({ hasText: /subscribe|订阅/i })
      .first()
      .click();
    await expect(page).toHaveURL(/.*#\/subscribe/);

    // Click "Logs" / "日志" menu item
    await page
      .locator(".arco-menu-item")
      .filter({ hasText: /log|日志/i })
      .first()
      .click();
    await expect(page).toHaveURL(/.*#\/logger/);

    // Click "Tools" / "工具" menu item
    await page
      .locator(".arco-menu-item")
      .filter({ hasText: /tool|工具/i })
      .first()
      .click();
    await expect(page).toHaveURL(/.*#\/tools/);

    // Click "Settings" / "设置" menu item
    await page
      .locator(".arco-menu-item")
      .filter({ hasText: /setting|设置/i })
      .first()
      .click();
    await expect(page).toHaveURL(/.*#\/setting/);

    // Navigate back to script list (home) - click the first menu item
    await page
      .locator(".arco-menu-item")
      .filter({ hasText: /installed.*script|已安装脚本/i })
      .first()
      .click();
    await expect(page).toHaveURL(/.*#\//);
  });

  test("should show theme switch dropdown with light/dark/auto options", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Find the theme toggle button in the action-tools area (icon-only button)
    const actionTools = page.locator(".action-tools");
    const themeButton = actionTools.locator(".arco-btn-icon-only").first();
    await themeButton.click();

    // Verify dropdown with theme options appears - use role="menuitem"
    const menuItems = page.locator('[role="menuitem"]');
    await expect(menuItems.first()).toBeVisible({ timeout: 5000 });
    const count = await menuItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("should show create script dropdown menu", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // The create script button is the first text button in action-tools
    const createBtn = page.locator(".action-tools .arco-btn-text").first();
    await createBtn.click();

    // Verify dropdown menu appears - use role="menuitem"
    const menuItems = page.locator('[role="menuitem"]');
    await expect(menuItems.first()).toBeVisible({ timeout: 5000 });
    const count = await menuItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("should show empty state when script list is empty", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Wait for the content area to load
    await page.waitForTimeout(2000);

    // The empty state component from arco-design should be visible
    const emptyState = page.locator(".arco-empty");
    await expect(emptyState).toBeVisible({ timeout: 10_000 });
  });
});
