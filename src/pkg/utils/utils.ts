import type { Metadata, Script } from "@App/app/repo/scripts";

export function randomString(e = 32): string {
  const t = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz";
  const a = t.length;
  const n = new Array(e);
  for (let i = 0; i < e; i++) {
    n[i] = t[(Math.random() * a) | 0];
  }
  return n.join("");
}

export function dealSymbol(source: string): string {
  source = source.replace(/("|\\)/g, "\\$1");
  source = source.replace(/(\r\n|\n)/g, "\\n");
  return source;
}

export function dealScript(source: string): string {
  return dealSymbol(source);
}

export function isFirefox() {
  return navigator.userAgent.includes("Firefox");
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
      return `n${val.toString()}`;
    case "boolean":
      return `b${val ? "true" : "false"}`;
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

// 在当前页后打开一个新页面
export function openInCurrentTab(url: string) {
  chrome.tabs.query(
    {
      active: true,
    },
    (tabs) => {
      if (tabs.length) {
        chrome.tabs.create({
          url,
          index: tabs[0].index + 1,
        });
      } else {
        chrome.tabs.create({
          url,
        });
      }
    }
  );
}

export function isDebug() {
  return process.env.NODE_ENV === "development";
}

// 检查订阅规则是否改变,是否能够静默更新
export function checkSilenceUpdate(oldMeta: Metadata, newMeta: Metadata): boolean {
  // 判断connect是否改变
  const oldConnect: { [key: string]: boolean } = {};
  const newConnect: { [key: string]: boolean } = {};
  oldMeta.connect &&
    oldMeta.connect.forEach((val) => {
      oldConnect[val] = true;
    });
  newMeta.connect &&
    newMeta.connect.forEach((val) => {
      newConnect[val] = true;
    });
  // 老的里面没有新的就需要用户确认了
  const keys = Object.keys(newConnect);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!oldConnect[key]) {
      return false;
    }
  }
  return true;
}

export function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

export function getStorageName(script: Script): string {
  if (script.metadata && script.metadata.storagename) {
    return script.metadata.storagename[0];
  }
  return script.uuid;
}

export function getIcon(script: Script): string | undefined {
  return (
    (script.metadata.icon && script.metadata.icon[0]) ||
    (script.metadata.iconurl && script.metadata.iconurl[0]) ||
    (script.metadata.defaulticon && script.metadata.defaulticon[0]) ||
    (script.metadata.icon64 && script.metadata.icon64[0]) ||
    (script.metadata.icon64url && script.metadata.icon64url[0])
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

export function isUserScriptsAvailable() {
  try {
    // Method call which throws if API permission or toggle is not enabled.
    chrome.userScripts.getScripts();
    return true;
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

/*
export function strToBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1: string) => {
      return String.fromCharCode(parseInt(`0x${p1}`, 16));
    })
  );
}
*/

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
