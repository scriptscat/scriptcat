// CDP（Chrome DevTools Protocol）操作封装，用于 trusted 模式
// 通过 chrome.debugger API 实现真实用户输入模拟（isTrusted=true）

import type { ActionResult, ScreenshotOptions } from "@App/app/service/agent/types";
import { openInCurrentTab } from "@App/pkg/utils/utils";

// 确保 debugger 权限已授予
// chrome.permissions.request 不能在 Service Worker 中调用（需要用户手势），
// 所以打开 confirm 页面让用户在有手势的上下文中授权
export async function ensureDebuggerPermission(): Promise<void> {
  const granted = await chrome.permissions.contains({ permissions: ["debugger"] });
  if (granted) return;

  return new Promise<void>((resolve, reject) => {
    const uuid = crypto.randomUUID();
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error("Permission request timed out"));
    }, 60000);

    const listener = (msg: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      if (msg.type === "chrome_permission_result" && msg.uuid === uuid) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        if (msg.granted) {
          resolve();
        } else {
          reject(new Error("Debugger permission denied by user"));
        }
        sendResponse(true);
        return true;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    openInCurrentTab(`src/confirm.html?mode=chrome_permission&permission=debugger&uuid=${uuid}`);
  });
}

// 生命周期管理：attach → 执行 → detach
export async function withDebugger<T>(tabId: number, fn: (tabId: number) => Promise<T>): Promise<T> {
  await chrome.debugger.attach({ tabId }, "1.3");
  try {
    return await fn(tabId);
  } finally {
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // tab 可能已经关闭
    }
  }
}

// 发送 CDP 命令的封装
function sendCommand(tabId: number, method: string, params?: Record<string, unknown>): Promise<any> {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

// 通过 CDP 点击元素
export async function cdpClick(tabId: number, selector: string): Promise<ActionResult> {
  const originalUrl = (await chrome.tabs.get(tabId)).url || "";

  // 启用 Page 事件以检测导航
  await sendCommand(tabId, "Page.enable");

  // 设置 dialog 自动处理
  const dialogInfo = await setupDialogHandler(tabId);

  // 定位元素
  const doc = await sendCommand(tabId, "DOM.getDocument");
  const nodeId = await sendCommand(tabId, "DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector,
  });
  if (!nodeId?.nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }

  // 滚动到可见位置
  await sendCommand(tabId, "DOM.scrollIntoViewIfNeeded", { nodeId: nodeId.nodeId });

  // 获取元素中心坐标
  const boxModel = await sendCommand(tabId, "DOM.getBoxModel", { nodeId: nodeId.nodeId });
  if (!boxModel?.model) {
    throw new Error(`Cannot get box model for: ${selector}`);
  }
  const content = boxModel.model.content;
  // content 是 [x1,y1, x2,y2, x3,y3, x4,y4] 四个角的坐标
  const x = (content[0] + content[2] + content[4] + content[6]) / 4;
  const y = (content[1] + content[3] + content[5] + content[7]) / 4;

  // 模拟鼠标点击
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });

  // 等待页面稳定
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 收集结果
  const result = await collectCdpActionResult(tabId, originalUrl, dialogInfo);

  await sendCommand(tabId, "Page.disable");
  return result;
}

// 通过 CDP 填写表单
export async function cdpFill(tabId: number, selector: string, value: string): Promise<ActionResult> {
  const originalUrl = (await chrome.tabs.get(tabId)).url || "";

  // 定位元素
  const doc = await sendCommand(tabId, "DOM.getDocument");
  const nodeId = await sendCommand(tabId, "DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector,
  });
  if (!nodeId?.nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }

  // 聚焦元素
  await sendCommand(tabId, "DOM.focus", { nodeId: nodeId.nodeId });

  // 全选并删除现有内容
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    modifiers: 2, // Ctrl
  });
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 2,
  });
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Delete",
    code: "Delete",
  });
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Delete",
    code: "Delete",
  });

  // 逐字符输入
  for (const char of value) {
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: char,
    });
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      text: char,
    });
    await sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: char,
    });
  }

  // 等待页面稳定
  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    success: true,
    url: originalUrl,
  };
}

// 通过 CDP 截图
export async function cdpScreenshot(tabId: number, options?: ScreenshotOptions): Promise<string> {
  const quality = options?.quality ?? 80;
  const result = await sendCommand(tabId, "Page.captureScreenshot", {
    format: "jpeg",
    quality,
    captureBeyondViewport: options?.fullPage ?? false,
  });
  return `data:image/jpeg;base64,${result.data}`;
}

// dialog 处理
type DialogInfo = {
  dialogs: Array<{ type: string; message: string }>;
};

async function setupDialogHandler(tabId: number): Promise<DialogInfo> {
  const info: DialogInfo = { dialogs: [] };

  // 注入 dialog 拦截代码
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const w = window as any;
      if (!w.__sc_dialog_interceptor__) {
        w.__sc_dialog_log__ = [] as Array<{ type: string; message: string }>;
        const origAlert = window.alert;
        const origConfirm = window.confirm;
        const origPrompt = window.prompt;
        window.alert = (msg: string) => {
          w.__sc_dialog_log__.push({ type: "alert", message: String(msg) });
        };
        window.confirm = (msg?: string) => {
          w.__sc_dialog_log__.push({ type: "confirm", message: String(msg ?? "") });
          return true;
        };
        window.prompt = (msg?: string) => {
          w.__sc_dialog_log__.push({ type: "prompt", message: String(msg ?? "") });
          return "";
        };
        w.__sc_dialog_interceptor__ = { origAlert, origConfirm, origPrompt };
      }
    },
    world: "MAIN",
  });

  return info;
}

// 收集 CDP 操作后的结果
async function collectCdpActionResult(
  tabId: number,
  originalUrl: string,
  _dialogInfo: DialogInfo
): Promise<ActionResult> {
  const tab = await chrome.tabs.get(tabId);
  const currentUrl = tab.url || "";
  const navigated = currentUrl !== originalUrl;

  // 读取拦截的 dialog 信息
  const dialogResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const w = window as any;
      const logs = w.__sc_dialog_log__ || [];
      w.__sc_dialog_log__ = [];
      return logs;
    },
    world: "MAIN",
  });

  const result: ActionResult = {
    success: true,
    navigated,
    url: currentUrl,
  };

  const dialogs = dialogResults?.[0]?.result;
  if (dialogs && dialogs.length > 0) {
    result.dialog = dialogs[0];
  }

  return result;
}
