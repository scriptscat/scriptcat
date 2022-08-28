import ConnectSandbox from "@App/app/connect/sandbox";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import {
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  ScriptRunResouce,
} from "@App/app/repo/scripts";
import { CronJob, CronTime } from "cron";

type SandboxEvent = "enable" | "disable";

type Handler = (data: any) => Promise<any>;

// 沙盒运行环境
export default class SandboxRuntime {
  connect: ConnectSandbox;

  logger: Logger;

  cronJob: Map<number, Array<CronJob>> = new Map();

  runningScript: Map<number, boolean> = new Map();

  constructor(con: ConnectSandbox) {
    this.connect = con;
    this.logger = LoggerCore.getInstance().logger({ script: "sandbox" });
  }

  listenEvent(event: SandboxEvent, handler: Handler) {
    this.connect.setHandler(event, (_action, data) => {
      return handler.bind(this)(data);
    });
  }

  // 开启沙盒运行环境,监听background来的请求
  start() {
    this.listenEvent("enable", this.enable);
  }

  enable(script: ScriptRunResouce): Promise<boolean> {
    // 开启脚本在沙盒环境中运行
    switch (script.type) {
      case SCRIPT_TYPE_CRONTAB:
        // 定时脚本
        return this.crontabScript(script);
      case SCRIPT_TYPE_BACKGROUND:
        // 后台脚本
        return this.backgroundScript(script);
      default:
        throw new Error("不支持的脚本类型");
    }
  }

  backgroundScript(script: ScriptRunResouce) {
    this.runningScript.set(script.id, true);
    return this.execScript(script);
  }

  execScript(script: ScriptRunResouce) {}

  crontabScript(script: ScriptRunResouce) {
    // 执行定时脚本 运行表达式
    if (!script.metadata.crontab) {
      throw new Error("错误的crontab表达式");
    }
    let flag = false;
    const cronJobList: Array<CronJob> = [];
    script.metadata.crontab.forEach((val) => {
      let oncePos = 0;
      let crontab = val;
      if (crontab.indexOf("once") !== -1) {
        const vals = crontab.split(" ");
        vals.forEach((item, index) => {
          if (item === "once") {
            oncePos = index;
          }
        });
        if (vals.length === 5) {
          oncePos += 1;
        }
        crontab = crontab.replace(/once/g, "*");
      }
      try {
        const cron = new CronJob(crontab, this.crontabExec(script, oncePos));
        cronJobList.push(cron);
      } catch (e) {
        flag = true;
        this.logger.error("create cronjob failed", {
          script: script.id,
          crontab: val,
        });
      }
    });
    if (cronJobList.length !== script.metadata.crontab.length) {
      // 有表达式失败了
      cronJobList.forEach((crontab) => {
        crontab.stop();
      });
    } else {
      this.runningScript.set(script.id, true);
      this.cronJob.set(script.id, cronJobList);
    }
    return Promise.resolve(!flag);
  }

  crontabExec(script: ScriptRunResouce, oncePos: number) {
    if (oncePos) {
      return () => {
        // 没有最后一次执行时间表示之前都没执行过,直接执行
        if (!script.lastruntime) {
          this.execScript(script);
          return;
        }
        const now = new Date();
        const last = new Date(script.lastruntime);
        let flag = false;
        // 根据once所在的位置去判断执行
        switch (oncePos) {
          case 1: // 每分钟
            flag = last.getMinutes() !== now.getMinutes();
            break;
          case 2: // 每小时
            flag = last.getHours() !== now.getHours();
            break;
          case 3: // 每天
            flag = last.getDay() !== now.getDay();
            break;
          case 4: // 每月
            flag = last.getMonth() !== now.getMonth();
            break;
          case 5: // 每周
            flag = SandboxRuntime.getWeek(last) !== SandboxRuntime.getWeek(now);
            break;
          default:
        }
        if (flag) {
          this.execScript(script);
        }
      };
    }
    return () => {
      this.execScript(script);
    };
  }

  // 获取本周是第几周
  static getWeek(date: Date) {
    const nowDate = new Date(date);
    const firstDay = new Date(date);
    firstDay.setMonth(0); // 设置1月
    firstDay.setDate(1); // 设置1号
    const diffDays = Math.ceil(
      (nowDate.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000)
    );
    const week = Math.ceil(diffDays / 7);
    return week === 0 ? 1 : week;
  }
}
