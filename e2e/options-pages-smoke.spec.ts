import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";
import type { Locator, Page } from "@playwright/test";

// 高价值回归网:逐一访问每个 options 路由,断言「无未捕获异常 / 无 doThrow 报错」。
// 这能廉价地兜住「页面挂载即抛错」一类缺陷(例如 getDefaultModelId 在全新安装无默认模型
// 时用 doThrow 抛错导致模型服务/会话页卡死的回归)。
const ROUTES: Array<{ path: string; name: string; anchor: (page: Page) => Locator }> = [
  { path: "/", name: "脚本列表", anchor: (page) => page.getByTestId("view-toggle") },
  { path: "/subscribe", name: "订阅列表", anchor: (page) => page.getByTestId("subscribe-page") },
  { path: "/logs", name: "日志页", anchor: (page) => page.getByTestId("level-chip-bar") },
  { path: "/tools", name: "工具页", anchor: (page) => page.getByTestId("tools_export") },
  { path: "/settings", name: "设置页", anchor: (page) => page.getByTestId("setting-page") },
  { path: "/agent/chat", name: "Agent 会话", anchor: (page) => page.getByTestId("conv-new") },
  {
    path: "/agent/provider",
    name: "Agent 模型服务",
    anchor: (page) => page.getByTestId("model-add").or(page.getByTestId("empty-state")).first(),
  },
  {
    path: "/agent/skills",
    name: "Agent Skills",
    anchor: (page) => page.getByTestId("skill-add").or(page.getByTestId("empty-state")).first(),
  },
  {
    path: "/agent/mcp",
    name: "Agent MCP",
    anchor: (page) => page.getByTestId("mcp-add").or(page.getByTestId("empty-state")).first(),
  },
  {
    path: "/agent/tasks",
    name: "Agent 定时任务",
    anchor: (page) => page.getByTestId("task-add").or(page.getByTestId("empty-state")).first(),
  },
  {
    path: "/agent/opfs",
    name: "Agent OPFS",
    anchor: (page) => page.getByTestId("opfs-refresh").or(page.getByTestId("empty-state")).first(),
  },
  { path: "/agent/settings", name: "Agent 设置", anchor: (page) => page.getByTestId("search-engine") },
  { path: "/script/editor", name: "脚本编辑器", anchor: (page) => page.locator(".monaco-editor") },
  { path: "/agent", name: "旧 Agent 入口重定向", anchor: (page) => page.getByTestId("conv-new") },
  { path: "/logger", name: "旧日志入口重定向", anchor: (page) => page.getByTestId("level-chip-bar") },
  { path: "/setting", name: "旧设置入口重定向", anchor: (page) => page.getByTestId("setting-page") },
];

test.describe("Options 各页加载冒烟", () => {
  test("每个路由挂载后均无未捕获异常且出现页面锚点", async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    const errorsByRoute: Record<string, string[]> = {};
    let current = "/";
    page.on("pageerror", (e) => {
      (errorsByRoute[current] ??= []).push(`pageerror: ${e.message}`);
    });

    for (const route of ROUTES) {
      current = route.path;
      await page.goto(`chrome-extension://${extensionId}/src/options.html#${route.path}`);
      await page.waitForLoadState("domcontentloaded");
      await expect(route.anchor(page), `${route.name} (${route.path}) 未渲染稳定锚点`).toBeVisible({
        timeout: 20_000,
      });
      // 给页面挂载副作用(数据加载/消息往返)一点时间触发可能的异常。
      await page.waitForTimeout(500);
    }

    expect(errorsByRoute, JSON.stringify(errorsByRoute, null, 2)).toEqual({});
    await page.close();
  });
});
