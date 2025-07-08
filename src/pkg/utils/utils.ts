/* eslint-disable no-control-regex */
/* eslint-disable import/prefer-default-export */
/* eslint-disable default-case */
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Metadata } from "@App/app/repo/scripts";
import type MessageInternal from "@App/app/message/internal";

export function randomString(e: number) {
  e = e || 32;
  const t = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz";
  const a = t.length;
  let n = "";
  for (let i = 0; i < e; i += 1) {
    n += t.charAt(Math.floor(Math.random() * a));
  }
  return n;
}

export function dealSymbol(source: string): string {
  source = source.replace(/("|\\)/g, "\\$1");
  source = source.replace(/(\r\n|\n)/g, "\\n");
  return source;
}

export function dealScript(source: string): string {
  return dealSymbol(source);
}

export function isFirefox(): boolean {
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

export function valueType(val: any) {
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

export function toStorageValueStr(val: any): string {
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
      } catch (e) {
        return "";
      }
  }
}

export function parseStorageValue(str: string): any {
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
      } catch (e) {
        return str;
      }
    case "s":
      return s;
    default:
      return str;
  }
}

// 尝试重新链接和超时通知
export function tryConnect(
  message: MessageInternal,
  callback: (ok: boolean) => void
) {
  const ping = () => {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        resolve(false);
      }, 1000);
      message
        .syncSend("ping", null)
        .then(() => {
          clearTimeout(t);
          resolve(true);
        })
        .catch(() => {
          clearTimeout(t);
          resolve(false);
        });
    });
  };
  setInterval(async () => {
    const ok = await ping();
    if (!ok) {
      // 不ok回调并重试连接
      callback(false);
      try {
        message.reconnect();
        callback(true);
      } catch (e) {
        // ignore
        LoggerCore.getLogger({ component: "utils" }).error(
          "re connect failed",
          Logger.E(e)
        );
      }
    }
  }, 5000);
}

// 检查订阅规则是否改变,是否能够静默更新
export function checkSilenceUpdate(
  oldMeta: Metadata,
  newMeta: Metadata
): boolean {
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
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!oldConnect[key]) {
      return false;
    }
  }
  return true;
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

export function fixCoding(text: string): string {
  const toXChar = (char: string) => {
    const c = char.charCodeAt(0).toString(16);
    if (c.length <= 2) return `\\x${c.padStart(2, "0")}`;
    return `\\u${c.padStart(4, "0")}`;
  };

  return text
    .replace(/['"][\x00-\x1F]+['"]/g, (match) =>
      match.replace(/[\x00-\x1F]/g, toXChar)
    )
    .replace(/\b[a-z]{4,8}:\s*['"]\[(.)-(.)\]['"]/g, (match, start, end) =>
      match.replace(`${start}-${end}`, `${toXChar(start)}-${toXChar(end)}`)
    );
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
export function base64ToStr(base64: string): string {
  try {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => {
          return `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`;
        })
        .join("")
    );
  } catch (e) {
    LoggerCore.getInstance()
      .logger({ utils: "base64ToStr" })
      .debug("base64 to string failed", Logger.E(e));
  }
  return "";
}
*/

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
