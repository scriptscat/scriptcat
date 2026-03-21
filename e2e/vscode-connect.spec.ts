import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";
import type { Page } from "@playwright/test";
import { WebSocketServer, type WebSocket } from "ws";

// ────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────

/** 打开 Tools 页面 */
async function openToolsPage(context: Parameters<typeof openOptionsPage>[0], extensionId: string): Promise<Page> {
  const page = await openOptionsPage(context, extensionId);
  await page.goto(`chrome-extension://${extensionId}/src/options.html#/tools`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** 获取「开发调试」卡片区域的定位器 */
function getDevCard(page: Page) {
  // 开发调试 / Development Debugging 卡片是页面上第二个 Card
  return page.locator(".arco-card").nth(1);
}

/** 启动一个临时 WebSocket 服务器，返回 URL 和清理函数 */
function createMockWSServer(): Promise<{
  url: string;
  connections: WebSocket[];
  close: () => Promise<void>;
  /** 向所有已连接客户端发送消息 */
  broadcast: (data: unknown) => void;
  /** 等待收到指定 action 的消息 */
  waitForAction: (action: string, timeout?: number) => Promise<unknown>;
}> {
  return new Promise((resolve, reject) => {
    const connections: WebSocket[] = [];
    const messageListeners: Array<(msg: unknown) => void> = [];

    const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 }, () => {
      const addr = wss.address();
      if (typeof addr === "string") {
        reject(new Error("Unexpected address type"));
        return;
      }
      const url = `ws://127.0.0.1:${addr.port}`;

      wss.on("connection", (ws) => {
        connections.push(ws);
        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            for (const listener of messageListeners) {
              listener(msg);
            }
          } catch {
            // 忽略非 JSON 消息
          }
        });
      });

      resolve({
        url,
        connections,
        close: () =>
          new Promise<void>((res) => {
            for (const ws of connections) ws.close();
            wss.close(() => res());
          }),
        broadcast: (data: unknown) => {
          const payload = JSON.stringify(data);
          for (const ws of connections) {
            if (ws.readyState === ws.OPEN) {
              ws.send(payload);
            }
          }
        },
        waitForAction: (action: string, timeout = 10_000) =>
          new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
              const idx = messageListeners.indexOf(handler);
              if (idx >= 0) messageListeners.splice(idx, 1);
              reject(new Error(`Timeout waiting for action: ${action}`));
            }, timeout);

            const handler = (msg: any) => {
              if (msg.action === action) {
                clearTimeout(timer);
                const idx = messageListeners.indexOf(handler);
                if (idx >= 0) messageListeners.splice(idx, 1);
                resolve(msg);
              }
            };
            messageListeners.push(handler);
          }),
      });
    });
  });
}

// ────────────────────────────────────────────────
// 测试
// ────────────────────────────────────────────────

test.describe("VSCode 连接", () => {
  test("Tools 页面应显示 VSCode 连接相关 UI 元素", async ({ context, extensionId }) => {
    const page = await openToolsPage(context, extensionId);
    const card = getDevCard(page);

    // 卡片标题
    await expect(card.getByText(/development debugging|开发调试/i)).toBeVisible();

    // VSCode URL 输入框
    const urlInput = card.locator(".arco-input");
    await expect(urlInput).toBeVisible();
    // 默认值应包含 ws://
    const value = await urlInput.inputValue();
    expect(value).toMatch(/^ws:\/\//);

    // 自动连接复选框
    const checkbox = card.locator(".arco-checkbox");
    await expect(checkbox).toBeVisible();
    await expect(card.getByText(/auto connect vscode|自动连接vscode/i)).toBeVisible();

    // 连接按钮
    const connectBtn = card.locator(".arco-btn-primary");
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn.getByText(/connect|连接/i)).toBeVisible();
  });

  test("应能修改 VSCode URL 和切换自动连接", async ({ context, extensionId }) => {
    const page = await openToolsPage(context, extensionId);
    const card = getDevCard(page);

    // 修改 URL
    const urlInput = card.locator(".arco-input");
    await urlInput.clear();
    await urlInput.fill("ws://localhost:9999");
    await expect(urlInput).toHaveValue("ws://localhost:9999");

    // 切换自动连接复选框
    const checkbox = card.locator(".arco-checkbox input");
    const initialChecked = await checkbox.isChecked();
    await card.locator(".arco-checkbox").click();
    const newChecked = await checkbox.isChecked();
    expect(newChecked).toBe(!initialChecked);
  });

  test("点击连接按钮应发送连接命令", async ({ context, extensionId }) => {
    const page = await openToolsPage(context, extensionId);
    const card = getDevCard(page);

    // 连接按钮存在且可点击
    const connectBtn = card.locator(".arco-btn-primary");
    await connectBtn.click();

    // connectVSCode 是消息传递操作，消息投递成功即 resolve，
    // 所以即使没有 WebSocket 服务器运行，也应显示「连接成功」提示
    const successMsg = page.locator(".arco-message").getByText(/connection successful|连接成功/i);
    await expect(successMsg).toBeVisible({ timeout: 10_000 });
  });

  test("应能通过 WebSocket 连接并接收脚本同步", async ({ context, extensionId }) => {
    // 启动 Mock WebSocket 服务器
    const server = await createMockWSServer();

    try {
      const page = await openToolsPage(context, extensionId);
      const card = getDevCard(page);

      // 设置 URL 为 Mock 服务器地址
      const urlInput = card.locator(".arco-input");
      await urlInput.clear();
      await urlInput.fill(server.url);

      // 在点击连接之前就开始监听 hello 消息，避免竞态
      const helloPromise = server.waitForAction("hello", 30_000);

      // 等待 offscreen 文档就绪（service worker 启动后异步创建）
      await page.waitForTimeout(2000);

      // 点击连接
      const connectBtn = card.locator(".arco-btn-primary");
      await connectBtn.click();

      // 等待「连接成功」消息
      const successMsg = page.locator(".arco-message").getByText(/connection successful|连接成功/i);
      await expect(successMsg).toBeVisible({ timeout: 10_000 });

      // 等待收到 hello 握手消息
      await helloPromise;

      // 验证客户端已连接
      expect(server.connections.length).toBeGreaterThanOrEqual(1);

      // 发送 onchange 消息，模拟 VSCode 推送脚本
      const testScript = `// ==UserScript==
// @name         VSCode E2E Test Script
// @namespace    https://e2e.test/vscode
// @version      1.0.0
// @description  Script synced from VSCode E2E test
// @author       E2E
// @match        https://example.com/*
// ==/UserScript==

console.log("VSCode synced script");
`;

      server.broadcast({
        action: "onchange",
        data: {
          script: testScript,
          uri: "file:///e2e-test/vscode-sync-test.user.js",
        },
      });

      // 验证脚本已安装：导航到脚本列表，检查脚本是否出现
      const listPage = await openOptionsPage(context, extensionId);
      const scriptItem = listPage.getByText("VSCode E2E Test Script");
      await expect(scriptItem).toBeVisible({ timeout: 15_000 });
      await listPage.close();
    } finally {
      await server.close();
    }
  });
});
