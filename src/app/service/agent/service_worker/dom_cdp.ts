// CDP（Chrome DevTools Protocol）操作封装
// 通过 chrome.debugger API 实现真实用户输入模拟（isTrusted=true）
// 以及页面监控（dialog 自动处理 + DOM 变化捕获）

import type { ActionResult, MonitorResult, ScreenshotOptions } from "@App/app/service/agent/core/types";

// 活跃的 monitor 会话，key 为 tabId（提前声明，withDebugger 需要检查）
type MonitorEventListener = (source: chrome.debugger.Debuggee, method: string, params?: any) => void;

type CapturedNode = {
  nodeId: number;
  tag: string;
  id?: string;
  class?: string;
  role?: string;
};

type MonitorSession = {
  dialogs: Array<{ type: string; message: string }>;
  capturedNodes: CapturedNode[]; // 从事件中直接提取的节点信息
  listener: MonitorEventListener;
};

const activeMonitors = new Map<number, MonitorSession>();

// 生命周期管理：attach → 执行 → detach
// 如果该 tabId 已有活跃的 monitor（已 attach），则复用连接，不做 attach/detach
export async function withDebugger<T>(tabId: number, fn: (tabId: number) => Promise<T>): Promise<T> {
  const hasMonitor = activeMonitors.has(tabId);
  if (!hasMonitor) {
    await chrome.debugger.attach({ tabId }, "1.3");
  }
  try {
    return await fn(tabId);
  } finally {
    if (!hasMonitor) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch {
        // tab 可能已经关闭
      }
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

  // 获取元素中心的页面坐标
  const boxModel = await sendCommand(tabId, "DOM.getBoxModel", { nodeId: nodeId.nodeId });
  if (!boxModel?.model) {
    throw new Error(`Cannot get box model for: ${selector}`);
  }
  const content = boxModel.model.content;
  // content 是 [x1,y1, x2,y2, x3,y3, x4,y4] 四个角的页面坐标
  const pageX = (content[0] + content[2] + content[4] + content[6]) / 4;
  const pageY = (content[1] + content[3] + content[5] + content[7]) / 4;

  // 将页面坐标转为视口坐标（Input.dispatchMouseEvent 需要视口相对坐标）
  const metrics = await sendCommand(tabId, "Page.getLayoutMetrics");
  const viewportX = pageX - (metrics.visualViewport?.pageX ?? 0);
  const viewportY = pageY - (metrics.visualViewport?.pageY ?? 0);

  // 遮挡检测：检查该坐标处实际命中的元素是否是目标元素（或其子元素）
  const selectorStr = JSON.stringify(selector);
  const hitTest = await sendCommand(tabId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.elementFromPoint(${viewportX}, ${viewportY});
      const target = document.querySelector(${selectorStr});
      if (!el || !target) return 'not_found';
      if (target.contains(el) || el === target) return 'hit';
      return 'blocked_by:' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ').join('.') : '');
    })()`,
    returnByValue: true,
  });
  const hitValue = hitTest?.result?.value;
  if (typeof hitValue === "string" && hitValue !== "hit") {
    throw new Error(
      `Click blocked: element at (${Math.round(viewportX)},${Math.round(viewportY)}) is ${hitValue}, not "${selector}"`
    );
  }

  // 模拟鼠标点击
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: viewportX,
    y: viewportY,
    button: "left",
    clickCount: 1,
  });
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: viewportX,
    y: viewportY,
    button: "left",
    clickCount: 1,
  });

  // 等待页面稳定
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 收集结果
  const tab = await chrome.tabs.get(tabId);
  const currentUrl = tab.url || "";
  return {
    success: true,
    navigated: currentUrl !== originalUrl,
    url: currentUrl,
  };
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
  const captureParams: Record<string, unknown> = {
    format: "jpeg",
    quality,
    captureBeyondViewport: options?.fullPage ?? false,
  };

  // 指定 selector 时，定位元素并裁剪截图区域
  if (options?.selector) {
    const doc = await sendCommand(tabId, "DOM.getDocument");
    const nodeResult = await sendCommand(tabId, "DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: options.selector,
    });
    if (!nodeResult?.nodeId) {
      throw new Error(`Screenshot target not found: ${options.selector}`);
    }
    // 滚动到可见区域
    await sendCommand(tabId, "DOM.scrollIntoViewIfNeeded", { nodeId: nodeResult.nodeId });
    const boxModel = await sendCommand(tabId, "DOM.getBoxModel", { nodeId: nodeResult.nodeId });
    if (!boxModel?.model) {
      throw new Error(`Cannot get box model for: ${options.selector}`);
    }
    // content 是 [x1,y1, x2,y2, x3,y3, x4,y4] 四个角的页面坐标
    const content = boxModel.model.border; // 用 border box 包含边框
    const xs = [content[0], content[2], content[4], content[6]];
    const ys = [content[1], content[3], content[5], content[7]];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    captureParams.clip = { x, y, width, height, scale: 1 };
    // 区域截图需要 captureBeyondViewport 才能截到视口外的内容
    captureParams.captureBeyondViewport = true;
  }

  const result = await sendCommand(tabId, "Page.captureScreenshot", captureParams);
  return `data:image/jpeg;base64,${result.data}`;
}

// ---- 页面监控（startMonitor / stopMonitor） ----

// 启动页面监控：attach debugger，纯 CDP 事件监听（dialog + DOM 变化），零注入
export async function cdpStartMonitor(tabId: number): Promise<void> {
  // 如果已有 monitor，先停止
  if (activeMonitors.has(tabId)) {
    await cdpStopMonitor(tabId);
  }

  const dialogs: Array<{ type: string; message: string }> = [];
  const capturedNodes: CapturedNode[] = [];

  // attach debugger
  await chrome.debugger.attach({ tabId }, "1.3");
  await sendCommand(tabId, "Page.enable");
  await sendCommand(tabId, "DOM.enable");

  // 获取 document root，触发 DOM 树追踪
  await sendCommand(tabId, "DOM.getDocument", { depth: 0 });

  // 监听 CDP 事件
  const listener: MonitorEventListener = (source, method, params) => {
    if (source.tabId !== tabId) return;

    // JS 弹框（alert/confirm/prompt）
    if (method === "Page.javascriptDialogOpening") {
      dialogs.push({
        type: String(params?.type || "alert"),
        message: String(params?.message || ""),
      });
      sendCommand(tabId, "Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    }

    // DOM 新增子节点：直接从事件的 node 对象提取属性
    if (method === "DOM.childNodeInserted") {
      const node = params?.node;
      if (node && node.nodeType === 1) {
        // node.attributes 是 [name, value, name, value, ...] 扁平数组
        const attrs: Record<string, string> = {};
        if (node.attributes) {
          for (let i = 0; i < node.attributes.length; i += 2) {
            attrs[node.attributes[i]] = node.attributes[i + 1];
          }
        }
        capturedNodes.push({
          nodeId: node.nodeId,
          tag: (node.localName || node.nodeName || "").toLowerCase(),
          id: attrs.id || undefined,
          class: attrs.class || undefined,
          role: attrs.role || undefined,
        });
      }
    }
  };
  chrome.debugger.onEvent.addListener(listener);

  activeMonitors.set(tabId, { dialogs, capturedNodes, listener });
}

// 轻量查询当前 monitor 状态（不停止监控）
export function cdpPeekMonitor(tabId: number): { hasChanges: boolean; dialogCount: number; nodeCount: number } {
  const monitor = activeMonitors.get(tabId);
  if (!monitor) {
    return { hasChanges: false, dialogCount: 0, nodeCount: 0 };
  }
  const dialogCount = monitor.dialogs.length;
  const nodeCount = monitor.capturedNodes.length;
  return { hasChanges: dialogCount > 0 || nodeCount > 0, dialogCount, nodeCount };
}

// 从 outerHTML 中提取纯文本（去除所有标签）
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 停止监控：纯 CDP 解析新增节点 → 收集结果 → detach
export async function cdpStopMonitor(tabId: number): Promise<MonitorResult> {
  const monitor = activeMonitors.get(tabId);
  const result: MonitorResult = {
    dialogs: monitor?.dialogs || [],
    addedNodes: [],
  };

  if (monitor && monitor.capturedNodes.length > 0) {
    // 去重（按 nodeId）并限制数量
    const seen = new Set<number>();
    const uniqueNodes = monitor.capturedNodes
      .filter((n) => {
        if (seen.has(n.nodeId)) return false;
        seen.add(n.nodeId);
        return true;
      })
      .slice(0, 50);

    for (const captured of uniqueNodes) {
      try {
        // 用 DOM.getBoxModel 检测可见性：不可见/未渲染的元素会抛异常
        await sendCommand(tabId, "DOM.getBoxModel", { nodeId: captured.nodeId });

        // 用 DOM.getOuterHTML 获取内容，纯 CDP 无需注入 JS
        const htmlResult = await sendCommand(tabId, "DOM.getOuterHTML", { nodeId: captured.nodeId });
        const outerHTML: string = htmlResult?.outerHTML || "";
        const text = stripHtmlTags(outerHTML).slice(0, 300);
        if (!text) continue;

        result.addedNodes.push({
          tag: captured.tag,
          id: captured.id,
          class: captured.class,
          role: captured.role,
          text,
        });
      } catch {
        // 节点可能已被移除或不可见，跳过
      }
    }
  }

  // 清理
  if (monitor) {
    chrome.debugger.onEvent.removeListener(monitor.listener);
    activeMonitors.delete(tabId);
  }

  try {
    await sendCommand(tabId, "DOM.disable");
  } catch {
    /* 忽略 */
  }
  try {
    await sendCommand(tabId, "Page.disable");
  } catch {
    /* 忽略 */
  }
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    /* 忽略 */
  }

  return result;
}
