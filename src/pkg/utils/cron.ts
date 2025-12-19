import { CronTime } from "cron";
import dayjs from "dayjs";

// 计算下次执行时间，支持 once 关键字表示每分钟/每小时/每天/每月/每星期执行一次
export function nextTime(crontab: string, date?: Date): string {
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
  let datetime = dayjs(date || new Date());
  if (oncePos === 2) {
    datetime = datetime.set("minute", 0).subtract(1, "minute").set("second", 0);
  }
  const nextdate = cron.getNextDateFrom(datetime.toDate());
  if (oncePos) {
    switch (oncePos) {
      case 1: // 每分钟
        return nextdate.toFormat("yyyy-MM-dd HH:mm:ss 每分钟运行一次");
      case 2: // 每小时
        return nextdate.plus({ hour: 1 }).toFormat("yyyy-MM-dd HH:mm:ss 每小时运行一次");
      case 3: // 每天
        return nextdate.plus({ day: 1 }).toFormat("yyyy-MM-dd 每天运行一次");
      case 4: // 每月
        return nextdate.plus({ month: 1 }).toFormat("yyyy-MM 每月运行一次");
      case 5: // 每星期
        return nextdate.plus({ week: 1 }).toFormat("yyyy-MM-dd 每星期运行一次");
    }
    throw new Error("错误表达式");
  }
  return nextdate.toFormat("yyyy-MM-dd HH:mm:ss");
}
