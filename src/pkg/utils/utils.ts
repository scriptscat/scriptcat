import { Logger } from "@App/app/logger/logger";
import { Metadata, Script } from "@App/app/repo/scripts";
import { CronTime } from "cron";
import crypto from "crypto-js";
import dayjs from "dayjs";
import semver from "semver";

import { formatTime, formatUnixTime, randomString, dealSymbol, dealScript } from "./utils2";
import { isFirefox, isEdge, isDebug, sleep, errorMsg, isUserScriptsAvailable, getBrowserVersion } from "./utils2";
import { valueType, toStorageValueStr, parseStorageValue } from "./utils2";
import { InfoNotification, openInCurrentTab } from "./utils2";
export { formatTime, formatUnixTime, randomString, dealSymbol, dealScript }
export { isFirefox, isEdge, isDebug, sleep, errorMsg, isUserScriptsAvailable, getBrowserVersion }
export { valueType, toStorageValueStr, parseStorageValue }
export { InfoNotification, openInCurrentTab }

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
      oncePos++;
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

export function semTime(time: Date) {
  return dayjs().to(dayjs(time));
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
  for (let i = 0; i < newVer.length; i++) {
    if (Number(newVer[i]) > Number(oldVer[i])) {
      return false;
    }
    if (Number(newVer[i]) < Number(oldVer[i])) {
      return true;
    }
  }
  return true;
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
  if (typeof globalThis.crypto !== 'undefined') {
    const crypto = globalThis.crypto;
    return blob.arrayBuffer()
      .then(arrayBuffer => crypto.subtle.digest('MD5', arrayBuffer))
      .then(hashBuffer => {
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }); // any error should be handled upstream
  }
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

