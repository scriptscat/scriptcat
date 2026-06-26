import { test, expect } from "./fixtures";
import type { BrowserContext, Page } from "@playwright/test";
import { openEditorPage, openOptionsPage, saveCurrentEditor } from "./utils";

// new-ui 脚本列表（shadcn 表格视图，桌面默认）：空状态 data-testid="script-list-empty"，
// 每行启用开关为 Radix Switch(role=switch)，删除为行内 Trash2 图标 + Popconfirm
// (确认按钮 data-testid="popconfirm-confirm")，搜索框 data-testid="script-search"。

/** 通过编辑器创建一个脚本，再打开脚本列表 */
async function createScriptAndGoToList(context: BrowserContext, extensionId: string): Promise<Page> {
  const editorPage = await openEditorPage(context, extensionId);
  await expect(editorPage.locator(".monaco-editor")).toBeVisible({ timeout: 10_000 });
  await expect(editorPage.locator(".view-lines")).toContainText("==UserScript==", { timeout: 10_000 });
  await saveCurrentEditor(context, extensionId, editorPage);
  await editorPage.close();

  return openOptionsPage(context, extensionId);
}

test.describe("脚本管理", () => {
  test("创建脚本后应出现在列表中", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);
    // 列表非空（无空状态）
    await expect(page.getByTestId("script-list-empty")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 10_000 });
  });

  test("应能切换脚本的启用/禁用", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);

    const scriptSwitch = page.getByRole("switch").first();
    await expect(scriptSwitch).toBeVisible({ timeout: 10_000 });

    const initialChecked = await scriptSwitch.getAttribute("aria-checked");
    await scriptSwitch.click();
    await expect(scriptSwitch).not.toHaveAttribute("aria-checked", initialChecked || "", { timeout: 10_000 });
  });

  test("应能删除脚本", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);

    // 行内删除按钮（Trash2 图标，lucide class 语言无关）
    const deleteBtn = page.locator("button:has(svg.lucide-trash-2)").first();
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    // Popconfirm 确认
    await page.getByTestId("popconfirm-confirm").click();

    // 删除后回到空状态
    await expect(page.getByTestId("script-list-empty")).toBeVisible({ timeout: 10_000 });
  });

  test("应能搜索/过滤脚本", async ({ context, extensionId }) => {
    const page = await createScriptAndGoToList(context, extensionId);

    const search = page.getByTestId("script-search");
    await expect(search).toBeVisible({ timeout: 10_000 });

    // 不匹配的关键字 → 空状态
    await search.fill("nonexistent_script_xyz");
    await expect(page.getByTestId("script-list-empty")).toBeVisible({ timeout: 10_000 });

    // 清空 → 脚本重新出现
    await search.fill("");
    await expect(page.getByTestId("script-list-empty")).toHaveCount(0, { timeout: 10_000 });
  });
});
