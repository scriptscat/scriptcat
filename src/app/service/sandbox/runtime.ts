import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import {
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_RUN_STATUS_ERROR,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  ScriptRunResouce,
} from "@App/app/repo/scripts";
import { Server } from "@Packages/message/server";
import { WindowMessage } from "@Packages/message/window_message";
import { CronJob } from "cron";
import { proxyUpdateRunStatus } from "../offscreen/client";
import { BgExecScriptWarp } from "../content/exec_warp";
import ExecScript, { ValueUpdateData } from "../content/exec_script";
import { getStorageName } from "@App/pkg/utils/utils";
import { EmitEventRequest } from "../service_worker/runtime";

export class Runtime {
  cronJob: Map<string, Array<CronJob>> = new Map();

  execScripts: Map<string, ExecScript> = new Map();

  logger: Logger;

  retryList: {
    script: ScriptRunResouce;
    retryTime: number;
  }[] = [];

  constructor(
    private windowMessage: WindowMessage,
    private api: Server
  ) {
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

  removeRetryList(uuid: string) {
    for (let i = 0; i < this.retryList.length; i += 1) {
      if (this.retryList[i].script.uuid === uuid) {
        this.retryList.splice(i, 1);
        i -= 1;
      }
    }
  }

  async enableScript(script: ScriptRunResouce) {
    // 开启脚本
    // 如果正在运行,先释放
    if (this.execScripts.has(script.uuid)) {
      await this.disableScript(script.uuid);
    }
    if (script.type === SCRIPT_TYPE_BACKGROUND) {
      // 后台脚本直接运行起来
      return this.execScript(script);
    } else {
      // 定时脚本加入定时任务
      await this.stopCronJob(script.uuid);
      return this.crontabScript(script);
    }
  }

  disableScript(uuid: string) {
    // 关闭脚本
    // 停止定时任务
    this.stopCronJob(uuid);
    // 移除重试队列
    this.removeRetryList(uuid);
    // 发送运行状态变更
    proxyUpdateRunStatus(this.windowMessage, { uuid, runStatus: SCRIPT_RUN_STATUS_COMPLETE });
    // 停止脚本运行
    return this.stopScript(uuid);
  }

  // 执行脚本
  async execScript(script: ScriptRunResouce, execOnce?: boolean) {
    const logger = this.logger.with({ script: script.uuid, name: script.name });
    if (this.execScripts.has(script.uuid)) {
      // 释放掉资源
      // 暂未实现执行完成后立马释放,会在下一次执行时释放
      await this.stopScript(script.uuid);
    }
    const exec = new BgExecScriptWarp(script, this.windowMessage);
    this.execScripts.set(script.uuid, exec);
    proxyUpdateRunStatus(this.windowMessage, { uuid: script.uuid, runStatus: SCRIPT_RUN_STATUS_RUNNING });
    // 修改掉脚本掉最后运行时间, 数据库也需要修改
    script.lastruntime = new Date().getTime();
    const ret = exec.exec();
    if (ret instanceof Promise) {
      ret
        .then((resp) => {
          // 发送执行完成消息
          proxyUpdateRunStatus(this.windowMessage, { uuid: script.uuid, runStatus: SCRIPT_RUN_STATUS_COMPLETE });
          logger.info("exec script complete", {
            value: resp,
          });
        })
        .catch((err) => {
          // 发送执行完成+错误消息
          let errMsg;
          let nextruntime = 0;
          if (err instanceof CATRetryError) {
            // @ts-ignore
            errMsg = { error: err.msg };
            if (!execOnce) {
              // 下一次执行时间
              // @ts-ignore
              nextruntime = err.time.getTime();
              script.nextruntime = nextruntime;
              this.joinRetryList(script);
            }
          } else {
            errMsg = Logger.E(err);
          }
          logger.error("exec script error", errMsg);
          proxyUpdateRunStatus(this.windowMessage, {
            uuid: script.uuid,
            runStatus: SCRIPT_RUN_STATUS_ERROR,
            error: errMsg,
            nextruntime,
          });
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
      throw new Error(script.name + " - 错误的crontab表达式");
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
        this.logger.error(
          "create cronjob failed",
          {
            uuid: script.uuid,
            crontab: val,
          },
          Logger.E(e)
        );
      }
    });
    if (cronJobList.length !== script.metadata.crontab.length) {
      // 有表达式失败了
      cronJobList.forEach((crontab) => {
        crontab.stop();
      });
    } else {
      this.cronJob.set(script.uuid, cronJobList);
    }
    return !flag;
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

  // 获取本周是第几周
  getWeek(date: Date) {
    const nowDate = new Date(date);
    const firstDay = new Date(date);
    firstDay.setMonth(0); // 设置1月
    firstDay.setDate(1); // 设置1号
    const diffDays = Math.ceil((nowDate.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
    const week = Math.ceil(diffDays / 7);
    return week === 0 ? 1 : week;
  }

  // 停止计时器
  stopCronJob(uuid: string) {
    const list = this.cronJob.get(uuid);
    if (list) {
      list.forEach((val) => {
        val.stop();
      });
      this.cronJob.delete(uuid);
    }
  }

  async stopScript(uuid: string) {
    const exec = this.execScripts.get(uuid);
    if (!exec) {
      proxyUpdateRunStatus(this.windowMessage, { uuid: uuid, runStatus: SCRIPT_RUN_STATUS_COMPLETE });
      return Promise.resolve(false);
    }
    exec.stop();
    this.execScripts.delete(uuid);
    proxyUpdateRunStatus(this.windowMessage, { uuid: uuid, runStatus: SCRIPT_RUN_STATUS_COMPLETE });
    return Promise.resolve(true);
  }

  async runScript(script: ScriptRunResouce) {
    const exec = this.execScripts.get(script.uuid);
    // 如果正在运行,先释放
    if (exec) {
      await this.stopScript(script.uuid);
    }
    return this.execScript(script, true);
  }

  valueUpdate(data: ValueUpdateData) {
    // 转发给脚本
    this.execScripts.forEach((val) => {
      if (val.scriptRes.uuid === data.uuid || getStorageName(val.scriptRes) === data.storageName) {
        val.valueUpdate(data);
      }
    });
  }

  emitEvent(data: EmitEventRequest) {
    // 转发给脚本
    const exec = this.execScripts.get(data.uuid);
    if (exec) {
      exec.emitEvent(data.event, data.eventId, data.data);
    }
  }

  init() {
    this.api.on("enableScript", this.enableScript.bind(this));
    this.api.on("disableScript", this.disableScript.bind(this));
    this.api.on("runScript", this.runScript.bind(this));
    this.api.on("stopScript", this.stopScript.bind(this));

    this.api.on("runtime/valueUpdate", this.valueUpdate.bind(this));
    this.api.on("runtime/emitEvent", this.emitEvent.bind(this));
  }
}
