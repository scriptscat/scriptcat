import MessageSandbox from "@App/app/message/sandbox";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import {
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_RUN_STATUS_ERROR,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  ScriptRunResouce,
} from "@App/app/repo/scripts";
import { CronJob } from "cron";
import IoC from "@App/app/ioc";
import ExecScript from "./exec_script";
import { BgExecScriptWarp, CATRetryError } from "./exec_warp";

type SandboxEvent = "enable" | "disable" | "start" | "stop";

type Handler = (data: any) => Promise<any>;

// 沙盒运行环境, 后台脚本与定时脚本的运行环境
@IoC.Singleton(MessageSandbox)
export default class SandboxRuntime {
  message: MessageSandbox;

  logger: Logger;

  cronJob: Map<number, Array<CronJob>> = new Map();

  execScripts: Map<number, ExecScript> = new Map();

  retryList: {
    script: ScriptRunResouce;
    retryTime: number;
  }[] = [];

  constructor(message: MessageSandbox) {
    this.message = message;
    this.logger = LoggerCore.getInstance().logger({ component: "sandbox" });
    // 重试队列,5s检查一次
    setInterval(() => {
      if (!this.retryList.length) {
        return;
      }
      const now = Date.now();
      const retryList = [];
      for (let i = 0; i < this.retryList.length; i += 1) {
        const item = this.retryList[i];
        if (item.retryTime < now) {
          this.retryList.splice(i, 1);
          i -= 1;
          retryList.push(item.script);
        }
      }
      retryList.forEach((script) => {
        script.nextruntime = 0;
        this.execScript(script);
      });
    }, 5000);
  }

  joinRetryList(script: ScriptRunResouce) {
    if (script.nextruntime) {
      this.retryList.push({
        script,
        retryTime: script.nextruntime,
      });
      this.retryList.sort((a, b) => a.retryTime - b.retryTime);
    }
  }

  removeRetryList(scriptId: number) {
    for (let i = 0; i < this.retryList.length; i += 1) {
      if (this.retryList[i].script.id === scriptId) {
        this.retryList.splice(i, 1);
        i -= 1;
      }
    }
  }

  listenEvent(event: SandboxEvent, handler: Handler) {
    this.message.setHandler(event, (_action, data) => {
      return handler.bind(this)(data);
    });
  }

  // 开启沙盒运行环境,监听background来的请求
  init() {
    this.listenEvent("enable", this.enable);
    this.listenEvent("disable", this.disable);
    this.listenEvent("start", this.start);
    this.listenEvent("stop", this.stop);
    // 监听值更新
    this.message.setHandler("valueUpdate", (action, data) => {
      this.execScripts.forEach((val) => {
        val.valueUpdate(data);
      });
    });
  }

  // 直接运行脚本
  start(script: ScriptRunResouce): Promise<boolean> {
    return this.execScript(script, true);
  }

  stop(scriptId: number): Promise<boolean> {
    const exec = this.execScripts.get(scriptId);
    if (!exec) {
      this.message.send("scriptRunStatus", [
        scriptId,
        SCRIPT_RUN_STATUS_COMPLETE,
      ]);
      return Promise.resolve(false);
    }
    this.execStop(exec);
    return Promise.resolve(true);
  }

  enable(script: ScriptRunResouce): Promise<boolean> {
    // 如果正在运行,先释放
    if (this.execScripts.has(script.id)) {
      this.disable(script.id);
    }
    // 开启脚本在沙盒环境中运行
    switch (script.type) {
      case SCRIPT_TYPE_CRONTAB:
        // 定时脚本
        this.stopCronJob(script.id);
        return this.crontabScript(script);
      case SCRIPT_TYPE_BACKGROUND:
        // 后台脚本, 直接执行脚本
        return this.execScript(script);
      default:
        throw new Error("不支持的脚本类型");
    }
  }

  disable(id: number): Promise<boolean> {
    // 停止脚本运行,主要是停止定时器
    // 后续考虑停止正在运行的脚本的方法
    // 现期对于正在运行的脚本仅仅是在background中判断是否运行
    // 未运行的脚本不处理GMApi的请求
    this.stopCronJob(id);
    // 移除重试队列
    this.removeRetryList(id);
    return this.stop(id);
  }

  // 停止计时器
  stopCronJob(id: number) {
    const list = this.cronJob.get(id);
    if (list) {
      list.forEach((val) => {
        val.stop();
      });
      this.cronJob.delete(id);
    }
  }

  // 执行脚本
  execScript(script: ScriptRunResouce, execOnce?: boolean) {
    const logger = this.logger.with({ scriptId: script.id, name: script.name });
    if (this.execScripts.has(script.id)) {
      // 释放掉资源
      // 暂未实现执行完成后立马释放,会在下一次执行时释放
      this.stop(script.id);
    }
    const exec = new BgExecScriptWarp(script, this.message);
    this.execScripts.set(script.id, exec);
    this.message.send("scriptRunStatus", [
      exec.scriptRes.id,
      SCRIPT_RUN_STATUS_RUNNING,
    ]);
    // 修改掉脚本掉最后运行时间, 数据库也需要修改
    script.lastruntime = new Date().getTime();
    const ret = exec.exec();
    if (ret instanceof Promise) {
      ret
        .then((resp) => {
          // 发送执行完成消息
          this.message.send("scriptRunStatus", [
            exec.scriptRes.id,
            SCRIPT_RUN_STATUS_COMPLETE,
          ]);
          logger.info("exec script complete", {
            value: resp,
          });
        })
        .catch((err) => {
          // 发送执行完成+错误消息
          let errMsg;
          let nextruntime = 0;
          if (err instanceof CATRetryError) {
            errMsg = { error: err.msg };
            if (!execOnce) {
              // 下一次执行时间
              nextruntime = err.time.getTime();
              script.nextruntime = nextruntime;
              this.joinRetryList(script);
            }
          } else {
            errMsg = Logger.E(err);
          }
          logger.error("exec script error", errMsg);
          this.message.send("scriptRunStatus", [
            exec.scriptRes.id,
            SCRIPT_RUN_STATUS_ERROR,
            errMsg,
            nextruntime,
          ]);
          // 错误还是抛出,方便排查
          throw err;
        });
    } else {
      logger.warn("backscript return not promise");
    }
    return ret;
  }

  crontabScript(script: ScriptRunResouce) {
    // 执行定时脚本 运行表达式
    if (!script.metadata.crontab) {
      throw new Error("错误的crontab表达式");
    }
    // 如果有nextruntime,则加入重试队列
    this.joinRetryList(script);
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
        cron.start();
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
            flag = this.getWeek(last) !== this.getWeek(now);
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

  execStop(exec: ExecScript) {
    exec.stop();
    this.execScripts.delete(exec.scriptRes.id);
    this.message.send("scriptRunStatus", [
      exec.scriptRes.id,
      SCRIPT_RUN_STATUS_COMPLETE,
    ]);
  }

  // 获取本周是第几周
  getWeek(date: Date) {
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
