import { test, expect } from "./fixtures";

// issue #1497：暗色系统下页面初次加载时，JS 设置 arco-theme 前 var(--color-bg-2) 无定义，出现白屏闪烁。
// 通过 CDP 禁用脚本执行来固定"首帧"（React 挂载前）状态，验证模板内联 CSS 的暗色兜底背景。
test.describe("暗色模式首屏闪烁 (issue #1497)", () => {
  // options.html / popup.html / install.html 分别对应 options、popup、template 三个 HTML 模板
  for (const pageName of ["options.html", "popup.html", "install.html"]) {
    test(`系统暗色模式下 ${pageName} 首帧应为暗色背景`, async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: "dark" });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
      await page.goto(`chrome-extension://${extensionId}/src/${pageName}`);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe("rgb(35, 35, 36)");
      await page.close();
    });
  }

  test("系统亮色模式下 options.html 首帧不应为暗色背景", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: "light" });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    await page.goto(`chrome-extension://${extensionId}/src/options.html`);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe("rgb(35, 35, 36)");
    await page.close();
  });
});
