import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { ScriptRunResource } from "@App/app/repo/scripts";
import {
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_RUN_STATUS_ERROR,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
} from "@App/app/repo/scripts";
import type { Server } from "@Packages/message/server";
import type { WindowMessage } from "@Packages/message/window_message";
import { CronJob } from "cron";
import { proxyUpdateRunStatus } from "../offscreen/client";
import { BgExecScriptWarp } from "../content/exec_warp";
import type ExecScript from "../content/exec_script";
import type { ValueUpdateDataEncoded } from "../content/types";
import { getStorageName, getMetadataStr, getUserConfigStr, getISOWeek } from "@App/pkg/utils/utils";
import type { EmitEventRequest, ScriptLoadInfo } from "../service_worker/types";
import { CATRetryError } from "../content/exec_warp";
import { parseUserConfig } from "@App/pkg/utils/yaml";
import { decodeRValue } from "@App/pkg/utils/message_value";
import { extraCronExpr } from "@App/pkg/utils/cron";

export class Runtime {
  cronJob: Map<string, Array<CronJob>> = new Map();

  execScripts: Map<string, ExecScript> = new Map();

  logger: Logger;

  retryList: {
    script: ScriptLoadInfo;
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
      for (const script of retryList) {
        script.nextruntime = 0;
        this.execScript(script);
      }
    }, 5000);
  }

  joinRetryList(script: ScriptLoadInfo) {
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

  async enableScript(script: ScriptRunResource) {
    // 开启脚本
    // 如果正在运行,先释放
    if (this.execScripts.has(script.uuid)) {
      await this.disableScript(script.uuid);
    }
    const metadataStr = getMetadataStr(script.code) || "";
    const userConfigStr = getUserConfigStr(script.code) || "";
    const userConfig = parseUserConfig(userConfigStr);
    const loadScript = {
      ...script,
      metadataStr,
      userConfigStr,
      userConfig,
    } as ScriptLoadInfo;
    if (script.type === SCRIPT_TYPE_BACKGROUND) {
      // 后台脚本直接运行起来
      return this.execScript(loadScript);
    } else {
      // 定时脚本加入定时任务
      this.stopCronJob(script.uuid);
      return this.crontabScript(loadScript);
    }
  }

  async disableScript(uuid: string) {
    // 关闭脚本
    // 停止定时任务
    // 检查是否有定时器
    if (this.cronJob.has(uuid)) {
      this.stopCronJob(uuid);
    }
    // 移除重试队列
    this.removeRetryList(uuid);
    if (!this.execScripts.has(uuid)) {
      // 没有在运行
      return false;
    }
    // 停止脚本运行
    return await this.stopScript(uuid);
  }

  // 执行脚本
  async execScript(script: ScriptLoadInfo, execOnce?: boolean) {
    const logger = this.logger.with({ uuid: script.uuid, name: script.name });
    if (this.execScripts.has(script.uuid)) {
      // 释放掉资源
      // 暂未实现执行完成后立马释放,会在下一次执行时释放
      await this.stopScript(script.uuid);
    }
    const exec = new BgExecScriptWarp(script, this.windowMessage);
    this.execScripts.set(script.uuid, exec);
    proxyUpdateRunStatus(this.windowMessage, { uuid: script.uuid, runStatus: SCRIPT_RUN_STATUS_RUNNING });
    // 修改掉脚本掉最后运行时间, 数据库也需要修改
    script.lastruntime = Date.now();
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

  private crontabSripts: ScriptRunResource[] = [];

  crontabScript(script: ScriptLoadInfo) {
    // 执行定时脚本 运行表达式
    if (!script.metadata.crontab) {
      throw new Error(script.name + " - 错误的crontab表达式");
    }
    // 如果有nextruntime,则加入重试队列
    this.joinRetryList(script);
    this.crontabSripts.push(script);
    let flag = false;
    const cronJobList: Array<CronJob> = [];
    script.metadata.crontab.forEach((val) => {
      const { cronExpr, oncePos } = extraCronExpr(val);
      try {
        const cron = new CronJob(cronExpr, this.crontabExec(script, oncePos));
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
      for (const crontab of cronJobList) {
        crontab.stop();
      }
    } else {
      this.cronJob.set(script.uuid, cronJobList);
    }
    return !flag;
  }

  crontabExec(script: ScriptLoadInfo, oncePos: number) {
    if (oncePos >= 1) {
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
            flag = getISOWeek(last) !== getISOWeek(now);
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

  // 停止计时器
  stopCronJob(uuid: string) {
    const list = this.cronJob.get(uuid);
    if (list) {
      for (const val of list) {
        val.stop();
      }
      this.cronJob.delete(uuid);
    }
    this.crontabSripts = this.crontabSripts.filter((val) => val.uuid !== uuid);
  }

  async stopScript(uuid: string) {
    const exec = this.execScripts.get(uuid);
    if (!exec) {
      proxyUpdateRunStatus(this.windowMessage, { uuid: uuid, runStatus: SCRIPT_RUN_STATUS_COMPLETE });
      return false;
    }
    exec.stop();
    this.execScripts.delete(uuid);
    proxyUpdateRunStatus(this.windowMessage, { uuid: uuid, runStatus: SCRIPT_RUN_STATUS_COMPLETE });
    return true;
  }

  async runScript(script: ScriptRunResource) {
    const exec = this.execScripts.get(script.uuid);
    // 如果正在运行,先释放
    if (exec) {
      await this.stopScript(script.uuid);
    }
    const metadataStr = getMetadataStr(script.code) || "";
    const userConfigStr = getUserConfigStr(script.code) || "";
    const userConfig = parseUserConfig(userConfigStr);
    const loadScript = {
      ...script,
      metadataStr,
      userConfigStr,
      userConfig,
    } as ScriptLoadInfo;
    return this.execScript(loadScript, true);
  }

  valueUpdate(data: ValueUpdateDataEncoded) {
    const dataEntries = data.entries;
    // 转发给脚本
    this.execScripts.forEach((val) => {
      if (val.scriptRes.uuid === data.uuid || getStorageName(val.scriptRes) === data.storageName) {
        val.valueUpdate(data);
      }
    });
    // 更新crontabScripts中的脚本值
    for (const script of this.crontabSripts) {
      if (script.uuid === data.uuid || getStorageName(script) === data.storageName) {
        for (const [key, rTyped1, _rTyped2] of dataEntries) {
          const value = decodeRValue(rTyped1);
          script.value[key] = value;
        }
      }
    }
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
