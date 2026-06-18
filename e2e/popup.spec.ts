import { test, expect } from "./fixtures";
import { openPopupPage } from "./utils";

// new-ui popup（shadcn）：标题 h1、全局 Radix Switch、Radix Accordion 分组、
// 图标按钮（aria-label 设置/更多菜单）、Radix DropdownMenu（role=menuitem）。
test.describe("Popup 页面", () => {
  test("应加载并显示 ScriptCat 标题", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);
    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("应显示全局脚本启用/禁用开关", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);
    // 顶部全局开关为 Radix Switch（role=switch）
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 10_000 });
  });

  test("应渲染脚本分组折叠区", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);
    // 「当前页运行脚本」分组标题（0 脚本时分组仍渲染，仅内容为空提示）
    await expect(page.getByText(/current page|当前页/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("点击设置按钮应打开选项页", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);
    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible({ timeout: 10_000 });

    const existingPages = new Set(context.pages());
    await page.getByLabel("设置").click();

    // 首次引导页等可能同时打开，断言专门匹配 options 页而非最先到达的 page
    await expect
      .poll(
        () =>
          context
            .pages()
            .find((p) => !existingPages.has(p) && /options\.html/.test(p.url()))
            ?.url() || "",
        { timeout: 10_000 }
      )
      .toMatch(/options\.html/);
  });

  test("更多菜单应展开并含多个菜单项", async ({ context, extensionId }) => {
    const page = await openPopupPage(context, extensionId);
    await expect(page.getByText("ScriptCat", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("更多菜单").click();

    const menuItems = page.locator('[role="menuitem"]');
    await expect(menuItems.first()).toBeVisible({ timeout: 10_000 });
    expect(await menuItems.count()).toBeGreaterThanOrEqual(3);
  });
});
