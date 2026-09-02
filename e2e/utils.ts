import { expect, type BrowserContext, type Frame, type Page } from "@playwright/test";

/**
 * Auto-approve permission confirm dialogs opened by the extension.
 * Listens for new pages matching confirm.html (new-ui / shadcn) and grants the request:
 * site-access variant → click "request permission"; otherwise pick "permanent" duration
 * then click "allow". Selectors are data-testid based, so they are language-agnostic.
 */
export function autoApprovePermissions(context: BrowserContext): void {
  const attachedPages = new WeakSet<Page>();
  const attach = (page: Page) => {
    if (attachedPages.has(page)) return;
    attachedPages.add(page);

    const approve = async () => {
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
    };

    const handleApprovalError = (error: unknown) => {
      console.log("[autoApprove] Failed to approve:", error);
    };

    const handleNavigation = (frame: Frame) => {
      if (frame !== page.mainFrame() || !frame.url().includes("confirm.html")) return;
      page.off("framenavigated", handleNavigation);
      void approve().catch(handleApprovalError);
    };

    page.on("framenavigated", handleNavigation);
    if (page.url().includes("confirm.html")) {
      page.off("framenavigated", handleNavigation);
      void approve().catch(handleApprovalError);
    }
  };

  for (const page of context.pages()) attach(page);
  context.on("page", attach);
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

/**
 * 以扩展新建独立标签的方式打开安装页(生产路径:ScriptService.openInstallPageByUrl → chrome.tabs.create)。
 *
 * 不能用 context.newPage() + goto:那会先停在 about:blank 再导航,给标签留下两条历史。
 * 安装页靠 history.length 区分「独立新标签(关闭自己)」与「被 DNR 接管的用户标签(返回上一页)」,
 * 于是安装完成后走 history.back() 退回 about:blank,标签永远不关,等 close 事件的用例只能超时。
 */
export async function openInstallPageInNewTab(
  context: BrowserContext,
  extensionId: string,
  targetUrl: string
): Promise<Page> {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 14_000 });
  const opened = context.waitForEvent("page");
  await sw.evaluate(
    (url) => chrome.tabs.create({ url }),
    `chrome-extension://${extensionId}/src/install.html?url=${targetUrl}`
  );
  const page = await opened;
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
    // new-ui 列表页加载完成的稳定信号（桌面工具栏搜索框 / 移动搜索栏）
    await listPage
      .getByTestId("script-search")
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
