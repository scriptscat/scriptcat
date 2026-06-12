import { test, expect } from "./fixtures";
import { openPopupPage } from "./utils";

test.describe("Popup Page", () => {
  test("should load and display ScriptCat title", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);

    // The popup should show "ScriptCat" title in the card header
    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("should show global script enable/disable switch", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);

    // The switch for enabling/disabling scripts should be present
    const globalSwitch = page.locator(".arco-switch").first();
    await expect(globalSwitch).toBeVisible({ timeout: 10_000 });
  });

  test("should render Collapse sections for scripts", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);

    // Wait for the collapse component to render
    const collapse = page.locator(".arco-collapse");
    await expect(collapse).toBeVisible({ timeout: 10_000 });

    // Should have at least one collapse item (current page scripts)
    const collapseItems = page.locator(".arco-collapse-item");
    const count = await collapseItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("should have settings button that works", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);

    // Wait for the popup to fully load
    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Find the settings button - it's an icon-only button in the header
    // The order is: Switch, Settings, Notification, MoreMenu
    const iconButtons = page.locator(".arco-btn-icon-only");
    // Settings is the first icon-only button
    const settingsBtn = iconButtons.first();
    await expect(settingsBtn).toBeVisible();

    const existingPages = new Set(context.pages());
    await settingsBtn.click();

    // Startup guide pages may open around the same time; assert on the
    // settings page specifically instead of whichever page event arrives first.
    await expect
      .poll(
        () =>
          context
            .pages()
            .find((p) => !existingPages.has(p) && /options\.html/.test(p.url()))
            ?.url() || "",
        { timeout: 10_000 }
      )
      .toMatch(/options\.html/);
  });

  test("should show more menu dropdown with items", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);

    // Wait for popup to load
    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible({ timeout: 10_000 });

    // The more menu button is the last icon-only button
    const iconButtons = page.locator(".arco-btn-icon-only");
    const count = await iconButtons.count();
    const moreBtn = iconButtons.nth(count - 1);
    await moreBtn.click();

    // The dropdown menu items use role="menuitem"
    const menuItems = page.locator('[role="menuitem"]');
    await expect(menuItems.first()).toBeVisible({ timeout: 10_000 });
    const itemCount = await menuItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(3);
  });
});
