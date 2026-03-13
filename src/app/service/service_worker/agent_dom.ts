// AgentDomService — DOM 操作核心逻辑，在 Service Worker 中运行
// 默认模式通过 chrome.scripting.executeScript 操作
// trusted 模式通过 chrome.debugger CDP 操作

import type {
  TabInfo,
  ActionResult,
  PageContent,
  ReadPageOptions,
  DomActionOptions,
  ScreenshotOptions,
  NavigateOptions,
  ScrollDirection,
  ScrollOptions,
  ScrollResult,
  NavigateResult,
  WaitForOptions,
  WaitForResult,
  DomApiRequest,
} from "@App/app/service/agent/types";
import {
  withDebugger,
  cdpClick,
  cdpFill,
  cdpScreenshot,
} from "./agent_dom_cdp";

export class AgentDomService {
  // 列出所有标签页
  async listTabs(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({});
    return tabs
      .filter((t) => t.id !== undefined)
      .map((t) => ({
        tabId: t.id!,
        url: t.url || "",
        title: t.title || "",
        active: t.active || false,
        windowId: t.windowId,
        discarded: t.discarded || false,
      }));
  }

  // 导航到 URL
  async navigate(url: string, options?: NavigateOptions): Promise<NavigateResult> {
    const timeout = options?.timeout ?? 30000;
    const waitUntil = options?.waitUntil ?? true;

    let tabId: number;
    if (options?.tabId) {
      await chrome.tabs.update(options.tabId, { url });
      tabId = options.tabId;
    } else {
      const tab = await chrome.tabs.create({ url });
      tabId = tab.id!;
    }

    if (waitUntil) {
      await this.waitForPageLoad(tabId, timeout);
    }

    const tab = await chrome.tabs.get(tabId);
    return {
      tabId,
      url: tab.url || url,
      title: tab.title || "",
    };
  }

