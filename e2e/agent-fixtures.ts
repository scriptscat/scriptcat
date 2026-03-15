import fs from "fs";
import path from "path";
import os from "os";
import { test as base, chromium, type BrowserContext, type Route } from "@playwright/test";
import { installScriptByCode } from "./utils";

/** OpenAI-compatible SSE response for plain text replies */
function makeTextSSE(content: string): string {
  const lines = [
    `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content }, index: 0 }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, index: 0, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}`,
    "data: [DONE]",
    "",
  ];
  return lines.join("\n\n");
}

/** OpenAI-compatible SSE response for tool_calls */
function makeToolCallSSE(toolCalls: Array<{ id: string; name: string; arguments: string }>): string {
  const lines: string[] = [];
  for (const tc of toolCalls) {
    // First chunk: tool call start with name
    lines.push(
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: "" },
                },
              ],
            },
            index: 0,
          },
        ],
      })}`
    );
    // Second chunk: arguments
    lines.push(
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: tc.arguments } }],
            },
            index: 0,
          },
        ],
      })}`
    );
  }
  // Finish with tool_calls reason
  lines.push(
    `data: ${JSON.stringify({
      choices: [{ delta: {}, index: 0, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })}`
  );
  lines.push("data: [DONE]");
  lines.push("");
  return lines.join("\n\n");
}

export type MockLLMHandler = (body: { messages: any[]; tools?: any[] }) => string;

export type AgentFixtures = {
  context: BrowserContext;
  extensionId: string;
  mockLLMResponse: (handler: MockLLMHandler) => void;
};

export { makeTextSSE, makeToolCallSSE };

export const test = base.extend<AgentFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, "../dist/ext");
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-agent-"));
    const chromeArgs = [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`];

    // Phase 1: Enable user scripts permission
    const ctx1 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
    });
    let [bg] = ctx1.serviceWorkers();
    if (!bg) bg = await ctx1.waitForEvent("serviceworker");
    const extensionId = bg.url().split("/")[2];
    const extPage = await ctx1.newPage();
    await extPage.goto("chrome://extensions/");
    await extPage.waitForLoadState("domcontentloaded");
    await extPage.waitForTimeout(1_000);
    await extPage.evaluate(async (id) => {
      await (chrome as any).developerPrivate.updateExtensionConfiguration({
        extensionId: id,
        userScriptsAccess: true,
      });
    }, extensionId);
    await extPage.close();
    await ctx1.close();

    // Phase 2: Relaunch with user scripts enabled
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
    });

    // 立即等待 service worker 就绪（与 Phase 1 一致，避免事件丢失竞态）
    let [bg2] = context.serviceWorkers();
    if (!bg2) bg2 = await context.waitForEvent("serviceworker", { timeout: 30_000 });

    (context as any).__extensionId = extensionId;

    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    const extensionId: string = (context as any).__extensionId;

    // 唤醒可能已空闲终止的 service worker
    const ensureServiceWorker = async () => {
      let sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
      if (sw) return sw;

      // SW 可能已空闲终止，通过导航重新激活
      const swPromise = context.waitForEvent("serviceworker", { timeout: 30_000 });
      const wakePage = await context.newPage();
      try {
        await wakePage.goto(`chrome-extension://${extensionId}/src/options.html`, {
          waitUntil: "commit",
          timeout: 10_000,
        });
      } catch {
        // 即使导航失败，请求本身也可能触发 service worker 注册
      }

      sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
      if (!sw) sw = await swPromise;
      await wakePage.close();
      return sw;
    };

    // Dismiss first-use dialog（导航也会唤醒 SW）
    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/src/options.html`, {
      waitUntil: "domcontentloaded",
    });
    await initPage.evaluate(() => localStorage.setItem("firstUse", "false"));
    await initPage.close();

    // 确保 SW 处于活跃状态
    const sw = await ensureServiceWorker();
    await sw.evaluate(() => {
      const modelConfig = {
        id: "mock-model",
        name: "Mock LLM",
        provider: "openai",
        apiBaseUrl: "https://mock-llm.test/v1",
        apiKey: "test-key",
        model: "mock-gpt",
      };
      return new Promise<void>((resolve) => {
        chrome.storage.local.set(
          {
            "agent_model:mock-model": modelConfig,
            "agent_model:__default__": "mock-model",
          },
          () => resolve()
        );
      });
    });

    await use(extensionId);
  },

  mockLLMResponse: async ({ context }, use) => {
    let currentHandler: MockLLMHandler = () => makeTextSSE("default mock response");

    // Set up route interception for mock LLM
    await context.route("**/mock-llm.test/**", async (route: Route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fulfill({ status: 405, body: "Method not allowed" });
        return;
      }

      let body: any;
      try {
        body = JSON.parse(request.postData() || "{}");
      } catch {
        body = {};
      }

      const sseResponse = currentHandler({
        messages: body.messages || [],
        tools: body.tools,
      });

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: sseResponse,
      });
    });

    const setHandler = (handler: MockLLMHandler) => {
      currentHandler = handler;
    };

    await use(setHandler);
  },
});

/**
 * Auto-approve permission confirm dialogs and CATTool install pages.
 */
export function autoApprovePermissions(context: BrowserContext): void {
  context.on("page", async (page) => {
    const url = page.url();

    // Auto-approve permission confirm dialogs
    if (url.includes("confirm.html")) {
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
      return;
    }

    // Auto-approve CATTool install pages
    if (url.includes("install.html") && url.includes("cattool=")) {
      try {
        await page.waitForLoadState("domcontentloaded");
        // Wait for the install button to appear (primary button)
        const installButton = page.locator("button.arco-btn-primary").first();
        await installButton.waitFor({ timeout: 10_000 });
        await installButton.click();
        console.log("[autoApprove] CATTool install approved");
      } catch (e) {
        console.log("[autoApprove] Failed to approve CATTool install:", e);
      }
      return;
    }
  });
}

/** Run an agent test script and collect console results */
export async function runAgentTestScript(
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
  page.on("console", (msg) => logs.push(msg.text()));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  const deadline = Date.now() + timeoutMs;
  let passed = -1;
  let failed = -1;
  while (Date.now() < deadline) {
    for (const log of logs) {
      const passMatch = log.match(/通过[:：]\s*(\d+)/);
      const failMatch = log.match(/失败[:：]\s*(\d+)/);
      if (passMatch) passed = parseInt(passMatch[1], 10);
      if (failMatch) failed = parseInt(failMatch[1], 10);
    }
    if (passed >= 0 && failed >= 0) break;
    await page.waitForTimeout(500);
  }

  await page.close();
  return { passed, failed, logs };
}
