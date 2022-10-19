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

export type ScriptEvent =
  | "upsert"
  | "fetch"
  | "enable"
  | "disable"
  | "delete"
  | "checkUpdate";

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
        scriptId: script.id,
        name: script.name,
        uuid: script.uuid,
        version: script.metadata.version[0],
      });

      this.dao.save(script).then(
        () => {
          logger.info("script upsert success");
          ScriptManager.hook.trigger("upsert", script);
          resolve({ id: script.id });
        },
        (e) => {
          logger.error("script upsert failed", Logger.E(e));
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
            ScriptManager.hook.trigger("enable", script);
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
            ScriptManager.hook.trigger("disable", script);
          }
          return resolve(1);
        })
        .catch((e) => {
          this.logger.error("disable error", Logger.E(e));
          reject(e);
        });
    });
  }

  @ListenEventDecorator("delete")
  public deleteHandler(id: number) {
    return this.dao.findById(id).then((script) => {
      if (!script) {
        return Promise.reject(new Error("脚本不存在"));
      }
      const logger = this.logger.with({
        scriptId: id,
        name: script.name,
        uuid: script.uuid,
        version: script.metadata.version[0],
      });
      return this.dao
        .delete(script.id)
        .then(() => {
          logger.info("script delete success");
          ScriptManager.hook.trigger("delete", script);
          return Promise.resolve(1);
        })
        .catch((e) => {
          logger.error("script delete failed", Logger.E(e));
          return Promise.reject(e);
        });
    });
  }

  @ListenEventDecorator("checkUpdate")
  public checkUpdateHandler(id: number) {
    return this.manager.checkUpdate(id, "user");
  }
}
