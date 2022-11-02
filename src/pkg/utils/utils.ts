/* eslint-disable import/prefer-default-export */
/* eslint-disable default-case */
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import MessageInternal from "@App/app/message/internal";
import { CronTime } from "cron";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.locale("zh-cn");
dayjs.extend(relativeTime);

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
  } catch (e) {
    throw new Error("错误的定时表达式");
  }
  if (oncePos) {
    switch (oncePos) {
      case 1: // 每分钟
        return cron.sendAt().toFormat("yyyy-MM-dd HH:mm 每分钟运行一次");
      case 2: // 每小时
        return cron
          .sendAt()
          .plus({ hour: 1 })
          .toFormat("yyyy-MM-dd HH 每小时运行一次");
      case 3: // 每天
        return cron
          .sendAt()
          .plus({ day: 1 })
          .toFormat("yyyy-MM-dd 每天运行一次");
      case 4: // 每月
        return cron
          .sendAt()
          .plus({ month: 1 })
          .toFormat("yyyy-MM 每月运行一次");
      case 5: // 每星期
        return cron
          .sendAt()
          .plus({ week: 1 })
          .toFormat("yyyy-MM-dd 每星期运行一次");
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
