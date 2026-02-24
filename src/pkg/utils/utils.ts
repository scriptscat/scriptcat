import type { SCMetadata, Script, TScriptInfo } from "@App/app/repo/scripts";
import type { SystemConfigKey } from "../config/config";

export function randNum(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export function randomMessageFlag(): string {
  // parseInt('a0000000', 36) = 783641640960;
  // parseInt('zzzzzzzz', 36) = 2821109907455;
  return `-${Date.now().toString(36)}.${randNum(8e11, 2e12).toString(36)}`;
}

let prevNow = 0;
/**
 * accumulated "now".
 * 用 aNow 取得的现在时间能保证严格递增
 */
export const aNow = () => {
  let now = Date.now();
  if (prevNow >= now) now = prevNow + 0.0009765625; // 2^-10
  prevNow = now;
  return now;
};

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T | PromiseLike<T>) => void;
  reject: (e?: any) => void;
};

export const deferred = <T = void>(): Deferred<T> => {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

export function isFirefox() {
  // @ts-ignore. For both Page & Worker
  return typeof mozInnerScreenX !== "undefined" || typeof navigator.mozGetUserMedia === "function";
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
export async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  // 不要使用 windowType: "normal" ，否则在使用应用窗口时获取不到 tab 了
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.discarded) return undefined;
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
      // 如 Tab API 有提供 tab.id, 则指定 tab.id
      createProperties.openerTabId = tab.id;
      if (tab.windowId! >= 0) {
        // 如 Tab API 有提供 tab.windowId, 则指定 tab.windowId
        createProperties.windowId = tab.windowId;
      }
    }
    createProperties.index = tab.index + 1;
  }
  // 先尝试以 openerTabId 和 windowId 打开
  try {
    await chrome.tabs.create(createProperties);
    return;
  } catch (e: any) {
    console.error("Error opening tab:", e);
  }
  // 失败的话，删去 openerTabId 和 windowId ，再次尝试打开
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

