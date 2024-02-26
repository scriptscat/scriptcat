import IoC from "@App/app/ioc";
import Logger from "@App/app/logger/logger";
import Cache from "@App/app/cache";
import { MessageHander } from "@App/app/message/message";
import { ScriptDAO } from "@App/app/repo/scripts";
import {
  Subscribe,
  SUBSCRIBE_STATUS_ENABLE,
  SubscribeDAO,
} from "@App/app/repo/subscribe";
import { SubscribeScript } from "@App/pkg/backup/struct";
import { SystemConfig } from "@App/pkg/config/config";
import CacheKey from "@App/pkg/utils/cache_key";
import {
  fetchScriptInfo,
  prepareSubscribeByCode,
  ScriptInfo,
} from "@App/pkg/utils/script";
import {
  checkSilenceUpdate,
  InfoNotification,
  ltever,
} from "@App/pkg/utils/utils";
import Hook from "../hook";
import Manager from "../manager";
import ScriptManager, { InstallSource } from "../script/manager";

@IoC.Singleton(MessageHander, ScriptManager, SystemConfig)
export default class SubscribeManager extends Manager {
  systemConfig: SystemConfig;

  subscribeDAO = new SubscribeDAO();

  scriptDAO = new ScriptDAO();

  scriptManager: ScriptManager;

  static hook = new Hook<"upsert">();

  constructor(
    message: MessageHander,
    scriptManager: ScriptManager,
    systemConfig: SystemConfig
  ) {
    super(message, "subscribe");
    this.systemConfig = systemConfig;
    this.scriptManager = scriptManager;
  }

  start() {
    // 监听消息
    this.listenEvent("upsert", this.upsertHandler.bind(this));
    this.listenEvent("checkUpdate", (id: number) => {
      return this.checkUpdate(id, "user");
    });
    this.listenEvent("delete", this.deleteHandler.bind(this));
    SubscribeManager.hook.addListener("upsert", this.upsertScript.bind(this));
    // 启动订阅检查更新
    // 十分钟对符合要求的订阅进行检查更新
    setInterval(() => {
      if (!this.systemConfig.checkScriptUpdateCycle) {
        return;
      }
      this.logger.debug("start check update");
      this.subscribeDAO.table
        .where("checktime")
        .belowOrEqual(
          new Date().getTime() - this.systemConfig.checkScriptUpdateCycle * 1000
        )
        .toArray()
        .then((subscribes) => {
          subscribes.forEach((subscribe) => {
            if (
              !this.systemConfig.updateDisableScript &&
              subscribe.status === SUBSCRIBE_STATUS_ENABLE
            ) {
              return;
            }
            this.checkUpdate(subscribe.id, "system");
          });
        });
    }, 600 * 1000);
  }

  async upsertHandler(subscribe: Subscribe, upsertBy?: "user" | "system") {
    const logger = this.logger.with({
      subscribeId: subscribe.id,
      name: subscribe.name,
    });
    try {
      await this.subscribeDAO.save(subscribe);
      logger.info("upsert subscribe success");
      SubscribeManager.hook.trigger("upsert", subscribe, upsertBy);
      return Promise.resolve(subscribe.id);
    } catch (e) {
      logger.error("upsert subscribe error", Logger.E(e));
      return Promise.reject(e);
    }
  }

  async deleteHandler(id: number) {
    const logger = this.logger.with({
      subscribeId: id,
    });
    const subscribe = await this.subscribeDAO.findById(id);
    if (!subscribe) {
      logger.warn("subscribe not found");
      return Promise.resolve(false);
    }
    // 删除相关脚本
    const scripts = await this.scriptDAO.table
      .where("subscribeUrl")
      .equals(subscribe.url)
      .toArray();
    scripts.forEach((script) => {
      this.scriptManager.event.deleteHandler(script.id);
    });
    // 删除订阅
    await this.subscribeDAO.delete(id);
    logger.info("delete subscribe success");
    return Promise.resolve(true);
  }

