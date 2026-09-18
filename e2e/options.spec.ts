import path from "path";
import { chromium } from "@playwright/test";
import { test, expect } from "./fixtures";
import { headlessArgs } from "./launch-args";
import { openOptionsPage } from "./utils";

// new-ui 选项页（shadcn）：侧边栏为 React Router NavLink（HashRouter → a[href="#/..."]），
// 主题切换为循环按钮(data-testid="theme-toggle")，新建脚本按钮(data-testid="create-script")
// 在可 hover 的指针下点击直接新建用户脚本、hover 才展开 Radix 下拉，脚本列表空状态
// data-testid="script-list-empty"。
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

  test("新建脚本按钮 hover 应展开下拉菜单", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    // 前置条件：菜单只在指针可 hover 时走 hover 展开。断言一下，环境若报成无指针
    // （无头 Linux 的默认行为）能直接看出是环境问题而非功能回归。
    expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(true);
    await page.getByTestId("create-script").hover();

    const menuItems = page.locator('[role="menuitem"]');
    await expect(menuItems.first()).toBeVisible({ timeout: 10_000 });
    expect(await menuItems.count()).toBeGreaterThanOrEqual(3);
  });

  test("新建脚本按钮点击应直接进入编辑器", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await page.getByTestId("create-script").click();

    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("#/script/editor");
  });

  test("脚本列表为空时应显示空状态", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await expect(page.getByTestId("script-list-empty")).toBeVisible({ timeout: 10_000 });
  });
});

// 平板横屏 / 触屏笔记本：视口够宽(≥768px)会渲染桌面工具栏，但指针不支持 hover。
// 若这种设备也走 hover 菜单，下拉里的后台/定时脚本与三种导入入口将完全无法触达，
// 因此需要独立启动一个触摸模拟的浏览器验证降级为点击展开。共享 fixture 固定了启动参数，
// 这里参照 gm-api.spec.ts 的做法自行启动。
test.describe("Options 选项页 · 触摸设备", () => {
  test("桌面视口下无 hover 能力时，点击新建脚本按钮应展开菜单而非直接新建", async () => {
    const pathToExtension = path.resolve(__dirname, "../dist/ext");
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        ...headlessArgs(),
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        "--disable-gpu",
      ],
      viewport: { width: 1200, height: 800 },
      hasTouch: true,
      isMobile: true,
      timeout: 60_000,
    });
    try {
      await context.addInitScript(() => {
        try {
          localStorage.setItem("firstUse", "false");
        } catch {
          // about:blank 等不透明来源无法访问 localStorage，忽略即可
        }
      });

      let sw = context.serviceWorkers()[0];
      if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 30_000 });
      const extensionId = new URL(sw.url()).host;
      const page = await openOptionsPage(context, extensionId);

      // 先确认模拟到位：宽度仍走桌面工具栏，但指针不可 hover
      const media = await page.evaluate(() => ({
        canHover: matchMedia("(hover: hover)").matches,
        width: innerWidth,
      }));
      expect(media.canHover).toBe(false);
      expect(media.width).toBeGreaterThanOrEqual(768);

      await page.getByTestId("create-script").tap();

      const menuItems = page.locator('[role="menuitem"]');
      await expect(menuItems.first()).toBeVisible({ timeout: 10_000 });
      expect(await menuItems.count()).toBeGreaterThanOrEqual(3);
      expect(page.url()).not.toContain("#/script/editor");
    } finally {
      await context.close();
    }
  });
});
