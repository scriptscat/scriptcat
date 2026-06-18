import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";

// 高价值回归网:逐一访问每个 options 路由,断言「无未捕获异常 / 无 doThrow 报错」。
// 这能廉价地兜住「页面挂载即抛错」一类缺陷(例如 getDefaultModelId 在全新安装无默认模型
// 时用 doThrow 抛错导致模型服务/会话页卡死的回归)。
const ROUTES = [
  "/",
  "/subscribe",
  "/logs",
  "/tools",
  "/settings",
  "/agent/chat",
  "/agent/provider",
  "/agent/skills",
  "/agent/mcp",
  "/agent/tasks",
  "/agent/opfs",
  "/agent/settings",
];

test.describe("Options 各页加载冒烟", () => {
  test("每个路由挂载后均无未捕获异常", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    const errorsByRoute: Record<string, string[]> = {};
    let current = "/";
    page.on("pageerror", (e) => {
      (errorsByRoute[current] ??= []).push(`pageerror: ${e.message}`);
    });

    for (const route of ROUTES) {
      current = route;
      await page.goto(`chrome-extension://${extensionId}/src/options.html#${route}`);
      await page.waitForLoadState("domcontentloaded");
      // 给页面挂载副作用(数据加载/消息往返)一点时间触发可能的异常
      await page.waitForTimeout(1500);
    }

    expect(errorsByRoute, JSON.stringify(errorsByRoute, null, 2)).toEqual({});
    await page.close();
  });
});
