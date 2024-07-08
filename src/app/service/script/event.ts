import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import CacheKey from "@App/pkg/utils/cache_key";
import Cache from "../../cache";
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  ScriptDAO,
} from "../../repo/scripts";
import ScriptManager, { InstallSource } from "./manager";

export type ScriptEvent =
  | "upsert"
  | "fetch"
  | "enable"
  | "disable"
  | "delete"
  | "exclude"
  | "resetExclude"
  | "resetMatch"
  | "updateCheckUpdateUrl"
  | "checkUpdate"
  | "importByUrl";

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
      this.manager.listenEvent(event, events[event].bind(this));
    });
  }

  // 安装或者更新脚本,将数据保存到数据库
  @ListenEventDecorator("upsert")
  public async upsertHandler(script: Script, upsertBy: InstallSource = "user") {
    const logger = this.logger.with({
      scriptId: script.id,
      name: script.name,
      uuid: script.uuid,
      version: script.metadata.version[0],
      upsertBy,
    });
    // 判断是否有selfMetedata
    if (script.id) {
      const oldScript = await this.dao.findById(script.id);
      if (oldScript) {
        script.selfMetadata = oldScript.selfMetadata;
      }
    }
    // 判断一些undefined的字段
    if (!script.config) {
      script.config = undefined;
    }
    return new Promise((resolve, reject) => {
      this.dao.save(script).then(
        () => {
          logger.info("script upsert success");
          ScriptManager.hook.trigger("upsert", script, upsertBy);
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
    const logger = this.logger.with({ scriptId: id });
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          if (script.status !== SCRIPT_STATUS_ENABLE) {
            script.status = SCRIPT_STATUS_ENABLE;
            script.updatetime = new Date().getTime();
            this.dao.save(script);
            logger.info("enable script");
            ScriptManager.hook.trigger("enable", script);
          }
          return resolve(1);
        })
        .catch((e) => {
          logger.error("enable error", Logger.E(e));
          reject(e);
        });
    });
  }

  @ListenEventDecorator("disable")
  public disableHandler(id: number) {
    const logger = this.logger.with({ scriptId: id });
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          if (script.status === SCRIPT_STATUS_ENABLE) {
            script.status = SCRIPT_STATUS_DISABLE;
            script.updatetime = new Date().getTime();
            this.dao.save(script);
            logger.info("disable script");
            ScriptManager.hook.trigger("disable", script);
          }
          return resolve(1);
        })
        .catch((e) => {
          logger.error("disable error", Logger.E(e));
          reject(e);
        });
    });
  }

  @ListenEventDecorator("delete")
  public deleteHandler(id: number) {
    let logger = this.logger.with({ scriptId: id });
    return new Promise((resolve, reject) => {
      this.dao.findById(id).then((script) => {
        if (!script) {
          return Promise.reject(new Error("脚本不存在"));
        }
        logger = logger.with({
          name: script.name,
          uuid: script.uuid,
          version: script.metadata.version[0],
        });
        return this.dao
          .delete(script.id)
          .then(() => {
            logger.info("script delete success");
            ScriptManager.hook.trigger("delete", script);
            return resolve(1);
          })
          .catch((e) => {
            logger.error("script delete failed", Logger.E(e));
            return reject(e);
          });
      });
    });
  }

  @ListenEventDecorator("checkUpdate")
  public checkUpdateHandler(id: number) {
    return this.manager.checkUpdate(id, "user");
  }

  @ListenEventDecorator("importByUrl")
  public importByUrlHandler(url: string) {
    return this.manager.openInstallPageByUrl(url);
  }

  @ListenEventDecorator("exclude")
  public excludeHandler({
    id,
    exclude,
    remove,
  }: {
    id: number;
    exclude: string;
    remove: boolean;
  }) {
    const logger = this.logger.with({ scriptId: id });
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          script.selfMetadata = script.selfMetadata || {};
          const excludes =
            script.selfMetadata.exclude || script.metadata.exclude || [];
          if (remove) {
            for (let i = 0; i < excludes.length; i += 1) {
              if (excludes[i] === exclude) {
                excludes.splice(i, 1);
              }
            }
          } else {
            excludes.push(exclude);
          }
          script.selfMetadata.exclude = excludes;
          this.dao.save(script).then(
            () => {
              logger.info("script exclude success");
              ScriptManager.hook.trigger("upsert", script, "system");
              resolve({ id: script.id });
            },
            (e) => {
              logger.error("script exclude failed", Logger.E(e));
              reject(e);
            }
          );
          return resolve(1);
        })
        .catch((e) => {
          logger.error("exclude error", Logger.E(e));
          reject(e);
        });
    });
  }

  @ListenEventDecorator("resetExclude")
  public resetExcludeHandler({
    id,
    exclude,
  }: {
    id: number;
    exclude: string[] | undefined;
  }) {
    const logger = this.logger.with({ scriptId: id });
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          script.selfMetadata = script.selfMetadata || {};
          if (exclude) {
            script.selfMetadata.exclude = exclude;
          } else {
            delete script.selfMetadata.exclude;
          }
          this.dao.save(script).then(
            () => {
              logger.info("script resetExclude success");
              ScriptManager.hook.trigger("upsert", script, "system");
              resolve({ id: script.id });
            },
            (e) => {
              logger.error("script resetExclude failed", Logger.E(e));
              reject(e);
            }
          );
          return resolve(1);
        })
        .catch((e) => {
          logger.error("resetMatch error", Logger.E(e));
          reject(e);
        });
    });
  }

  @ListenEventDecorator("resetMatch")
  public resetMatchHandler({
    id,
    match,
  }: {
    id: number;
    match: string[] | undefined;
  }) {
    const logger = this.logger.with({ scriptId: id });
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          script.selfMetadata = script.selfMetadata || {};
          if (match) {
            script.selfMetadata.match = match;
          } else {
            delete script.selfMetadata.match;
          }
          this.dao.save(script).then(
            () => {
              logger.info("script resetMatch success");
              ScriptManager.hook.trigger("upsert", script, "system");
              resolve({ id: script.id });
            },
            (e) => {
              logger.error("script resetMatch failed", Logger.E(e));
              reject(e);
            }
          );
          return resolve(1);
        })
        .catch((e) => {
          logger.error("resetMatch error", Logger.E(e));
          reject(e);
        });
    });
  }

  @ListenEventDecorator("updateCheckUpdateUrl")
  public updateCheckUpdateUrlHandler({ id, url }: { id: number; url: string }) {
    const logger = this.logger.with({ scriptId: id });
    return new Promise((resolve, reject) => {
      this.dao
        .findById(id)
        .then((script) => {
          if (!script) {
            return reject(new Error("脚本不存在"));
          }
          script.checkUpdateUrl = url;
          script.downloadUrl = url;
          this.dao.save(script).then(
            () => {
              logger.info("script updateCheckUpdateUrl success");
              resolve({ id: script.id });
            },
            (e) => {
              logger.error("script updateCheckUpdateUrl failed", Logger.E(e));
              reject(e);
            }
          );
          return resolve(1);
        })
        .catch((e) => {
          logger.error("updateCheckUpdateUrl error", Logger.E(e));
          reject(e);
        });
    });
  }
}
