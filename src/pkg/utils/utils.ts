import { Logger } from "@App/app/logger/logger";
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

