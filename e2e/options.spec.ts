import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";

// new-ui 选项页（shadcn）：侧边栏为 React Router NavLink（HashRouter → a[href="#/..."]），
// 主题切换为循环按钮(data-testid="theme-toggle")，新建脚本为 Radix 下拉
// (data-testid="create-script")，脚本列表空状态 data-testid="script-list-empty"。
test.describe("Options 选项页", () => {
  test("应加载并显示 ScriptCat 标题和 Logo", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await expect(page.locator('img[alt="ScriptCat"]')).toBeVisible();
    await expect(page.getByText("ScriptCat", { exact: true }).first()).toBeVisible();
  });

  test("应通过侧边栏导航切换路由", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    const side = page.locator("aside");
    await expect(side).toBeVisible();

    await side.locator('a[href="#/subscribe"]').click();
    await expect(page).toHaveURL(/#\/subscribe/);

    await side.locator('a[href="#/logs"]').click();
    await expect(page).toHaveURL(/#\/logs/);

    await side.locator('a[href="#/tools"]').click();
    await expect(page).toHaveURL(/#\/tools/);

    await side.locator('a[href="#/settings"]').click();
    await expect(page).toHaveURL(/#\/settings/);

    // 返回首页（脚本列表）
    await side.locator('a[href="#/"]').first().click();
    await expect(page).toHaveURL(/options\.html#\/$/);
  });

  test("主题切换按钮应在亮/暗/自动间循环", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    const themeBtn = page.getByTestId("theme-toggle");
    await expect(themeBtn).toBeVisible();

    // 循环切换会更换图标（Sun/Moon/Monitor），断言图标 class 变化
    const before = await themeBtn.locator("svg").getAttribute("class");
    await themeBtn.click();
    await expect.poll(() => themeBtn.locator("svg").getAttribute("class"), { timeout: 5_000 }).not.toBe(before);
  });

  test("新建脚本按钮应展开下拉菜单", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await page.getByTestId("create-script").click();

    const menuItems = page.locator('[role="menuitem"]');
    await expect(menuItems.first()).toBeVisible({ timeout: 10_000 });
    expect(await menuItems.count()).toBeGreaterThanOrEqual(3);
  });

  test("脚本列表为空时应显示空状态", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await expect(page.getByTestId("script-list-empty")).toBeVisible({ timeout: 10_000 });
  });
});
