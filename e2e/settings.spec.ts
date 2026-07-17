import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";

// new-ui 设置页（shadcn，scroll-spy 一次性渲染全部分区）：路由 #/settings，
// 滚动容器 data-testid="setting-page"；交互控件为 Radix Select(role=combobox)/
// Switch(role=switch)/Checkbox(role=checkbox) 及原生 input。
test.describe("Settings 设置页", () => {
  test("应渲染设置页内容容器", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await page.goto(`chrome-extension://${extensionId}/src/options.html#/settings`);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("setting-page")).toBeVisible({ timeout: 10_000 });
  });

  test("应包含可见且可交互的设置项", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);
    await page.goto(`chrome-extension://${extensionId}/src/options.html#/settings`);
    await page.waitForLoadState("domcontentloaded");

    const combobox = page.getByRole("combobox");
    const switches = page.getByRole("switch");
    const checkboxes = page.getByRole("checkbox");
    const inputs = page.locator("input");

    await expect
      .poll(
        async () =>
          (await combobox.count()) + (await switches.count()) + (await checkboxes.count()) + (await inputs.count()),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);
  });
});
