import { test, expect } from "./fixtures";
import { openEditorPage, openOptionsPage, saveCurrentEditor } from "./utils";

test.describe("Script Editor", () => {
  test("should load editor page with Monaco editor", async ({ context, extensionId }) => {
    const page = await openEditorPage(context, extensionId);

    // Wait for Monaco editor to render
    const monacoEditor = page.locator(".monaco-editor");
    await expect(monacoEditor).toBeVisible({ timeout: 10_000 });
  });

  test("should load new user script template", async ({ context, extensionId }) => {
    const page = await openEditorPage(context, extensionId);

    // Wait for Monaco editor
    const monacoEditor = page.locator(".monaco-editor");
    await expect(monacoEditor).toBeVisible({ timeout: 10_000 });

    // The editor should contain a UserScript header with default template content
    const editorContent = page.locator(".view-lines");
    await expect(editorContent).toContainText("==UserScript==", { timeout: 10_000 });
  });

  test("should save script successfully", async ({ context, extensionId }) => {
    const page = await openEditorPage(context, extensionId);

    // Wait for Monaco editor to fully load
    const monacoEditor = page.locator(".monaco-editor");
    await expect(monacoEditor).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".view-lines")).toContainText("==UserScript==", { timeout: 10_000 });

    await saveCurrentEditor(context, extensionId, page);
  });

  test("should show newly created script in the list after saving", async ({ context, extensionId }) => {
    // First create a script via the editor
    const editorPage = await openEditorPage(context, extensionId);

    await expect(editorPage.locator(".monaco-editor")).toBeVisible({ timeout: 10_000 });
    await expect(editorPage.locator(".view-lines")).toContainText("==UserScript==", {
      timeout: 10_000,
    });

    await saveCurrentEditor(context, extensionId, editorPage);

    // Now open the options page to check the script list
    const listPage = await openOptionsPage(context, extensionId);

    // The script list should now contain at least one script entry (no empty state)
    const emptyState = listPage.locator(".arco-empty");
    await expect(emptyState).toHaveCount(0);
  });
});
