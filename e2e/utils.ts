import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Auto-approve permission confirm dialogs opened by the extension.
 * Listens for new pages matching confirm.html (new-ui / shadcn) and grants the request:
 * site-access variant → click "request permission"; otherwise pick "permanent" duration
 * then click "allow". Selectors are data-testid based, so they are language-agnostic.
 */
export function autoApprovePermissions(context: BrowserContext): void {
  context.on("page", async (page) => {
    const url = page.url();
    if (!url.includes("confirm.html")) return;

    try {
      await page.waitForLoadState("domcontentloaded");
      const request = page.getByTestId("confirm-request");
      const allow = page.getByTestId("confirm-allow");
      await allow.or(request).first().waitFor({ timeout: 5_000 });
      if (await request.count()) {
        await request.first().click();
      } else {
        // 尽量永久授权，避免同一测试内重复弹窗
        const permanent = page.getByTestId("confirm-duration-permanent");
        if (await permanent.count())
          await permanent
            .first()
            .click()
            .catch(() => {});
        await allow.first().click();
      }
      console.log("[autoApprove] Permission approved on confirm page");
    } catch (e) {
      console.log("[autoApprove] Failed to approve:", e);
    }
  });
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

  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(text);
    const passMatch = text.match(/通过[:：]\s*(\d+)/);
    const failMatch = text.match(/失败[:：]\s*(\d+)/);
    if (passMatch) passed = parseInt(passMatch[1], 10);
    if (failMatch) failed = parseInt(failMatch[1], 10);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => passed >= 0 && failed >= 0, { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] })
    .toBe(true)
    .catch(() => undefined);

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

/** Open the script editor page */
export async function openEditorPage(context: BrowserContext, extensionId: string, params?: string): Promise<Page> {
  const page = await context.newPage();
  const hash = params ? `#/script/editor?${params}` : "#/script/editor";
  await page.goto(`chrome-extension://${extensionId}/src/options.html${hash}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

async function focusMonacoEditor(page: Page): Promise<void> {
  await page.locator(".monaco-editor").waitFor({ timeout: 30_000 });
  await page.locator(".view-lines").waitFor({ timeout: 15_000 });
  await page.locator(".monaco-editor textarea.inputarea").waitFor({ state: "attached", timeout: 5_000 });
  await page.locator(".monaco-editor textarea.inputarea").focus();
}

async function waitForSavedScriptInList(context: BrowserContext, extensionId: string): Promise<void> {
  const listPage = await openOptionsPage(context, extensionId);
  try {
    // new-ui 列表页加载完成的稳定信号（桌面工具栏 view-toggle / 移动搜索栏）
    await listPage
      .getByTestId("view-toggle")
      .or(listPage.getByTestId("mobile-search"))
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  } finally {
    await listPage.close();
  }
}

export async function saveCurrentEditor(context: BrowserContext, extensionId: string, page: Page): Promise<void> {
  await focusMonacoEditor(page);
  await page.keyboard.press("ControlOrMeta+s");

  // new-ui 保存成功为 sonner toast
  const toastAppeared = await page
    .locator("[data-sonner-toast]")
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (toastAppeared) return;

  await waitForSavedScriptInList(context, extensionId);
}

/** Install a script by injecting code into the Monaco editor and saving */
export async function installScriptByCode(context: BrowserContext, extensionId: string, code: string): Promise<void> {
  const page = await openEditorPage(context, extensionId);
  // Wait for Monaco editor DOM and default template content to be ready
  await focusMonacoEditor(page);
  // Select all existing content
  await page.keyboard.press("ControlOrMeta+a");
  // Capture current content fingerprint, then paste replacement
  const initialText = await page.locator(".view-lines").textContent();
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await page.keyboard.press("ControlOrMeta+v");
  // Wait for Monaco to finish rendering the pasted content (content will differ from template)
  await page.waitForFunction((init) => document.querySelector(".view-lines")?.textContent !== init, initialText, {
    timeout: 5_000,
  });
  // Save
  await saveCurrentEditor(context, extensionId, page);
  await page.close();
}

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