export function getStorageName(script: Script | TScriptInfo): string {
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

// 预计报错有机会在异步Promise里发生，不一定是 chrome.userScripts.getScripts
export async function checkUserScriptsAvailable() {
  try {
    // Property access which throws if developer mode is not enabled.
    // Method call which throws if API permission or toggle is not enabled.
    chrome.userScripts;
    // 没有 chrome.userScripts.getScripts 表示API不可使用
    if (typeof chrome.userScripts?.getScripts !== "function") return false;
    const ret = await chrome.userScripts.getScripts({ ids: ["scriptcat-content", "scriptcat-inject"] });
    // 返回结果不是阵列的话表示API不可使用
    if (!ret || typeof ret !== "object" || typeof ret.length !== "number") {
      return false;
    }

    if (ret[0]?.id) {
      // API内部处理实际给予扩展权限才会有返回Script
      // 已有注册脚本
      return true;
    } else {
      const scriptId = `undefined-id-${Date.now()}`; // 使用随机id避免并发冲突
      // 没有注册脚本
      // 进行 ${scriptId} 的注册反注册测试
      // Chrome MV3 的一部分浏览器（如 Vivaldi ）没正确处理 MV3 UserScripts API 权限问题 (API内部处理没有给予扩展权限)
      // 此时会无法注册 (1. register 报错)
      await chrome.userScripts.register([
        {
          id: scriptId,
          js: [{ code: "void 0;" }],
          matches: ["https://not-found.scriptcat.org/"],
          world: "USER_SCRIPT",
        },
      ]);
      // 清掉测试内容 (2. 如没有注入 ${scriptId} 成功，因脚本id不存在 unregister 报错)
      await chrome.userScripts.unregister({ ids: [scriptId] });
      return true;
    }
  } catch (e) {
    console.error("checkUserScriptsAvailable error:", e);
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
  return (
    // @ts-ignore; For Extension (Page/Worker), we can check UserSubscriptionState (hidden feature in Edge)
    typeof chrome.runtime.UserSubscriptionState === "object" ||
    // Fallback to userAgent check
    navigator.userAgent.includes("Edg/")
  );
}

export const BrowserType = {
  Edge: 2,
  Chrome: 1,
  noUserScriptsAPI: 64,
  guardedByDeveloperMode: 128,
  guardedByAllowScript: 256,
  Mouse: 1, // Desktop, Laptop. Tablet ??
  Touch: 2, // Touchscreen Laptop, Mobile, Tablet
} as const;

export type BrowserType = ValueOf<typeof BrowserType>;

export function getBrowserType() {
  const o = {
    firefox: 0, // Firefox, Zen
    webkit: 0, // Safari, Orion
    chrome: 0, // Chrome, Chromium, Brave, Edge
    unknown: 0,
    chromeVersion: 0,
    device: 0,
  };
  if (isFirefox()) {
    // Firefox, Zen
    o.firefox = 1;
  } else {
    //@ts-ignore
    const isWebkitBased = typeof webkitIndexedDB === "object";
    if (isWebkitBased) {
      // Safari, Orion
      o.webkit = 1;
    } else {
      const isChromeBased =
        typeof requestAnimationFrame === "function"
          ? // @ts-ignore. For Page only
            typeof webkitRequestAnimationFrame === "function"
          : // @ts-ignore. Available in Worker (Chrome 74+ Edge 79+)
            typeof BackgroundFetchRecord === "function";
      if (isChromeBased) {
        const isEdgeBrowser = isEdge();
        const chromeVersion = getBrowserVersion();
        o.chrome |= isEdgeBrowser ? BrowserType.Edge : BrowserType.Chrome;
        // 由小至大
        if (chromeVersion < 120) {
          o.chrome |= BrowserType.noUserScriptsAPI;
        } else {
          // 120+
          if (isEdgeBrowser ? chromeVersion < 144 : chromeVersion < 138) {
            o.chrome |= BrowserType.guardedByDeveloperMode;
          } else {
            // Edge 144+ / Chrome 138+
            o.chrome |= BrowserType.guardedByAllowScript;
            // 如日后再变化，在这里再加条件式
          }
        }
        o.chromeVersion = chromeVersion;
      } else {
        o.unknown = 1;
      }
    }
  }
  // BrowserType.Mouse 未能在 Worker 使用
  o.device |= typeof matchMedia === "function" && !matchMedia("(hover: none)").matches ? BrowserType.Mouse : 0;
  o.device |= navigator.maxTouchPoints > 0 ? BrowserType.Touch : 0;
  return o;
}

export const isPermissionOk = async (
  manifestPermission: chrome.runtime.ManifestOptionalPermissions & chrome.runtime.ManifestPermissions
): Promise<boolean | null> => {
  // 兼容 Firefox - 避免因为检查 permission 时，该permission不存在于 optional permission 而报错
  const manifest = chrome.runtime.getManifest();
  if (manifest.optional_permissions?.includes(manifestPermission)) {
    try {
      return await chrome.permissions.contains({ permissions: [manifestPermission] });
    } catch {
      // ignored
    }
  } else if (manifest.permissions?.includes(manifestPermission)) {
    // mainfest 而列明有该permission, 不用检查
    return true;
  }
  return null;
};

export const getBrowserInstalledVersion = () => {
  // unique for each browser update.
  // Usage: Detect whether the browser is upgraded.
  return btoa([...navigator.userAgent.matchAll(/[\d._]+/g)].map((e) => e[0]).join(";"));
};

export const makeBlobURL = <T extends { blob: Blob; persistence: boolean }>(
  params: T,
  fallbackFn?: (params: T) => string | Promise<string>
): Promise<string> | string => {
  if (typeof URL?.createObjectURL !== "function") {
    // 在service worker中，透过 offscreen 取得 blob URL
    if (!fallbackFn) throw new Error("URL.createObjectURL is not supported");
    return fallbackFn(params);
  } else {
    const url = URL.createObjectURL(params.blob);
    if (!params.persistence) {
      // 如果不是持久化的，则在1分钟后释放
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    }
    return url;
  }
};

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = function () {
      resolve(<string>this.result);
    };
    reader.readAsDataURL(blob);
  });
}

