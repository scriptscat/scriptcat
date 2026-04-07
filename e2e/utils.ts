import fs from "fs";
import path from "path";
import type { BrowserContext, Page } from "@playwright/test";

/** Strip SRI hashes and replace slow CDN with faster alternative */
export function patchScriptCode(code: string): string {
  return code
    .replace(/^(\/\/\s*@(?:require|resource)\s+.*?)#sha(?:256|384|512)[=-][^\s]+/gm, "$1")
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\//g, "https://unpkg.com/");
}

/**
 * Auto-approve permission confirm dialogs opened by the extension.
 * Listens for new pages matching confirm.html and clicks the
 * "permanent allow all" button (type=4, allow=true).
 */
export function autoApprovePermissions(context: BrowserContext): void {
  context.on("page", async (page) => {
    const url = page.url();
    if (!url.includes("confirm.html")) return;

    try {
      await page.waitForLoadState("domcontentloaded");
      const successButtons = page.locator("button.arco-btn-status-success");
      await successButtons.first().waitFor({ timeout: 5_000 });
      const count = await successButtons.count();
      if (count >= 3) {
        await successButtons.nth(2).click();
      } else {
        await successButtons.last().click();
      }
      console.log("[autoApprove] Permission approved on confirm page");
    } catch (e) {
      console.log("[autoApprove] Failed to approve:", e);
    }
  });
}

/** Run a test script from example/tests/ on the target page and collect console results */
export async function runTestScript(
  context: BrowserContext,
  extensionId: string,
  scriptFile: string,
  targetUrl: string,
  timeoutMs: number
): Promise<{ passed: number; failed: number; logs: string[] }> {
  let code = fs.readFileSync(path.join(__dirname, `../example/tests/${scriptFile}`), "utf-8");
  code = patchScriptCode(code);
  return runInlineTestScript(context, extensionId, code, targetUrl, timeoutMs);
}

/** Run inline script code on the target page and collect console results */
export async function runInlineTestScript(
  context: BrowserContext,
  extensionId: string,
  code: string,
  targetUrl: string,
  timeoutMs: number
): Promise<{ passed: number; failed: number; logs: string[] }> {
  await installScriptByCode(context, extensionId, code);
  autoApprovePermissions(context);

  const page = await context.newPage();
  const logs: string[] = [];
  let passed = -1;
  let failed = -1;

  const resultReady = new Promise<void>((resolve) => {
    page.on("console", (msg) => {
      const text = msg.text();
      logs.push(text);
      const passMatch = text.match(/通过[:：]\s*(\d+)/);
      const failMatch = text.match(/失败[:：]\s*(\d+)/);
      if (passMatch) passed = parseInt(passMatch[1], 10);
      if (failMatch) failed = parseInt(failMatch[1], 10);
      if (passed >= 0 && failed >= 0) resolve();
    });
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await Promise.race([resultReady, page.waitForTimeout(timeoutMs)]);

  await page.close();
  return { passed, failed, logs };
}

/** Open the options page and wait for it to load */
export async function openOptionsPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options.html`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the popup page and wait for it to load */
export async function openPopupPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the install page with a script URL parameter */
export async function openInstallPage(context: BrowserContext, extensionId: string, scriptUrl: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/install.html?url=${encodeURIComponent(scriptUrl)}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the script editor page */
export async function openEditorPage(context: BrowserContext, extensionId: string, params?: string): Promise<Page> {
  const page = await context.newPage();
  const hash = params ? `#/script/editor?${params}` : "#/script/editor";
  await page.goto(`chrome-extension://${extensionId}/src/options.html${hash}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Install a script by injecting code into the Monaco editor and saving */
export async function installScriptByCode(context: BrowserContext, extensionId: string, code: string): Promise<void> {
  const page = await openEditorPage(context, extensionId);
  // Wait for Monaco editor DOM and default template content to be ready
  await page.locator(".monaco-editor").waitFor({ timeout: 30_000 });
  await page.locator(".view-lines").waitFor({ timeout: 15_000 });
  // Click to focus editor; headless Chrome 下光标可能不会变为 visible，改用 focused 状态判断
  await page.locator(".monaco-editor .view-lines").click();
  // 等待编辑器获得焦点（textarea 获得 focus 即表示可交互）
  await page.locator(".monaco-editor textarea.inputarea").waitFor({ state: "attached", timeout: 5_000 });
  await page.locator(".monaco-editor textarea.inputarea").focus();
  // Select all existing content
  await page.keyboard.press("ControlOrMeta+a");
  // Capture current content fingerprint, then paste replacement
  const initialText = await page.locator(".view-lines").textContent();
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await page.keyboard.press("ControlOrMeta+v");
  // Wait for Monaco to finish rendering the pasted content (content will differ from template)
  await page.waitForFunction((init) => document.querySelector(".view-lines")?.textContent !== init, initialText, {
    timeout: 10_000,
  });
  // Save
  await page.keyboard.press("ControlOrMeta+s");
  // Wait for save: try arco-message first, then verify via script list
  const saved = await page
    .locator(".arco-message")
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!saved) {
    // For scripts with @require/@resource, the message may not appear.
    // Verify save by checking the script list on the options page.
    const listPage = await openOptionsPage(context, extensionId);
    const emptyState = listPage.locator(".arco-empty");
    // Wait until at least one script appears (no empty state), up to 30s
    await emptyState.waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
    await listPage.close();
  }
  await page.close();
}

/** A sample userscript for testing */
export const sampleUserScript = `// ==UserScript==
// @name         E2E Test Script
// @namespace    https://e2e.test
// @version      1.0.0
// @description  A test script for E2E testing
// @author       E2E Test
// @match        https://example.com/*
// ==/UserScript==

console.log("E2E Test Script loaded");
`;

/** Open the agent chat page */
export async function openAgentChatPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options.html#/agent/chat`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Open the agent provider page */
export async function openAgentProviderPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options.html#/agent/provider`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/**
 * 通过 chrome.storage 预设一个 Agent 模型配置，避免通过 UI 操作。
 * 在 extension 页面中执行，直接写入 chrome.storage.local。
 * AgentModelRepo 使用 "agent_model:" 前缀 + id 作为 key。
 */
export async function setupAgentModel(
  page: Page,
  config?: { name?: string; provider?: string; model?: string; apiBaseUrl?: string; apiKey?: string }
): Promise<string> {
  const modelId = await page.evaluate(
    ([cfg]) => {
      const id = "e2e-test-model-" + Date.now();
      const model = {
        id,
        name: cfg?.name || "E2E Test Model",
        provider: cfg?.provider || "openai",
        apiBaseUrl: cfg?.apiBaseUrl || "http://localhost:18399/v1",
        apiKey: cfg?.apiKey || "test-key",
        model: cfg?.model || "gpt-4o",
      };
      const storageKey = "agent_model:" + id;
      return new Promise<string>((resolve, reject) => {
        chrome.storage.local.set(
          {
            [storageKey]: model,
            "agent_model:__default__": id,
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError.message);
              return;
            }
            // 读回验证写入成功
            chrome.storage.local.get(storageKey, (result) => {
              if (result[storageKey]) {
                resolve(id);
              } else {
                reject("Failed to verify storage write");
              }
            });
          }
        );
      });
    },
    [config] as const
  );
  return modelId;
}

/**
 * 构建一个 OpenAI 兼容的 SSE 流式响应体。
 * 返回可用于 route handler 的响应字符串。
 */
export function buildOpenAISSEResponse(
  content: string,
  options?: { toolCalls?: Array<{ id: string; name: string; arguments: string }> }
): string {
  const chunks: string[] = [];
  const toolCalls = options?.toolCalls;

  if (toolCalls && toolCalls.length > 0) {
    // 发送 tool call
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      // tool call start
      chunks.push(
        `data: ${JSON.stringify({
          id: "chatcmpl-e2e",
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: i, id: tc.id, type: "function", function: { name: tc.name, arguments: "" } }],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
      // tool call arguments delta
      chunks.push(
        `data: ${JSON.stringify({
          id: "chatcmpl-e2e",
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: i, function: { arguments: tc.arguments } }] },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    }
  }

  if (content) {
    // 分成几个 chunk 模拟真实流式
    const words = content.split(" ");
    for (const word of words) {
      chunks.push(
        `data: ${JSON.stringify({
          id: "chatcmpl-e2e",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: word + " " }, finish_reason: null }],
        })}\n\n`
      );
    }
  }

  // finish
  chunks.push(
    `data: ${JSON.stringify({
      id: "chatcmpl-e2e",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: toolCalls ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })}\n\n`
  );
  chunks.push("data: [DONE]\n\n");

  return chunks.join("");
}
