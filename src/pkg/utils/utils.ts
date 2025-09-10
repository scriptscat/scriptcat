import type { SCMetadata, Script } from "@App/app/repo/scripts";

export function randNum(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export function randomMessageFlag(): string {
  // parseInt('a0000000', 36) = 783641640960;
  // parseInt('zzzzzzzz', 36) = 2821109907455;
  return `-${Date.now().toString(36)}.${randNum(8e11, 2e12).toString(36)}`;
}

export function isFirefox() {
  //@ts-ignore
  return typeof mozInnerScreenX !== "undefined";
}

export function InfoNotification(title: string, msg: string) {
  chrome.notifications.create({
    type: "basic",
    title,
    message: msg,
    iconUrl: chrome.runtime.getURL("assets/logo.png"),
  });
}

export function valueType(val: unknown) {
  switch (typeof val) {
    case "string":
    case "number":
    case "boolean":
    case "object":
      return typeof val;
    default:
      return "unknown";
  }
}

export function toStorageValueStr(val: unknown): string {
  switch (typeof val) {
    case "string":
      return `s${val}`;
    case "number":
      return `n${val}`;
    case "boolean":
      return `b${val}`;
    default:
      try {
        return `o${JSON.stringify(val)}`;
      } catch {
        return "";
      }
  }
}

export function parseStorageValue(str: string): unknown {
  if (str === "") {
    return undefined;
  }
  const t = str[0];
  const s = str.substring(1);
  switch (t) {
    case "b":
      return s === "true";
    case "n":
      return parseFloat(s);
    case "o":
      try {
        return JSON.parse(s);
      } catch {
        return str;
      }
    case "s":
      return s;
    default:
      return str;
  }
}

// https://developer.chrome.com/docs/extensions/reference/api/tabs?hl=en#get_the_current_tab
export async function getCurrentTab() {
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

export async function getTab(tabId: number) {
  return await chrome.tabs.get(tabId).catch(() => undefined);
}

// 在当前页后打开一个新页面，如果指定tabId则在该tab后打开
export async function openInCurrentTab(url: string, tabId?: number) {
  const tab = await (tabId ? getTab(tabId) : getCurrentTab());
  const createProperties: chrome.tabs.CreateProperties = { url };
  if (tab) {
    // 添加 openerTabId 有可能出现 Error "Tab opener must be in the same window as the updated tab."
    if (tab.id! >= 0) {
      // 如 Tab API 有提供 tab.id, 則指定 tab.id
      createProperties.openerTabId = tab.id;
      if (tab.windowId! >= 0) {
        // 如 Tab API 有提供 tab.windowId, 則指定 tab.windowId
        createProperties.windowId = tab.windowId;
      }
    }
    createProperties.index = tab.index + 1;
  }
  // 先嘗試以 openerTabId 和 windowId 打開
  try {
    await chrome.tabs.create(createProperties);
    return;
  } catch (e: any) {
    console.error("Error opening tab:", e);
  }
  // 失敗的話，刪去 openerTabId 和 windowId ，再次嘗試打開
  delete createProperties.openerTabId;
  delete createProperties.windowId;
  try {
    await chrome.tabs.create(createProperties);
    return;
  } catch (e: any) {
    console.error("Retry opeing tab error:", e);
  }
}

// 检查订阅规则是否改变,是否能够静默更新
export function checkSilenceUpdate(oldMeta: SCMetadata, newMeta: SCMetadata): boolean {
  // 判断connect是否改变
  const oldConnect = new Set<string>(oldMeta.connect || []);
  const newConnect = new Set<string>(newMeta.connect || []);
  // 老的里面没有新的就需要用户确认了
  for (const key of newConnect) {
    if (!oldConnect.has(key)) {
      return false;
    }
  }
  return true;
}

export function sleep(millis: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, millis);
  });
}

export function getStorageName(script: Script): string {
  const storagename = script.metadata?.storagename;
  return storagename ? storagename[0] : script.uuid;
}

export function getIcon(script: Script): string | undefined {
  return (
    script.metadata.icon?.[0] ??
    script.metadata.iconurl?.[0] ??
    script.metadata.defaulticon?.[0] ??
    script.metadata.icon64?.[0] ??
    script.metadata.icon64url?.[0]
  );
}

