import { test, expect } from "./fixtures";
import { openEditorPage, openOptionsPage, saveCurrentEditor } from "./utils";

// new-ui 脚本编辑器：路由 #/script/editor 加载空白模板（normal.tpl，含 ==UserScript==）；
// Monaco 选择器(.monaco-editor/.view-lines) 为框架级不变；保存成功为 sonner toast。
test.describe("Script 编辑器", () => {
  test("保存后脚本应出现在列表中", async ({ context, extensionId }) => {
    const editorPage = await openEditorPage(context, extensionId);
    await expect(editorPage.locator(".monaco-editor")).toBeVisible({ timeout: 10_000 });
    await expect(editorPage.locator(".view-lines")).toContainText("==UserScript==", { timeout: 10_000 });

    await saveCurrentEditor(context, extensionId, editorPage);

    const listPage = await openOptionsPage(context, extensionId);
    // 保存后列表非空（无空状态）
    await expect(listPage.getByTestId("script-list-empty")).toHaveCount(0, { timeout: 10_000 });
  });
});
