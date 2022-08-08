import Cache from "../../cache";
import { ScriptDAO, Script } from "../../repo/scripts";
import ScriptManager from "./manager";

export type ScriptEvent = "install" | "fetch";

const events: { [key: string]: (data: any) => Promise<any> } = {};

function ListenEventDecorator(event: ScriptEvent) {
  return (target: any, propertyName: string) => {
    events[event] = target[propertyName];
  };
}

// 事件监听处理
export default class ScriptEventListener {
  manager: ScriptManager;

  dao: ScriptDAO;

  cache: Cache;

  constructor(manager: ScriptManager, dao: ScriptDAO) {
    this.manager = manager;
    this.dao = dao;
    this.cache = Cache.getInstance();
    Object.keys(events).forEach((event) => {
      this.manager.listenEvent(`script-${event}`, events[event].bind(this));
    });
  }

  @ListenEventDecorator("install")
  public installHandler(script: Script) {
    return new Promise((resolve) => {
      console.log(script);
      console.log(this.manager);
      resolve({ test: 1 });
    });
  }

  @ListenEventDecorator("fetch")
  public fetchInfoHandler(uuid: string) {
    return new Promise((resolve) => {
      resolve(this.cache.get(`script:info:${uuid}`));
    });
  }
}
