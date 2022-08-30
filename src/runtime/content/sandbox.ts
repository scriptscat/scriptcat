import ConnectSandbox from "@App/app/connect/sandbox";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import {
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  ScriptRunResouce,
} from "@App/app/repo/scripts";
import { CronJob } from "cron";
import ExecScript from "./exec_script";

type SandboxEvent = "enable" | "disable";

type Handler = (data: any) => Promise<any>;

// 沙盒运行环境
export default class SandboxRuntime {
  connect: ConnectSandbox;

  logger: Logger;

  cronJob: Map<number, Array<CronJob>> = new Map();

  execScripts: Map<number, ExecScript> = new Map();

  constructor(con: ConnectSandbox) {
    this.connect = con;
    this.logger = LoggerCore.getInstance().logger({ component: "sandbox" });
  }

  listenEvent(event: SandboxEvent, handler: Handler) {
    this.connect.setHandler(event, (_action, data) => {
      return handler.bind(this)(data);
    });
  }

  // 开启沙盒运行环境,监听background来的请求
  start() {
    this.listenEvent("enable", this.enable);
    this.listenEvent("disable", this.disable);
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

  disable(id: number): Promise<boolean> {
    if (!this.execScripts.has(id)) {
      return Promise.resolve(false);
    }
    // 停止脚本运行,主要是停止定时器
    // 后续考虑停止正在运行的脚本的方法
    // 现期对于正在运行的脚本仅仅是在background中判断是否运行
    // 未运行的脚本不处理GMApi的请求
    const list = this.cronJob.get(id);
    if (list) {
      list.forEach((val) => {
        val.stop();
      });
      this.cronJob.delete(id);
    }
    return Promise.resolve(true);
  }

  backgroundScript(script: ScriptRunResouce) {
    const exec = new ExecScript(script);
    this.execScripts.set(script.id, exec);
    return exec.exec();
  }

  crontabScript(script: ScriptRunResouce) {
    // 执行定时脚本 运行表达式
    if (!script.metadata.crontab) {
      throw new Error("错误的crontab表达式");
    }
    let flag = false;
    const exec = new ExecScript(script);
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
        const cron = new CronJob(
          crontab,
          this.crontabExec(script, oncePos, exec)
        );
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
      this.execScripts.set(script.id, exec);
      this.cronJob.set(script.id, cronJobList);
    }
    return Promise.resolve(!flag);
  }

  crontabExec(script: ScriptRunResouce, oncePos: number, exec: ExecScript) {
    if (oncePos) {
      return () => {
        // 没有最后一次执行时间表示之前都没执行过,直接执行
        if (!script.lastruntime) {
          exec.exec();
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
