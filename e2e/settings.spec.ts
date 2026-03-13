import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";

test.describe("Settings Page", () => {
  test("should render the settings page", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Navigate to settings via hash route
    await page.goto(`chrome-extension://${extensionId}/src/options.html#/setting`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for the settings page to render
    await page.waitForTimeout(2000);

    // The settings page should have visible content (cards, selects, inputs, etc.)
    const content = page.locator(".arco-layout-content");
    await expect(content).toBeVisible();
  });

  test("should have visible and interactive settings items", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Navigate to settings
    await page.goto(`chrome-extension://${extensionId}/src/options.html#/setting`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Check that at least one Select component or Input is visible
    const selects = page.locator(".arco-select");
    const inputs = page.locator(".arco-input");
    const checkboxes = page.locator(".arco-checkbox");

    const selectCount = await selects.count();
    const inputCount = await inputs.count();
    const checkboxCount = await checkboxes.count();

    // Settings page should have at least some interactive elements
    expect(selectCount + inputCount + checkboxCount).toBeGreaterThan(0);
  });
});