  // 读取页面内容
  async readPage(options?: ReadPageOptions): Promise<PageContent> {
    const tabId = await this.resolveTabId(options?.tabId);
    const mode = options?.mode ?? "summary";
    const maxLength = options?.maxLength ?? 4000;
    const selector = options?.selector;
    const viewportOnly = options?.viewportOnly ?? false;

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: readPageContent,
      args: [{ mode, maxLength, selector, viewportOnly }],
      world: "MAIN",
    });

    if (!results || results.length === 0) {
      throw new Error("Failed to read page content");
    }

    return results[0].result as PageContent;
  }

  // 截图
  async screenshot(options?: ScreenshotOptions): Promise<string> {
    const tabId = await this.resolveTabId(options?.tabId);

    // 检查 tab 是否前台 active
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) {
      // 后台 tab 优先用 CDP 截图
      try {
        return await withDebugger(tabId, (id) => cdpScreenshot(id, options));
      } catch (e) {
        console.error("[AgentDom] CDP screenshot failed, falling back to captureVisibleTab", {
          tabId,
          error: e instanceof Error ? e.message : e,
        });
      }
      // 降级：先激活 tab 再用 captureVisibleTab
      await chrome.tabs.update(tabId, { active: true });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const quality = options?.quality ?? 80;
    const updatedTab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(updatedTab.windowId, {
      format: "jpeg",
      quality,
    });
    return dataUrl;
  }

  // 点击元素
  async click(selector: string, options?: DomActionOptions): Promise<ActionResult> {
    const tabId = await this.resolveTabId(options?.tabId);

    if (options?.trusted) {
      try {
        return await withDebugger(tabId, (id) => cdpClick(id, selector));
      } catch (e) {
        console.error("[AgentDom] CDP click failed, falling back to non-trusted mode", {
          tabId,
          selector,
          error: e instanceof Error ? e.message : e,
        });
      }
    }

    return this.executeClick(tabId, selector);
  }

  // 填写表单
  async fill(selector: string, value: string, options?: DomActionOptions): Promise<ActionResult> {
    const tabId = await this.resolveTabId(options?.tabId);

    if (options?.trusted) {
      try {
        return await withDebugger(tabId, (id) => cdpFill(id, selector, value));
      } catch (e) {
        console.error("[AgentDom] CDP fill failed, falling back to non-trusted mode", {
          tabId,
          selector,
          error: e instanceof Error ? e.message : e,
        });
      }
    }

    return this.executeFill(tabId, selector, value);
  }

  // 滚动页面
  async scroll(direction: ScrollDirection, options?: ScrollOptions): Promise<ScrollResult> {
    const tabId = await this.resolveTabId(options?.tabId);
    const selector = options?.selector;

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: executeScroll,
      args: [direction, selector || null],
      world: "MAIN",
    });

    if (!results || results.length === 0) {
      throw new Error("Failed to scroll");
    }

    return results[0].result as ScrollResult;
  }

  // 等待元素出现
  async waitFor(selector: string, options?: WaitForOptions): Promise<WaitForResult> {
    const tabId = await this.resolveTabId(options?.tabId);
    const timeout = options?.timeout ?? 10000;
    const interval = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: checkElement,
        args: [selector],
        world: "MAIN",
      });

      if (results?.[0]?.result) {
        return results[0].result as WaitForResult;
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return { found: false };
  }

  // 处理 GM API 请求路由
  async handleDomApi(request: DomApiRequest): Promise<unknown> {
    switch (request.action) {
      case "listTabs":
        return this.listTabs();
      case "navigate":
        return this.navigate(request.url, request.options);
      case "readPage":
        return this.readPage(request.options);
      case "screenshot":
        return this.screenshot(request.options);
      case "click":
        return this.click(request.selector, request.options);
      case "fill":
        return this.fill(request.selector, request.value, request.options);
      case "scroll":
        return this.scroll(request.direction, request.options);
      case "waitFor":
        return this.waitFor(request.selector, request.options);
      default:
        throw new Error(`Unknown DOM action: ${(request as any).action}`);
    }
  }

  // ---- 辅助方法 ----

  // 不可注入脚本的 URL 协议
  private static RESTRICTED_PROTOCOLS = ["chrome:", "chrome-extension:", "edge:", "about:", "devtools:"];

  // 检查 URL 是否可以注入脚本
  private isRestrictedUrl(url: string | undefined): boolean {
    if (!url) return false;
    return AgentDomService.RESTRICTED_PROTOCOLS.some((p) => url.startsWith(p));
  }

  // 解析 tabId，未传则获取当前活动 tab
  private async resolveTabId(tabId?: number): Promise<number> {
    if (tabId) {
      const tab = await chrome.tabs.get(tabId);
      // 检测是否为受限页面
      if (this.isRestrictedUrl(tab.url)) {
        throw new Error(
          `Cannot operate on restricted page: ${tab.url}. Browser internal pages and extension pages do not allow script injection. Please specify a regular web page tab.`
        );
      }
      // 检测 tab 是否被 discard
      if (tab.discarded) {
        await chrome.tabs.reload(tabId);
        await this.waitForPageLoad(tabId, 30000);
      }
      return tabId;
    }
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs.length === 0 || !tabs[0].id) {
      throw new Error("No active tab found");
    }
    // 当前活动标签是受限页面时，提示用户指定目标 tab
    if (this.isRestrictedUrl(tabs[0].url)) {
      throw new Error(
        `Active tab is a restricted page (${tabs[0].url}) which does not allow script injection. Please use dom_list_tabs to find a regular web page and specify its tabId.`
      );
    }
    return tabs[0].id;
  }

  // 等待页面加载完成
  private waitForPageLoad(tabId: number, timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Page load timed out"));
      }, timeout);

      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      // 先检查当前状态
      chrome.tabs.get(tabId).then((tab) => {
        if (tab.status === "complete") {
          clearTimeout(timer);
          resolve();
        } else {
          chrome.tabs.onUpdated.addListener(listener);
        }
      });
    });
  }

  // 默认模式点击
  private async executeClick(tabId: number, selector: string): Promise<ActionResult> {
    const tab = await chrome.tabs.get(tabId);
    const originalUrl = tab.url || "";

    // 注入 dialog 拦截
    await this.injectDialogInterceptor(tabId);

    // 监听新 tab 打开
    let newTabInfo: { tabId: number; url: string } | undefined;
    const onCreated = (newTab: chrome.tabs.Tab) => {
      if (newTab.openerTabId === tabId && newTab.id) {
        newTabInfo = { tabId: newTab.id, url: newTab.pendingUrl || newTab.url || "" };
      }
    };
    chrome.tabs.onCreated.addListener(onCreated);

    try {
      // 执行点击
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`Element not found: ${sel}`);
          (el as HTMLElement).click();
        },
        args: [selector],
        world: "MAIN",
      });

      // 等待页面稳定
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 收集结果
      return await this.collectActionResult(tabId, originalUrl, newTabInfo);
    } finally {
      chrome.tabs.onCreated.removeListener(onCreated);
    }
  }

  // 默认模式填写
  private async executeFill(tabId: number, selector: string, value: string): Promise<ActionResult> {
    const tab = await chrome.tabs.get(tabId);
    const originalUrl = tab.url || "";

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) throw new Error(`Element not found: ${sel}`);
        el.focus();
        // 清空现有值
        el.value = "";
        // 设置新值
        el.value = val;
        // 触发事件
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      args: [selector, value],
      world: "MAIN",
    });

    return {
      success: true,
      url: originalUrl,
    };
  }

  // 注入 dialog 拦截代码
  private async injectDialogInterceptor(tabId: number): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const w = window as any;
        if (!w.__sc_interceptors__) {
          w.__sc_dialog_log__ = [] as Array<{ type: string; message: string }>;
          const origAlert = window.alert;
          const origConfirm = window.confirm;
          const origPrompt = window.prompt;
          window.alert = (msg?: string) => {
            w.__sc_dialog_log__.push({ type: "alert", message: String(msg ?? "") });
          };
          window.confirm = (msg?: string) => {
            w.__sc_dialog_log__.push({ type: "confirm", message: String(msg ?? "") });
            return true;
          };
          window.prompt = (msg?: string) => {
            w.__sc_dialog_log__.push({ type: "prompt", message: String(msg ?? "") });
            return "";
          };
          w.__sc_interceptors__ = { origAlert, origConfirm, origPrompt };
        }
      },
      world: "MAIN",
    });
  }

  // 收集操作后的状态
  private async collectActionResult(
    tabId: number,
    originalUrl: string,
    newTabInfo?: { tabId: number; url: string }
  ): Promise<ActionResult> {
    let currentUrl = originalUrl;
    try {
      const tab = await chrome.tabs.get(tabId);
      currentUrl = tab.url || originalUrl;
    } catch {
      // tab 可能已关闭
    }

    const navigated = currentUrl !== originalUrl;

    // 读取拦截的 dialog
    let dialogInfo: { type: "alert" | "confirm" | "prompt"; message: string } | undefined;
    try {
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
      const dialogs = dialogResults?.[0]?.result;
      if (dialogs && dialogs.length > 0) {
        dialogInfo = dialogs[0];
      }
    } catch {
      // 页面可能已跳转
    }

    const result: ActionResult = {
      success: true,
      navigated,
      url: currentUrl,
    };

    if (newTabInfo) {
      result.newTab = newTabInfo;
    }
    if (dialogInfo) {
      result.dialog = dialogInfo;
    }

    return result;
  }
}

