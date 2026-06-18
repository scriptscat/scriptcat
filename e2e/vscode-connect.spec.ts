import { test, expect } from "./fixtures";
import { openOptionsPage } from "./utils";
import type { BrowserContext, Page } from "@playwright/test";
import { WebSocketServer, type WebSocket } from "ws";

// ────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────

/** 打开 Tools 页面 */
async function openToolsPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await openOptionsPage(context, extensionId);
  await page.goto(`chrome-extension://${extensionId}/src/options.html#/tools`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** 「开发工具」卡片（new-ui SettingCard，data-spy-id="dev-tools"） */
function getDevCard(page: Page) {
  return page.locator('[data-spy-id="dev-tools"]');
}

/** 启动一个临时 WebSocket 服务器，返回 URL 和清理函数 */
function createMockWSServer(): Promise<{
  url: string;
  connections: WebSocket[];
  close: () => Promise<void>;
  broadcast: (data: unknown) => void;
  waitForAction: (action: string, timeout?: number) => Promise<unknown>;
}> {
  return new Promise((resolve, reject) => {
    const connections: WebSocket[] = [];
    const messageListeners: Array<(msg: unknown) => void> = [];

    const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 }, () => {
      const addr = wss.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected address type"));
        return;
      }
      const url = `ws://127.0.0.1:${addr.port}`;

      wss.on("connection", (ws) => {
        connections.push(ws);
        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            for (const listener of messageListeners) listener(msg);
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
            if (ws.readyState === ws.OPEN) ws.send(payload);
          }
        },
        waitForAction: (action: string, timeout = 10_000) =>
          new Promise<unknown>((resolveAction, rejectAction) => {
            const timer = setTimeout(() => {
              const idx = messageListeners.indexOf(handler);
              if (idx >= 0) messageListeners.splice(idx, 1);
              rejectAction(new Error(`Timeout waiting for action: ${action}`));
            }, timeout);

            const handler = (msg: any) => {
              if (msg.action === action) {
                clearTimeout(timer);
                const idx = messageListeners.indexOf(handler);
                if (idx >= 0) messageListeners.splice(idx, 1);
                resolveAction(msg);
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
    await expect(card.getByText(/development tool|开发工具/i).first()).toBeVisible();

    // VSCode URL 输入框（默认值含 ws://）
    const urlInput = card.getByLabel("vscode_url_input");
    await expect(urlInput).toBeVisible();
    expect(await urlInput.inputValue()).toMatch(/^ws:\/\//);

    // 自动连接复选框
    await expect(card.getByLabel("vscode_reconnect")).toBeVisible();
    await expect(card.getByText(/auto connect vscode|自动连接\s*vscode/i)).toBeVisible();

    // 连接按钮
    await expect(card.getByLabel("vscode_connect")).toBeVisible();
  });

  test("应能修改 VSCode URL 和切换自动连接", async ({ context, extensionId }) => {
    const page = await openToolsPage(context, extensionId);
    const card = getDevCard(page);

    const urlInput = card.getByLabel("vscode_url_input");
    await urlInput.fill("ws://localhost:9999");
    await expect(urlInput).toHaveValue("ws://localhost:9999");

    const checkbox = card.getByLabel("vscode_reconnect");
    const initialChecked = await checkbox.getAttribute("aria-checked");
    await checkbox.click();
    await expect(checkbox).not.toHaveAttribute("aria-checked", initialChecked || "");
  });

  test("点击连接按钮应发送连接命令并提示成功", async ({ context, extensionId }) => {
    const page = await openToolsPage(context, extensionId);
    const card = getDevCard(page);

    // connectVSCode 为消息传递操作，消息投递成功即 resolve，
    // 即使没有 WebSocket 服务器运行也应显示「连接成功」toast。
    await card.getByLabel("vscode_connect").click();

    await expect(page.getByText(/connection success|连接成功/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("应能通过 WebSocket 连接并接收脚本同步", async ({ context, extensionId }) => {
    const server = await createMockWSServer();

    try {
      const page = await openToolsPage(context, extensionId);
      const card = getDevCard(page);

      // 设置 URL 为 Mock 服务器地址
      const urlInput = card.getByLabel("vscode_url_input");
      await urlInput.fill(server.url);

      // 点击连接前先监听 hello 握手，避免竞态
      const helloPromise = server.waitForAction("hello", 30_000);

      await card.getByLabel("vscode_connect").click();
      await expect(page.getByText(/connection success|连接成功/i).first()).toBeVisible({ timeout: 10_000 });

      // 收到 hello 握手
      await helloPromise;
      expect(server.connections.length).toBeGreaterThanOrEqual(1);

      // 推送 onchange，模拟 VSCode 同步脚本
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
        data: { script: testScript, uri: "file:///e2e-test/vscode-sync-test.user.js" },
      });

      // 脚本应安装并出现在列表
      const listPage = await openOptionsPage(context, extensionId);
      await expect(listPage.getByText("VSCode E2E Test Script")).toBeVisible({ timeout: 15_000 });
      await listPage.close();
    } finally {
      await server.close();
    }
  });
});