/*
export function blobToText(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = function () {
      resolve(<string>this.result);
    };
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

// 将蛇形的 key 转换为驼峰的函数名
export function toCamelCase(key: SystemConfigKey) {
  return key.replace(/^[a-z]|_([a-z])/g, (_, c = _) => c.toUpperCase());
}

export function cleanFileName(name: string): string {
  // https://github.com/Tampermonkey/tampermonkey/issues/2413
  // https://developer.chrome.com/docs/extensions/reference/api/downloads#type-DownloadOptions
  // A file path relative to the Downloads directory to contain the downloaded file, possibly containing subdirectories.
  // Absolute paths, empty paths, and paths containing back-references ".." will cause an error.
  let n = name;
  // eslint-disable-next-line no-control-regex
  n = n.replace(/[\x00-\x1F\\:*?"<>|]+/g, "-");
  return n.replace(/\.\.+/g, "-").trim();
}

export const sourceMapTo = (scriptName: string) => {
  const url = chrome.runtime.getURL(`/${encodeURI(scriptName)}`);
  return `\n//# sourceURL=${url}`;
};

export const stringMatching = (main: string, sub: string): boolean => {
  // If no wildcards, use simple includes check
  if (!sub.includes("*") && !sub.includes("?")) {
    return main.includes(sub);
  }

  // Escape special regex characters except * and ?
  const escapeRegex = (str: string) => str.replace(/[-[\]{}()+.,\\^$|#\s]/g, "\\$&");

  // Convert glob pattern to regex
  let pattern = escapeRegex(sub)
    .replace(/\*/g, "\\S*") // * matches zero or more non-space characters
    .replace(/\?/g, "\\S"); // ? matches exactly one non-space character

  // Anchor the pattern to match entire string
  pattern = `\\b${pattern}\\b`;

  try {
    // Create regex and test against main string
    const regex = new RegExp(pattern);
    return regex.test(main);
  } catch (e) {
    console.error(e);
    // Handle invalid regex patterns
    return false;
  }
};

/**
 * 将字节数转换为人类可读的格式（B, KB, MB, GB 等）。
 * @param bytes - 要转换的字节数（number）。
 * @param decimals - 小数位数，默认为 2。
 * @returns 格式化的字符串，例如 "1.23 MB"。
 */
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(decimals)} ${units[i]}`;
};

// TM Xhr Header 兼容处理，原生xhr \r\n 在尾，但TM的GMXhr没有；同时除去冒号后面的空白
export const normalizeResponseHeaders = (headersString: string) => {
  if (!headersString) return "";
  let out = "";
  headersString.split("\n").forEach((line) => {
    const j = line.indexOf(":");
    if (j > 0) {
      const headerName = line.substring(0, j); // "key"
      const headerValue = line.substring(j + 1).trim(); // "value"
      out += `${headerName}:${headerValue}\r\n`;
    }
  });
  return out.substring(0, out.length - 2); // 去掉最后的 \r\n
};

// 获取本周是第几周
// 遵循 ISO 8601, 一月四日为Week 1，星期一为新一周
// 能应对每年开始和结束（不会因为踏入新一年而重新计算）
// 见 https://wikipedia.org/wiki/ISO_week_date
// 中文说明 https://juejin.cn/post/6921245139855736846
export const getISOWeek = (date: Date): number => {
  // 使用传入日期的年月日创建 UTC 日期对象，忽略本地时间部分，避免时区影响
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  // 将日期调整到本周的星期四（ISO 8601 规定：周数以星期四所在周为准）
  // 计算方式：当前日期 + 4 − 当前星期几（星期一 = 1，星期日 = 7）
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));

  // 获取该星期四所在年份的第一天（UTC）
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  // 计算从年初到该星期四的天数差
  // 再换算为周数，并向上取整，得到 ISO 周数
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};
