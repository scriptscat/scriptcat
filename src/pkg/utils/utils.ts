import Logger from "@App/app/logger/logger";
import { Metadata, Script } from "@App/app/repo/scripts";
import { CronTime } from "cron";
import crypto from "crypto-js";
import dayjs from "dayjs";
import semver from "semver";

export function nextTime(crontab: string): string {
  let oncePos = 0;
  if (crontab.indexOf("once") !== -1) {
    const vals = crontab.split(" ");
    vals.forEach((val, index) => {
      if (val === "once") {
        oncePos = index;
      }
    });
    if (vals.length === 5) {
      oncePos += 1;
    }
  }
  let cron: CronTime;
  try {
    cron = new CronTime(crontab.replace(/once/g, "*"));
  } catch {
    throw new Error("错误的定时表达式");
  }
  if (oncePos) {
    switch (oncePos) {
      case 1: // 每分钟
        return cron.sendAt().toFormat("yyyy-MM-dd HH:mm 每分钟运行一次");
      case 2: // 每小时
        return cron.sendAt().plus({ hour: 1 }).toFormat("yyyy-MM-dd HH 每小时运行一次");
      case 3: // 每天
        return cron.sendAt().plus({ day: 1 }).toFormat("yyyy-MM-dd 每天运行一次");
      case 4: // 每月
        return cron.sendAt().plus({ month: 1 }).toFormat("yyyy-MM 每月运行一次");
      case 5: // 每星期
        return cron.sendAt().plus({ week: 1 }).toFormat("yyyy-MM-dd 每星期运行一次");
    }
    throw new Error("错误表达式");
  }
  return cron.sendAt().toFormat("yyyy-MM-dd HH:mm:ss");
}

export function formatTime(time: Date) {
  return dayjs(time).format("YYYY-MM-DD HH:mm:ss");
}

export function formatUnixTime(time: number) {
  return dayjs.unix(time).format("YYYY-MM-DD HH:mm:ss");
}

export function semTime(time: Date) {
  return dayjs().to(dayjs(time));
}

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

export function isFirefox() {
  if (navigator.userAgent.indexOf("Firefox") >= 0) {
    return true;
  }
  return false;
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

// 对比版本大小
export function ltever(newVersion: string, oldVersion: string, logger?: Logger) {
  // 先验证符不符合语义化版本规范
  try {
    return semver.lte(newVersion, oldVersion);
  } catch (e) {
    logger?.warn("does not conform to the Semantic Versioning specification", Logger.E(e));
  }
  const newVer = newVersion.split(".");
  const oldVer = oldVersion.split(".");
  for (let i = 0; i < newVer.length; i += 1) {
    if (Number(newVer[i]) > Number(oldVer[i])) {
      return false;
    }
    if (Number(newVer[i]) < Number(oldVer[i])) {
      return true;
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
  for (let i = 0; i < keys.length; i += 1) {
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

export function calculateMd5(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.onloadend = () => {
      if (!reader.result) {
        reject(new Error("result is null"));
      } else {
        const wordArray = crypto.lib.WordArray.create(<ArrayBuffer>reader.result);
        resolve(crypto.MD5(wordArray).toString());
      }
    };
  });
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
    // Property access which throws if developer mode is not enabled.
    chrome.userScripts;
    return true;
  } catch {
    // Not available.
    return false;
  }
}