  // 检查更新
  async checkUpdate(id: number, source: InstallSource) {
    const subscribe = await this.subscribeDAO.findById(id);
    if (!subscribe) {
      return Promise.resolve(false);
    }
    const logger = this.logger.with({
      subscribeId: subscribe.id,
      name: subscribe.name,
    });
    await this.subscribeDAO.update(id, { checktime: new Date().getTime() });
    try {
      const info = await fetchScriptInfo(
        subscribe.url,
        source,
        false,
        subscribe.url
      );
      const { metadata } = info;
      if (!metadata) {
        logger.error("parse metadata failed");
        return Promise.resolve(false);
      }
      const newVersion = metadata.version && metadata.version[0];
      if (!newVersion) {
        logger.error("parse version failed", { version: metadata.version[0] });
        return Promise.resolve(false);
      }
      let oldVersion =
        subscribe.metadata.version && subscribe.metadata.version[0];
      if (!oldVersion) {
        oldVersion = "0.0.0";
      }
      // 对比版本大小
      if (ltever(newVersion, oldVersion, logger)) {
        return Promise.resolve(false);
      }
      // 进行更新
      this.openUpdatePage(info);
      return Promise.resolve(true);
    } catch (e) {
      logger.error("check update failed", Logger.E(e));
      return Promise.resolve(false);
    }
  }

  async openUpdatePage(info: ScriptInfo) {
    const logger = this.logger.with({
      url: info.url,
    });
    // 是否静默更新
    if (this.systemConfig.silenceUpdateScript) {
      try {
        const newSubscribe = await prepareSubscribeByCode(info.code, info.url);
        if (
          checkSilenceUpdate(
            newSubscribe.oldSubscribe!.metadata,
            newSubscribe.subscribe.metadata
          )
        ) {
          logger.info("silence update subscribe");
          this.upsertHandler(newSubscribe.subscribe);
          return;
        }
      } catch (e) {
        logger.error("prepare script failed", Logger.E(e));
      }
    }
    Cache.getInstance().set(CacheKey.scriptInfo(info.uuid), info);
    chrome.tabs.create({
      url: `/src/install.html?uuid=${info.uuid}`,
    });
  }

  // 更新订阅的脚本
  async upsertScript(subscribe: Subscribe) {
    const logger = this.logger.with({
      subscribeId: subscribe.id,
      name: subscribe.name,
    });
    // 对比脚本是否有变化
    const addScript: string[] = [];
    const removeScript: SubscribeScript[] = [];
    const scriptUrl = subscribe.metadata.scripturl || [];
    const scripts = Object.keys(subscribe.scripts);
    scriptUrl.forEach((url) => {
      // 不存在于已安装的脚本中, 则添加
      if (!scripts.includes(url)) {
        addScript.push(url);
      }
    });
    scripts.forEach((url) => {
      // 不存在于订阅的脚本中, 则删除
      if (!scriptUrl.includes(url)) {
        removeScript.push(subscribe.scripts[url]);
      }
    });

    const notification: string[][] = [[], []];
    const result: Promise<any>[] = [];
    // 添加脚本
    addScript.forEach((url) => {
      result.push(
        (async () => {
          const script = await this.scriptManager.installByUrl(
            url,
            "subscribe",
            subscribe.url
          );
          subscribe.scripts[url] = {
            url,
            uuid: script.uuid,
          };
          notification[0].push(script.name);
          return Promise.resolve(true);
        })()
      );
    });
    // 删除脚本
    removeScript.forEach((item) => {
      // 通过uuid查询脚本id
      result.push(
        (async () => {
          const script = await this.scriptDAO.findByUUID(item.uuid);
          if (script) {
            notification[1].push(script.name);
            this.scriptManager.event.deleteHandler(script.id);
          }
          return Promise.resolve(true);
        })()
      );
    });

    await Promise.allSettled(result);

    await this.subscribeDAO.update(subscribe.id, subscribe);

    InfoNotification(
      "订阅更新",
      `安装了:${notification[0].join(",")}\n删除了:${notification[1].join(
        "\n"
      )}`
    );

    logger.info("subscribe update", {
      install: notification[0],
      update: notification[1],
    });

    return Promise.resolve(true);
  }
}
