import { CronTime } from "cron";

export function nextTime(crontab: string): string {
  let oncePos = 0;
  if (crontab.includes("once")) {
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