export function errorMsg(e: any): string {
  if (typeof e === "string") {
    return e;
  }
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "object") {
    return JSON.stringify(e);
  }
  return "";
}

// 预计报错有机会在异步Promise裡发生，不一定是 chrome.userScripts.getScripts
export async function isUserScriptsAvailable() {
  try {
    // Property access which throws if developer mode is not enabled.
    // Method call which throws if API permission or toggle is not enabled.
    chrome.userScripts;
    const ret: chrome.userScripts.RegisteredUserScript[] | any = await chrome.userScripts.getScripts({
      // 放不可能存在的id. 我们只需要知道API能否执行。不需要完整所有userScripts
      ids: ["undefined-id-1", "undefined-id-2"],
    });
    // 返回一个阵列的话表示API能正常使用 （有执行权限）
    return ret !== undefined && ret !== null && typeof ret[Symbol.iterator] === "function";
  } catch {
    // Not available.
    return false;
  }
}

// 获取浏览器内核版本
export function getBrowserVersion(): number {
  try {
    return Number(navigator.userAgent.match(/(Chrome|Chromium)\/([0-9]+)/)?.[2]);
  } catch (e) {
    console.error("Error getting browser version:", e);
    return 0; // 返回0表示获取失败
  }
}

// 判断是否为Edge浏览器
export function isEdge(): boolean {
  return navigator.userAgent.includes("Edg/");
}

export enum BrowserType {
  Edge = 2,
  Chrome = 1,
  chromeA = 4, // ~ 120
  chromeB = 8, // 121 ~ 137
  chromeC = 16, // 138 ~
}

export function getBrowserType() {
  const o = {
    firefox: 0, // Firefox, Zen
    webkit: 0, // Safari, Orion
    chrome: 0, // Chrome, Chromium, Brave, Edge
    unknown: 0,
    chromeVersion: 0,
  };
  if (isFirefox()) {
    o.firefox = 1;
  } else {
    //@ts-ignore
    const isWebkitBased = typeof webkitIndexedDB === "object";
    if (isWebkitBased) {
      o.webkit = 1;
    } else {
      //@ts-ignore
      const isChromeBased = typeof webkitRequestAnimationFrame === "function";
      if (isChromeBased) {
        const isEdgeBrowser = isEdge();
        const chromeVersion = getBrowserVersion();
        o.chrome = (isEdgeBrowser ? 2 : 1) | (chromeVersion < 120 ? 4 : chromeVersion < 138 ? 8 : 16);
        o.chromeVersion = chromeVersion;
      } else {
        o.unknown = 1;
      }
    }
  }
  return o;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(<string>reader.result);
    reader.readAsDataURL(blob);
  });
}

/*
export function blobToText(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(<string | null>reader.result);
    reader.readAsText(blob);
  });
}
*/

export function base64ToBlob(dataURI: string) {
  const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
  const byteString = atob(dataURI.split(",")[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const intArray = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i += 1) {
    intArray[i] = byteString.charCodeAt(i);
  }
  return new Blob([intArray], { type: mimeString });
}

export function strToBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1: string) => {
      return String.fromCharCode(parseInt(`0x${p1}`, 16));
    })
  );
}

export function getMetadataStr(code: string): string | null {
  const start = code.indexOf("==UserScript==");
  const end = code.indexOf("==/UserScript==");
  if (start === -1 || end === -1) {
    return null;
  }
  return `// ${code.substring(start, end + 15)}`;
}

export function getUserConfigStr(code: string): string | null {
  const start = code.indexOf("==UserConfig==");
  const end = code.indexOf("==/UserConfig==");
  if (start === -1 || end === -1) {
    return null;
  }
  return `/* ${code.substring(start, end + 15)} */`;
}

export const obtainBlackList = (strBlacklist: string | null | undefined) => {
  const blacklist = strBlacklist
    ? strBlacklist
        .split("\n")
        .map((item) => item.trim())
        .filter((item) => item)
    : [];
  return blacklist;
};
