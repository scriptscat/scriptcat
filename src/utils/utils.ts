/* eslint-disable import/prefer-default-export */
/* eslint-disable default-case */
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
    return "错误的定时表达式";
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
    return "错误表达式";
  }
  return cron.sendAt().toFormat("yyyy-MM-dd HH:mm:ss");
}

export function formatTime(time: Date) {
  return dayjs(time).format("YYYY-MM-DD HH:mm:ss");
}

export function semTime(time: Date) {
  return dayjs().to(dayjs(time));
}
