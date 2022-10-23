import Cache from "@App/app/cache";
import { v4 as uuidv4 } from "uuid";
import CacheKey from "@App/pkg/utils/cache_key";
import SynchronizeManager from "./manager";
import { Handler } from "../manager";

export type SynchronizeEvent = "openImportWindow" | "fetchImportInfo";

export default class SynchronizeEventListener {
  manager: SynchronizeManager;

  constructor(manager: SynchronizeManager) {
    this.manager = manager;
    this.init();
  }

  listenEvent(event: SynchronizeEvent, handler: Handler) {
    this.manager.listenEvent(`sync-${event}`, handler);
  }

  init() {
    this.listenEvent("openImportWindow", this.importHandler.bind(this));
    this.listenEvent("fetchImportInfo", this.fetchImportInfoHandler.bind(this));
  }

  public importHandler(data: any) {
    // 生成uuid,将url保存到缓存中
    const uuid = uuidv4();
    Cache.getInstance().set(CacheKey.importInfo(uuid), data);
    chrome.tabs.create({
      url: `src/import.html?uuid=${uuid}`,
    });
    return Promise.resolve({ uuid });
  }

  public fetchImportInfoHandler(uuid: string) {
    return Promise.resolve(Cache.getInstance().get(CacheKey.importInfo(uuid)));
  }
}
