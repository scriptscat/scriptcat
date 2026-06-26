import type { BrowserContext } from "@playwright/test";
import { test, expect } from "./fixtures";

// new-ui 安装页（shadcn，data-testid 丰富）：?url= 触发页面级 fetch 拉取脚本，
// 用 page.route 拦截避免真实网络抖动；脚本元信息渲染后 content-area 可见、
// 主操作按钮(install-primary)可用、脚本名出现在 h1。
const SCRIPT_URL = "https://e2e.test/install-test.user.js";
const SCRIPT_NAME = "E2E Install Test";
const SCRIPT_BODY = `// ==UserScript==
// @name         ${SCRIPT_NAME}
// @namespace    https://e2e.test
// @version      1.0.0
// @description  install page e2e
// @author       E2E
// @match        https://example.com/*
// ==/UserScript==

console.log("install e2e");
`;

async function openMockedInstallPage(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  // 必须在 goto 之前注册路由，安装页挂载即发起 fetch
  await page.route("**/install-test.user.js", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
      body: SCRIPT_BODY,
    })
  );
  // 安装页按原始子串读取 url=（location.search.slice），不做 decode，故此处不能 encodeURIComponent
  await page.goto(`chrome-extension://${extensionId}/src/install.html?url=${SCRIPT_URL}`, {
    waitUntil: "domcontentloaded",
  });
  return page;
}

test.describe("Install 安装页", () => {
  test("应通过 URL 参数打开安装页且标题为 ScriptCat", async ({ context, extensionId }) => {
    const page = await openMockedInstallPage(context, extensionId);
    await expect(page).toHaveTitle(/ScriptCat/i);
  });

  test("加载脚本后应展示脚本元信息并可安装", async ({ context, extensionId }) => {
    const page = await openMockedInstallPage(context, extensionId);

    // 脚本名渲染（元信息加载完成的可见信号）
    await expect(page.getByText(SCRIPT_NAME).first()).toBeVisible({ timeout: 15_000 });
    // 内容区已填充
    await expect(page.getByTestId("content-area")).toBeVisible({ timeout: 10_000 });
    // 主操作按钮可用（非 disabled）
    await expect(page.getByTestId("install-primary")).toBeEnabled({ timeout: 10_000 });
  });
});
