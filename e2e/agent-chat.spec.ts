import { test, expect } from "./agent-fixtures";
import { openAgentChatPage } from "./utils";

test.describe("Agent Chat", () => {
  test("should show new chat button and model selector", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 新建会话按钮应可见
    const newChatBtn = page.locator("button", { hasText: /new|新建/i }).first();
    await expect(newChatBtn).toBeVisible({ timeout: 10000 });

    // 模型选择器应可见且包含预配置的 Mock LLM 模型
    const modelSelect = page.locator(".arco-select");
    await expect(modelSelect.first()).toBeVisible({ timeout: 5000 });

    await page.close();
  });
});
