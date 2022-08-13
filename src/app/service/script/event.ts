import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import Cache from "../../cache";
import { ScriptDAO, Script } from "../../repo/scripts";
import Hook from "../hook";
import ScriptManager from "./manager";

export type ScriptEvent = "upsert" | "fetch";

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
    this.logger = LoggerCore.getInstance().logger({ manager: "script" });
    Object.keys(events).forEach((event) => {
      this.manager.listenEvent(`script-${event}`, events[event].bind(this));
    });
  }

  // 安装或者更新脚本,将数据保存到数据库
  @ListenEventDecorator("upsert")
  public upsertHandler(script: Script) {
    return new Promise((resolve, reject) => {
      this.dao
        .save(script)
        .then(() => {
          Hook.getInstance().dispatchHook("script:upsert", script);
          this.logger.info("脚本安装成功", {
            id: script.id,
            name: script.name,
            uuid: script.uuid,
            version: script.metadata.version[0],
          });
          resolve({ id: script.id });
        })
        .catch((e) => {
          this.logger.error("脚本安装失败", {
            id: script.id,
            name: script.name,
            uuid: script.uuid,
            version: script.metadata.version[0],
            error: e,
          });
          reject(e);
        });
    });
  }

  @ListenEventDecorator("fetch")
  public fetchInfoHandler(uuid: string) {
    return new Promise((resolve) => {
      resolve(this.cache.get(`script:info:${uuid}`));
    });
  }
}
