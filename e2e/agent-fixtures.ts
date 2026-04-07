import fs from "fs";
import os from "os";
import path from "path";
import { test as base, expect, chromium, type BrowserContext, type Route } from "@playwright/test";
export { expect };

const pathToExtension = path.resolve(__dirname, "../dist/ext");
const chromeArgs = [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`];

function getProxyOptions() {
  const proxy =
    process.env.E2E_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  return proxy ? { proxy: { server: proxy } } : {};
}

/** OpenAI-compatible SSE response for plain text replies */
export function makeTextSSE(content: string): string {
  const lines = [
    `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content }, index: 0 }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, index: 0, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}`,
    "data: [DONE]",
    "",
  ];
  return lines.join("\n\n");
}

/** OpenAI-compatible SSE response for tool_calls */
export function makeToolCallSSE(toolCalls: Array<{ id: string; name: string; arguments: string }>): string {
  const lines: string[] = [];
  for (const tc of toolCalls) {
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

/**
 * Agent test fixtures — 两阶段启动 + mock LLM
 *
 * Phase 1: 启动 → 启用 userScripts → 写入 mock model 配置 → 关闭
 * Phase 2: 重启（权限和配置已持久化到 userDataDir）
 *
 * 必须在 Phase 1 写入 model 配置，因为 Repo 层使用 enableCache()，
 * Phase 2 的 SW 启动时会一次性加载 storage 到内存缓存。
 * 如果在 Phase 2 SW 启动后才通过 evaluate 写入 storage，
 * 内存缓存不会更新，导致 "No model configured" 错误。
 */
export const test = base.extend<AgentFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-"));

    // Phase 1: 启用 userScripts + 写入 mock model 配置
    const ctx1 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
    });
    let [bg] = ctx1.serviceWorkers();
    if (!bg) bg = await ctx1.waitForEvent("serviceworker", { timeout: 30_000 });
    const extensionId = bg.url().split("/")[2];

    // 启用 userScripts 权限
    const extPage = await ctx1.newPage();
    await extPage.goto("chrome://extensions/");
    await extPage.waitForLoadState("domcontentloaded");
    await extPage.waitForFunction(() => !!(chrome as any).developerPrivate, { timeout: 10_000 });
    await extPage.evaluate(async (id) => {
      await (chrome as any).developerPrivate.updateExtensionConfiguration({
        extensionId: id,
        userScriptsAccess: true,
      });
    }, extensionId);
    await extPage.close();

    // 写入 mock model 配置到 storage（Phase 1 写入，Phase 2 SW 启动时会加载到缓存）
    // userScripts 启用后 SW 可能重启，重新获取
    let currentBg = ctx1.serviceWorkers().find((w) => w.url().includes(extensionId));
    if (!currentBg) {
      currentBg = await ctx1.waitForEvent("serviceworker", { timeout: 15_000 });
    }
    await currentBg.evaluate(() => {
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

    await ctx1.close();

    // Phase 2: 重启，userScripts 权限和 model 配置已持久化
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ["--headless=new", ...chromeArgs],
      ...getProxyOptions(),
    });
    const [sw] = context.serviceWorkers();
    if (!sw) await context.waitForEvent("serviceworker", { timeout: 30_000 });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");
    const extensionId = background.url().split("/")[2];

    // 关闭首次使用引导
    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/src/options.html`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await initPage.evaluate(() => localStorage.setItem("firstUse", "false"));
    await initPage.close();

    await use(extensionId);
  },

  mockLLMResponse: async ({ context }, use) => {
    let currentHandler: MockLLMHandler = () => makeTextSSE("default mock response");

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
