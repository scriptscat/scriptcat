import { test, expect } from "./fixtures";
import { openAgentChatPage, openAgentProviderPage, openOptionsPage } from "./utils";

test.describe("Agent Navigation", () => {
  test("should navigate to agent chat page via sidebar", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await page.waitForTimeout(1000);

    // Agent SubMenu title 的 onClick 直接导航到 /agent/chat
    // Sider.tsx 中 SubMenu title 的 span onClick 设置 hash
    const agentMenuTitle = page.locator(".arco-menu-inline-header span", { hasText: /agent/i }).first();
    await agentMenuTitle.click();
    await page.waitForTimeout(1000);

    // 验证 URL hash 包含 /agent
    expect(page.url()).toContain("#/agent");
    await page.close();
  });

  test("should navigate to agent sub-pages via sidebar", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await page.waitForTimeout(1000);

    // 先展开 Agent 子菜单
    const agentMenuHeader = page.locator(".arco-menu-inline-header").filter({ hasText: /agent/i }).first();
    await agentMenuHeader.click();
    await page.waitForTimeout(500);

    // 展开后点击 Provider 子菜单项（使用 key 属性匹配）
    const providerItem = page
      .locator('[class*="arco-menu-item"]')
      .filter({ hasText: /model service|provider|模型/i })
      .first();
    await providerItem.click();
    await page.waitForTimeout(1000);

    expect(page.url()).toContain("#/agent/provider");
    await page.close();
  });

  test("should load agent chat page directly", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 聊天页面应包含新建会话按钮
    const newChatBtn = page.locator("button", { hasText: /new|新建/i }).first();
    await expect(newChatBtn).toBeVisible({ timeout: 10000 });
    await page.close();
  });

  test("should load agent provider page directly", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await page.waitForTimeout(2000);

    // Provider 页面应包含添加模型按钮
    const addBtn = page.locator("button", { hasText: /add|添加/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await page.close();
  });

  test("should show empty state on provider page when no models configured", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 没有配置模型时应显示空状态
    const emptyState = page.locator(".arco-empty");
    await expect(emptyState).toBeVisible({ timeout: 10000 });
    await page.close();
  });
});
