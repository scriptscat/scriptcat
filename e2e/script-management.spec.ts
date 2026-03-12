import { test, expect } from "./fixtures";
import type { BrowserContext, Page } from "@playwright/test";
import { openEditorPage, openOptionsPage } from "./utils";

/**
 * Helper: create a script via the editor, then open the options page.
 */
async function createScriptAndGoToList(context: BrowserContext, extensionId: string): Promise<Page> {
  const editorPage = await openEditorPage(context, extensionId);

  // Wait for Monaco editor
  await expect(editorPage.locator(".monaco-editor")).toBeVisible({ timeout: 30_000 });
  await expect(editorPage.locator(".view-lines")).toContainText("==UserScript==", {
    timeout: 15_000,
  });

  // Click inside editor to ensure focus, then save
  await editorPage.locator(".monaco-editor .view-lines").click();
  await editorPage.waitForTimeout(500);
  await editorPage.keyboard.press("ControlOrMeta+s");

  // Wait for success message, retry once if needed
  try {
    await expect(editorPage.locator(".arco-message").first()).toBeVisible({ timeout: 10_000 });
  } catch {
    // Retry: click editor again and resave
    await editorPage.locator(".monaco-editor .view-lines").click();
    await editorPage.waitForTimeout(500);
    await editorPage.keyboard.press("ControlOrMeta+s");
    await expect(editorPage.locator(".arco-message").first()).toBeVisible({ timeout: 15_000 });
  }

  // Open the options page (script list)
  const page = await openOptionsPage(context, extensionId);
  await page.waitForTimeout(2000);

  return page;
}

test.describe("Script Management", () => {
  test("should create a script and see it in the list", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);

    // The script list should have at least one entry (no empty state)
    const emptyState = page.locator(".arco-empty");
    await expect(emptyState).toHaveCount(0);
  });

  test("should toggle enable/disable on a script", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);

    // Find the switch/toggle in the script list
    const scriptSwitch = page.locator(".arco-switch").first();
    await expect(scriptSwitch).toBeVisible({ timeout: 10_000 });

    // Get initial state
    const initialChecked = await scriptSwitch.getAttribute("aria-checked");

    // Click to toggle
    await scriptSwitch.click();
    await page.waitForTimeout(1000);

    // The state should have changed
    const newChecked = await scriptSwitch.getAttribute("aria-checked");
    expect(newChecked).not.toBe(initialChecked);
  });

  test("should delete a script", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);

    // Right-click on a script row to get context menu
    const scriptRow = page.locator(".arco-table-row, .arco-card-body .arco-list-item, [class*='script']").first();
    if (await scriptRow.isVisible()) {
      await scriptRow.click({ button: "right" });
      await page.waitForTimeout(500);

      // Look for delete option in context menu
      const deleteOption = page.getByText(/delete|删除/i).first();
      if (await deleteOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteOption.click();

        // Confirm deletion if a modal appears
        const confirmBtn = page.locator(".arco-modal .arco-btn-primary");
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }

        await page.waitForTimeout(2000);

        // After deletion, the list should be empty again
        const emptyState = page.locator(".arco-empty");
        await expect(emptyState).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test("should search/filter scripts", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);

    // Look for a search input
    const searchInput = page.locator('input[type="text"], .arco-input').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Type a search query that won't match
      await searchInput.fill("nonexistent_script_xyz");
      await page.waitForTimeout(1000);

      // The list should show empty or no results
      const emptyState = page.locator(".arco-empty");
      await expect(emptyState).toBeVisible({ timeout: 5000 });

      // Clear search and scripts should reappear
      await searchInput.clear();
      await page.waitForTimeout(1000);
      await expect(emptyState).toHaveCount(0);
    }
  });
});