// ---- 注入到页面中执行的函数 ----

// 读取页面内容（注入到页面执行）
function readPageContent(options: {
  mode: string;
  maxLength: number;
  selector: string | undefined | null;
  viewportOnly: boolean;
}): PageContent {
  const { mode, maxLength, selector, viewportOnly } = options;

  const root = selector ? document.querySelector(selector) || document.body : document.body;

  // 判断元素是否可见
  const isVisible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    if (viewportOnly) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        return false;
      }
    }
    return true;
  };

  // 生成唯一选择器
  const getSelector = (el: Element): string => {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (!parent) return tag;
    const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (siblings.length === 1) {
      const parentSel = getSelector(parent);
      return `${parentSel} > ${tag}`;
    }
    const index = siblings.indexOf(el) + 1;
    const parentSel = getSelector(parent);
    return `${parentSel} > ${tag}:nth-of-type(${index})`;
  };

  // 收集可交互元素
  const interactable: PageContent["interactable"] = [];
  const interactableSelectors = "button, [role='button'], a[href], input, textarea, select, [tabindex], [onclick]";
  const interactableEls = root.querySelectorAll(interactableSelectors);

  for (const el of Array.from(interactableEls).slice(0, 50)) {
    if (!isVisible(el)) continue;
    const htmlEl = el as HTMLElement;
    interactable.push({
      selector: getSelector(el),
      tag: el.tagName.toLowerCase(),
      text: (htmlEl.textContent || htmlEl.getAttribute("aria-label") || htmlEl.getAttribute("title") || "")
        .trim()
        .slice(0, 100),
      role: el.getAttribute("role") || undefined,
      type: el.getAttribute("type") || undefined,
      visible: true,
    });
  }

  // 收集表单
  const forms: PageContent["forms"] = [];
  const formEls = root.querySelectorAll("form");
  for (const form of Array.from(formEls).slice(0, 10)) {
    if (!isVisible(form)) continue;
    const fields: PageContent["forms"][0]["fields"] = [];
    const inputs = form.querySelectorAll("input, textarea, select");
    for (const input of Array.from(inputs).slice(0, 20)) {
      const htmlInput = input as HTMLInputElement;
      const field: PageContent["forms"][0]["fields"][0] = {
        selector: getSelector(input),
        name: htmlInput.name || htmlInput.id || "",
        type: htmlInput.type || input.tagName.toLowerCase(),
        value: htmlInput.value || undefined,
        placeholder: htmlInput.placeholder || undefined,
        required: htmlInput.required || false,
      };
      if (input.tagName === "SELECT") {
        field.options = Array.from((input as HTMLSelectElement).options).map((o) => o.text);
      }
      fields.push(field);
    }
    forms.push({
      selector: getSelector(form),
      action: form.action || undefined,
      fields,
    });
  }

  // 收集链接
  const links: PageContent["links"] = [];
  const linkEls = root.querySelectorAll("a[href]");
  for (const el of Array.from(linkEls).slice(0, 30)) {
    if (!isVisible(el)) continue;
    const anchor = el as HTMLAnchorElement;
    const text = (anchor.textContent || "").trim().slice(0, 100);
    if (!text) continue;
    links.push({
      selector: getSelector(el),
      text,
      href: anchor.href,
    });
  }

  const result: PageContent = {
    title: document.title,
    url: location.href,
    interactable,
    forms,
    links,
  };

  if (mode === "summary") {
    // 概要模式：提取页面骨架
    const sections: PageContent["sections"] = [];
    const sectionTags = "main, article, section, nav, header, footer, aside, [role='main'], [role='navigation']";
    const sectionEls = root.querySelectorAll(sectionTags);

    if (sectionEls.length === 0) {
      // 没有语义化标签，用 body 直接的子 div
      const children = root.children;
      for (const child of Array.from(children).slice(0, 20)) {
        if (!isVisible(child)) continue;
        const text = (child.textContent || "").trim();
        if (!text) continue;
        sections.push({
          selector: getSelector(child),
          summary: text.replace(/\s+/g, " ").slice(0, 200),
          elementCount: child.querySelectorAll("*").length,
        });
      }
    } else {
      for (const el of Array.from(sectionEls).slice(0, 20)) {
        if (!isVisible(el)) continue;
        const text = (el.textContent || "").trim();
        if (!text) continue;
        sections.push({
          selector: getSelector(el),
          summary: text.replace(/\s+/g, " ").slice(0, 200),
          elementCount: el.querySelectorAll("*").length,
        });
      }
    }

    result.sections = sections;

    // 控制总长度
    const json = JSON.stringify(result);
    if (json.length > maxLength) {
      result.truncated = true;
      result.totalLength = json.length;
    }
  } else {
    // 详细模式：提取文本内容
    const extractText = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || "").trim();
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      // 跳过不需要的标签
      if (["script", "style", "svg", "noscript"].includes(tag)) return "";
      if (!isVisible(el)) return "";

      // 图片替换
      if (tag === "img") {
        const alt = el.getAttribute("alt") || "";
        return alt ? `[图片: ${alt}]` : "[图片]";
      }

      const children = Array.from(node.childNodes);
      let text = "";

      // 列表截断
      if (tag === "ul" || tag === "ol") {
        const items = el.querySelectorAll(":scope > li");
        const maxItems = 20;
        for (let i = 0; i < Math.min(items.length, maxItems); i++) {
          text += extractText(items[i]) + "\n";
        }
        if (items.length > maxItems) {
          text += `... (${items.length - maxItems} more items)\n`;
        }
        return text;
      }

      // 表格截断
      if (tag === "table") {
        const rows = el.querySelectorAll("tr");
        const maxRows = 10;
        for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
          text += extractText(rows[i]) + "\n";
        }
        if (rows.length > maxRows) {
          text += `... (${rows.length - maxRows} more rows)\n`;
        }
        return text;
      }

      for (const child of children) {
        text += extractText(child) + " ";
      }

      // 块级元素添加换行
      if (["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "br", "hr"].includes(tag)) {
        text += "\n";
      }

      return text;
    };

    let content = extractText(root);
    // 折叠连续空白
    content = content
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (content.length > maxLength) {
      result.truncated = true;
      result.totalLength = content.length;
      content = content.slice(0, maxLength);
    }
    result.content = content;
  }

  return result;
}

