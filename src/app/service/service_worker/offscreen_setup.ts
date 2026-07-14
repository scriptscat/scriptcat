const OFFSCREEN_DOCUMENT_PATH = "src/offscreen.html";

// 创建失败后的重试退避间隔
const RETRY_DELAYS = [500, 1000, 2000];

// 单例latch: 并发调用共享同一次创建;失败后重置以允许后续重试
let creating: Promise<boolean> | null = null;

export async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });
  return existingContexts.length > 0;
}

async function createOffscreenDocumentWithRetry(): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    if (await hasOffscreenDocument()) {
      return true;
    }
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [
          chrome.offscreen.Reason.BLOBS,
          chrome.offscreen.Reason.CLIPBOARD,
          chrome.offscreen.Reason.DOM_SCRAPING,
          chrome.offscreen.Reason.LOCAL_STORAGE,
        ],
        justification: "offscreen page",
      });
      return true;
    } catch (e) {
      // 与 hasOffscreenDocument 检查之间存在竞态: 文档实际已存在时视为成功
      if (await hasOffscreenDocument()) {
        return true;
      }
      if (attempt >= RETRY_DELAYS.length) {
        console.error("setupOffscreenDocument: chrome.offscreen.createDocument failed", e);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }
}

// offscreen文档承载后台/定时脚本的沙箱环境,创建失败必须可重试,
// 不能让一次暂时性失败把 latch 永久卡在 rejected 状态直到 SW 重启
export function setupOffscreenDocument(): Promise<boolean> {
  if (typeof chrome.offscreen?.createDocument !== "function") {
    // Firefox does not support offscreen
    console.error("Your browser does not support chrome.offscreen.createDocument");
    return Promise.resolve(false);
  }
  if (!creating) {
    creating = createOffscreenDocumentWithRetry().then((ok) => {
      if (!ok) {
        // 失败时重置latch,允许后续调用重新尝试
        creating = null;
      }
      return ok;
    });
  }
  return creating;
}
