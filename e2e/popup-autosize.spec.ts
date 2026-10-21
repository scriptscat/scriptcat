import fs from "fs";
import os from "os";
import path from "path";
import { chromium, type BrowserContext, type CDPSession, type Worker } from "@playwright/test";
import { test, expect } from "./fixtures";
import { headlessArgs } from "./launch-args";

const pathToExtension = path.resolve(__dirname, "../dist/ext");

// Chrome 默认缩放存成以 1.2 为底的对数级别；扩展 popup 跟随默认缩放。
function zoomLevel(factor: number) {
  return Math.log(factor) / Math.log(1.2);
}

async function launchWithExtension(options: { zoom?: number; mobile?: boolean } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-popup-autosize-"));
  if (options.zoom) {
    fs.mkdirSync(path.join(userDataDir, "Default"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, "Default", "Preferences"),
      JSON.stringify({ partition: { default_zoom_level: { x: zoomLevel(options.zoom) } } })
    );
  }
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      ...headlessArgs(),
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      "--disable-gpu",
    ],
    ...(options.mobile
      ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 }
      : {}),
    timeout: 60_000,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("firstUse", "false");
    } catch {
      // about:blank 等不透明来源无法访问 localStorage
    }
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 14_000 });
  return {
    context,
    sw,
    extensionId: sw.url().split("/")[2],
    cleanup: async () => {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function installMatchingScripts(context: BrowserContext, extensionId: string, count: number) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options.html`);
  for (let i = 0; i < count; i++) {
    const code = [
      "// ==UserScript==",
      `// @name        Autosize probe ${i}`,
      "// @namespace   e2e-popup-autosize",
      "// @version     1.0",
      "// @match       https://example.com/*",
      "// ==/UserScript==",
      "",
    ].join("\n");
    await page.evaluate(
      (code) =>
        new Promise((resolve) =>
          chrome.runtime.sendMessage(
            {
              action: "serviceWorker/script/installByCode",
              data: { uuid: crypto.randomUUID(), code, upsertBy: "user" },
            },
            resolve
          )
        ),
      code
    );
  }
  await page.close();
}

/**
 * 以真实 action popup 打开（chrome.action.openPopup），而不是在标签页里加载 popup.html：
 * 只有真正的 popup 窗口由浏览器按内容自动定宽定高，#1800 的塌缩只在这里出现。
 * Playwright 不把 popup 暴露成 Page，只能经 CDP Target 域附着求值。
 */
async function openActionPopup(context: BrowserContext, sw: Worker) {
  const tab = await context.newPage();
  await tab.route("https://example.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>popup autosize</title>" })
  );
  await tab.goto("https://example.com/");
  for (const p of context.pages()) if (p !== tab) await p.close();
  await tab.bringToFront();
  await sw.evaluate(async () => {
    const [win] = await chrome.windows.getAll({ windowTypes: ["normal"] });
    await chrome.action.openPopup({ windowId: win.id });
  });

  const cdp: CDPSession = await context.newCDPSession(tab);
  let targetId: string | undefined;
  await expect
    .poll(async () => {
      const { targetInfos } = await cdp.send("Target.getTargets");
      targetId = targetInfos.find((t) => t.url.includes("/src/popup.html"))?.targetId;
      return targetId;
    })
    .toBeTruthy();
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: targetId!, flatten: false });

  let seq = 0;
  return function evaluate<T>(expression: string): Promise<T> {
    const id = ++seq;
    return new Promise<T>((resolve, reject) => {
      const onMessage = (event: { sessionId: string; message: string }) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== id) return;
        cdp.off("Target.receivedMessageFromTarget", onMessage);
        if (message.error || message.result?.exceptionDetails) {
          reject(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
        } else {
          resolve(message.result.result.value as T);
        }
      };
      cdp.on("Target.receivedMessageFromTarget", onMessage);
      void cdp.send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }),
      });
    });
  };
}

type PopupLayout = {
  contentWidth: number;
  viewportHeight: number;
  headerTop: number;
  footerBottom: number;
  innerScrollers: number;
  documentScrollbarThemed: boolean;
};

// 页眉以 Header 组件的 <header> 为准，页脚为 <footer>；文档滚到底部后两者仍须在可视区内。
// 文档是唯一滚动容器（避免双滚动条），其滚动条沿用主题化的 scrollbar-custom 样式。
const measureLayout = `(() => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  if (!header || !footer) return null;
  const innerScrollers = Array.from(document.body.querySelectorAll("*")).filter((el) => {
    const style = getComputedStyle(el);
    return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
  }).length;
  return {
    contentWidth: document.documentElement.clientWidth,
    viewportHeight: window.innerHeight,
    headerTop: Math.round(header.getBoundingClientRect().top),
    footerBottom: Math.round(footer.getBoundingClientRect().bottom),
    innerScrollers,
    documentScrollbarThemed: getComputedStyle(document.documentElement).scrollbarWidth === "thin",
  };
})()`;

test.describe("Popup 窗口自适应尺寸", () => {
  // 默认缩放 125% 时 popup 窗口最高 600 DIP = 480 CSS px，内容超过窗口高度后文档出现滚动：
  // 曾经宽度塌缩成 25px 细条(#1800)，且页脚被挤出可视区。
  test("125% 缩放且脚本较多时宽度保持 360px，页眉页脚始终可见", async () => {
    const { context, sw, extensionId, cleanup } = await launchWithExtension({ zoom: 1.25 });
    try {
      await installMatchingScripts(context, extensionId, 12);
      const evaluate = await openActionPopup(context, sw);

      await expect
        .poll(() => evaluate<PopupLayout | null>(measureLayout), { timeout: 15_000 })
        .toMatchObject({
          contentWidth: 360,
          innerScrollers: 0,
          documentScrollbarThemed: true,
        });
      const layout = (await evaluate<PopupLayout>(measureLayout))!;
      expect(layout.headerTop).toBeGreaterThanOrEqual(0);
      expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
    } finally {
      await cleanup();
    }
  });

  // 移动端（如 Edge Android）popup 被撑满整屏：宽度须填满(#686)，页脚须贴底而不是悬在内容下方。
  test("移动端整屏 popup 宽度填满且页脚贴底", async () => {
    const { context, extensionId, cleanup } = await launchWithExtension({ mobile: true });
    try {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup.html`);
      await expect(page.locator("footer")).toBeVisible();

      const layout = await page.evaluate(() => ({
        contentWidth: document.documentElement.clientWidth,
        viewportHeight: window.innerHeight,
        footerBottom: Math.round(document.querySelector("footer")!.getBoundingClientRect().bottom),
      }));
      expect(layout.contentWidth).toBe(412);
      expect(layout.footerBottom).toBe(layout.viewportHeight);
    } finally {
      await cleanup();
    }
  });
});
