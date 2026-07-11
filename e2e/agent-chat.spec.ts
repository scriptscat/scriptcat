import { test, expect } from "./agent-fixtures";
import { openAgentChatPage } from "./utils";

// new-ui Agent 会话页（shadcn）：新建会话按钮 data-testid="conv-new"（会话列表）/
// "header-new"（顶栏）；模型选择器 data-testid="agent-model-select"（Radix Select）。
// agent-fixtures 预置了 "Mock LLM" 模型，故选择器可用。
test.describe("Agent 会话", () => {
  test("应显示新建会话按钮和模型选择器", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);

    // 新建会话按钮（会话列表侧栏常驻）
    await expect(page.getByTestId("conv-new")).toBeVisible({ timeout: 10_000 });

    // 模型选择器可见
    await expect(page.getByTestId("agent-model-select")).toBeVisible({ timeout: 10_000 });

    await page.close();
  });
});