// 滚动操作（注入到页面执行）
function executeScroll(direction: string, selector: string | null): ScrollResult {
  const target = selector ? document.querySelector(selector) : document.documentElement;
  if (!target) throw new Error(`Element not found: ${selector}`);

  const el = selector ? (target as HTMLElement) : document.documentElement;
  const scrollAmount = window.innerHeight * 0.8;

  switch (direction) {
    case "up":
      if (selector) {
        el.scrollBy(0, -scrollAmount);
      } else {
        window.scrollBy(0, -scrollAmount);
      }
      break;
    case "down":
      if (selector) {
        el.scrollBy(0, scrollAmount);
      } else {
        window.scrollBy(0, scrollAmount);
      }
      break;
    case "top":
      if (selector) {
        el.scrollTop = 0;
      } else {
        window.scrollTo(0, 0);
      }
      break;
    case "bottom":
      if (selector) {
        el.scrollTop = el.scrollHeight;
      } else {
        window.scrollTo(0, document.documentElement.scrollHeight);
      }
      break;
  }

  const scrollEl = selector ? el : document.documentElement;
  return {
    scrollTop: scrollEl.scrollTop || window.scrollY,
    scrollHeight: scrollEl.scrollHeight,
    clientHeight: scrollEl.clientHeight || window.innerHeight,
    atBottom: scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 10,
  };
}

// 检查元素是否存在（注入到页面执行）
function checkElement(selector: string): WaitForResult | null {
  const el = document.querySelector(selector);
  if (!el) return null;

  const htmlEl = el as HTMLElement;
  const style = window.getComputedStyle(el);
  const visible = style.display !== "none" && style.visibility !== "hidden";

  // 生成选择器
  const getSelector = (e: Element): string => {
    if (e.id) return `#${e.id}`;
    const tag = e.tagName.toLowerCase();
    const parent = e.parentElement;
    if (!parent) return tag;
    const siblings = Array.from(parent.children).filter((c) => c.tagName === e.tagName);
    if (siblings.length === 1) return `${getSelector(parent)} > ${tag}`;
    const index = siblings.indexOf(e) + 1;
    return `${getSelector(parent)} > ${tag}:nth-of-type(${index})`;
  };

  return {
    found: true,
    element: {
      selector: getSelector(el),
      tag: el.tagName.toLowerCase(),
      text: (htmlEl.textContent || "").trim().slice(0, 100),
      role: el.getAttribute("role") || undefined,
      type: el.getAttribute("type") || undefined,
      visible,
    },
  };
}
