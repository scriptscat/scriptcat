import { test, expect } from "./fixtures";
import { openAgentChatPage, openAgentProviderPage, openOptionsPage } from "./utils";

// new-ui 侧边栏 Agent 子菜单（shadcn）：折叠态切换按钮 data-testid="nav-agent"，
// 展开后子项为 NavLink（a[href="#/agent/..."]），容器 data-testid="sidebar-agent-submenu"。
test.describe("Agent 导航", () => {
  test("应通过侧边栏展开 Agent 菜单并进入会话页", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    await page.getByTestId("nav-agent").click();
    const submenu = page.getByTestId("sidebar-agent-submenu");
    await expect(submenu).toBeVisible({ timeout: 10_000 });

    await submenu.locator('a[href="#/agent/chat"]').click();
    await expect(page).toHaveURL(/#\/agent\/chat/);
    await page.close();
  });

  test("应通过侧边栏进入 Agent 模型服务页", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    await page.getByTestId("nav-agent").click();
    const submenu = page.getByTestId("sidebar-agent-submenu");
    await expect(submenu).toBeVisible({ timeout: 10_000 });

    await submenu.locator('a[href="#/agent/provider"]').click();
    await expect(page).toHaveURL(/#\/agent\/provider/);
    await page.close();
  });

  test("应能直接加载 Agent 会话页", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);
    await expect(page.getByTestId("conv-new")).toBeVisible({ timeout: 10_000 });
    await page.close();
  });

  test("应能直接加载 Agent 模型服务页", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await expect(page.getByTestId("model-add")).toBeVisible({ timeout: 10_000 });
    await page.close();
  });

  test("未配置模型时模型服务页应显示空状态", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: 10_000 });
    await page.close();
  });
});
