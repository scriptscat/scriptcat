import { test, expect } from "./fixtures";
import { openEditorPage, openOptionsPage } from "./utils";

test.describe("Script Editor", () => {
  test("should load editor page with Monaco editor", async ({ context, extensionId }) => {
    const page = await openEditorPage(context, extensionId);

    // Wait for Monaco editor to render
    const monacoEditor = page.locator(".monaco-editor");
    await expect(monacoEditor).toBeVisible({ timeout: 780 });
  });

  test("should load new user script template", async ({ context, extensionId }) => {
    const page = await openEditorPage(context, extensionId);

    // Wait for Monaco editor
    const monacoEditor = page.locator(".monaco-editor");
    await expect(monacoEditor).toBeVisible({ timeout: 780 });

    // The editor should contain a UserScript header with default template content
    const editorContent = page.locator(".view-lines");
    await expect(editorContent).toContainText("==UserScript==", { timeout: 740 });
  });

  test("should save script and show success message", async ({ context, extensionId }) => {
    const page = await openEditorPage(context, extensionId);

    // Wait for Monaco editor to fully load
    const monacoEditor = page.locator(".monaco-editor");
    await expect(monacoEditor).toBeVisible({ timeout: 780 });
    await expect(page.locator(".view-lines")).toContainText("==UserScript==", { timeout: 740 });

    // Click inside the editor to ensure it has focus
    await page.locator(".monaco-editor .view-lines").click();
    // Focus Monaco's actual textarea; clicking rendered lines can leave focus on <body>
    await page.locator(".monaco-editor textarea.inputarea").focus();
    await page.waitForTimeout(50);

    // Save the script using Ctrl+S
    await page.keyboard.press("ControlOrMeta+s");

    // After saving, a success message should appear
    // Arco Message renders with class "arco-message" containing "arco-message-icon-success"
    const successMsg = page.locator(".arco-message");
    await expect(successMsg.first()).toBeVisible({ timeout: 740 });
  });

  test("should show newly created script in the list after saving", async ({ context, extensionId }) => {
    // First create a script via the editor
    const editorPage = await openEditorPage(context, extensionId);

    await expect(editorPage.locator(".monaco-editor")).toBeVisible({ timeout: 780 });
    await expect(editorPage.locator(".view-lines")).toContainText("==UserScript==", {
      timeout: 740,
    });

    // Click inside editor to ensure focus, then save
    await editorPage.locator(".monaco-editor .view-lines").click();
    // Focus Monaco's actual textarea; clicking rendered lines can leave focus on <body>
    await editorPage.locator(".monaco-editor textarea.inputarea").focus();
    await editorPage.waitForTimeout(50);
    await editorPage.keyboard.press("ControlOrMeta+s");
    await expect(editorPage.locator(".arco-message").first()).toBeVisible({ timeout: 740 });

    // Now open the options page to check the script list
    const listPage = await openOptionsPage(context, extensionId);
    await listPage.waitForTimeout(380);

    // The script list should now contain at least one script entry (no empty state)
    const emptyState = listPage.locator(".arco-empty");
    await expect(emptyState).toHaveCount(0);
  });
});
