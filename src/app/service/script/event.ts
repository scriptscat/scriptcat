import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import CacheKey from "@App/utils/cache_key";
import Cache from "../../cache";
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  ScriptDAO,
} from "../../repo/scripts";
import ScriptManager from "./manager";

export type ScriptEvent = "upsert" | "fetch" | "enable" | "disable";

const events: { [key: string]: (data: any) => Promise<any> } = {};

function ListenEventDecorator(event: ScriptEvent) {
  return (target: any, propertyName: string) => {
    events[event] = target[propertyName];
  };
}

// 事件监听处理
export default class ScriptEventListener {
  logger: Logger;

  manager: ScriptManager;

  dao: ScriptDAO;

  cache: Cache;

  constructor(manager: ScriptManager, dao: ScriptDAO) {
    this.manager = manager;
    this.dao = dao;
    this.cache = Cache.getInstance();
    this.logger = LoggerCore.getInstance().logger({ component: "script" });
    Object.keys(events).forEach((event) => {
      this.manager.listenEvent(`script-${event}`, events[event].bind(this));
    });
  }

  // 安装或者更新脚本,将数据保存到数据库
  @ListenEventDecorator("upsert")
  public upsertHandler(script: Script) {
    return new Promise((resolve, reject) => {
      const logger = this.logger.with({
        id: script.id,
        name: script.name,
        uuid: script.uuid,
        version: script.metadata.version[0],
      });

      this.dao.save(script).then(
        () => {
          logger.info("脚本安装成功");
          ScriptManager.hook.dispatchHook("upsert", script);
          resolve({ id: script.id });
        },
        (e) => {
          logger.error("脚本安装失败", Logger.E(e));
          reject(e);
        }
      );
    });
  }

  @ListenEventDecorator("fetch")
  public fetchInfoHandler(uuid: string) {
    return new Promise((resolve) => {
      resolve(this.cache.get(CacheKey.scriptInfo(uuid)));
    });
  }

  @ListenEventDecorator("enable")
  public enableHandler(id: number) {
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          if (script.status !== SCRIPT_STATUS_ENABLE) {
            script.status = SCRIPT_STATUS_ENABLE;
            this.dao.save(script);
            ScriptManager.hook.dispatchHook("enable", script);
          }
          return resolve(1);
        })
        .catch((e) => {
          this.logger.error("enable error", Logger.E(e));
          reject(e);
        });
    });
  }

  @ListenEventDecorator("disable")
  public disableHandler(id: number) {
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          if (script.status === SCRIPT_STATUS_ENABLE) {
            script.status = SCRIPT_STATUS_DISABLE;
            this.dao.save(script);
            ScriptManager.hook.dispatchHook("disable", script);
          }
          return resolve(1);
        })
        .catch((e) => {
          this.logger.error("disable error", Logger.E(e));
          reject(e);
        });
    });
  }
}
