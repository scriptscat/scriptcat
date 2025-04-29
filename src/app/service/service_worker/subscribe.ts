import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { ScriptDAO } from "@App/app/repo/scripts";
import {
  Subscribe,
  SUBSCRIBE_STATUS_DISABLE,
  SUBSCRIBE_STATUS_ENABLE,
  SubscribeDAO,
  SubscribeScript,
} from "@App/app/repo/subscribe";
import { SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";
import { Group } from "@Packages/message/server";
import { InstallSource } from ".";
import { publishSubscribeInstall, subscribeSubscribeInstall } from "../queue";
import { ScriptService } from "./script";
import { checkSilenceUpdate, InfoNotification, ltever } from "@App/pkg/utils/utils";
import { fetchScriptInfo, prepareSubscribeByCode, ScriptInfo } from "@App/pkg/utils/script";
import Cache from "@App/app/cache";
import CacheKey from "@App/app/cache_key";

export class SubscribeService {
  logger: Logger;
  subscribeDAO = new SubscribeDAO();
  scriptDAO = new ScriptDAO();

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private mq: MessageQueue,
    private scriptService: ScriptService
  ) {
    this.logger = LoggerCore.logger().with({ service: "subscribe" });
  }

  async install(param: { subscribe: Subscribe }) {
    const logger = this.logger.with({
      subscribeUrl: param.subscribe.url,
      name: param.subscribe.name,
    });
    try {
      await this.subscribeDAO.save(param.subscribe);
      logger.info("upsert subscribe success");
      publishSubscribeInstall(this.mq, {
        subscribe: param.subscribe,
      });
      return Promise.resolve(param.subscribe.url);
    } catch (e) {
      logger.error("upsert subscribe error", Logger.E(e));
      return Promise.reject(e);
    }
  }

  async delete(param: { url: string }) {
    const logger = this.logger.with({
      subscribeUrl: param.url,
    });
    const subscribe = await this.subscribeDAO.get(param.url);
    if (!subscribe) {
      logger.warn("subscribe not found");
      return Promise.resolve(false);
    }
    try {
      // 删除相关脚本
      const scripts = await this.scriptDAO.find((_, value) => {
        return value.subscribeUrl === param.url;
      });
      scripts.forEach((script) => {
        this.scriptService.deleteScript(script.uuid);
      });
      // 删除订阅
      await this.subscribeDAO.delete(param.url);
      logger.info("delete subscribe success");
      return Promise.resolve(true);
    } catch (e) {
      logger.error("uninstall subscribe error", Logger.E(e));
      return Promise.reject(e);
    }
  }

  // 更新订阅的脚本
  async upsertScript(subscribe: Subscribe) {
    const logger = this.logger.with({
      url: subscribe.url,
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
          const script = await this.scriptService.installByUrl(url, "subscribe", subscribe.url);
          subscribe.scripts[url] = {
            url,
            uuid: script.uuid,
          };
          notification[0].push(script.name);
          return Promise.resolve(true);
        })().catch((e) => {
          logger.error("install script failed", Logger.E(e));
          return Promise.resolve(false);
        })
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
            // 删除脚本
            this.scriptService.deleteScript(script.uuid);
          }
          return Promise.resolve(true);
        })().catch((e) => {
          logger.error("delete script failed", Logger.E(e));
          return Promise.resolve(false);
        })
      );
    });

    await Promise.allSettled(result);

    await this.subscribeDAO.update(subscribe.url, subscribe);

    InfoNotification("订阅更新", `安装了:${notification[0].join(",")}\n删除了:${notification[1].join("\n")}`);

    logger.info("subscribe update", {
      install: notification[0],
      update: notification[1],
    });

    return Promise.resolve(true);
  }

  // 检查更新
  async checkUpdate(url: string, source: InstallSource) {
    const subscribe = await this.subscribeDAO.get(url);
    if (!subscribe) {
      return Promise.resolve(false);
    }
    const logger = this.logger.with({
      url: subscribe.url,
      name: subscribe.name,
    });
    await this.subscribeDAO.update(url, { checktime: new Date().getTime() });
    try {
      const info = await fetchScriptInfo(subscribe.url, source, false, subscribe.url);
      const { metadata } = info;
      if (!metadata) {
        logger.error("parse metadata failed");
        return Promise.resolve(false);
      }
      const newVersion = metadata.version && metadata.version[0];
      if (!newVersion) {
        logger.error("parse version failed", { version: metadata.version });
        return Promise.resolve(false);
      }
      let oldVersion = subscribe.metadata.version && subscribe.metadata.version[0];
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
    const silenceUpdate = await this.systemConfig.getSilenceUpdateScript();
    if (silenceUpdate) {
      try {
        const newSubscribe = await prepareSubscribeByCode(info.code, info.url);
        if (checkSilenceUpdate(newSubscribe.oldSubscribe!.metadata, newSubscribe.subscribe.metadata)) {
          logger.info("silence update subscribe");
          this.install({
            subscribe: newSubscribe.subscribe,
          });
          return;
        }
      } catch (e) {
        logger.error("prepare script failed", Logger.E(e));
      }
    }
    Cache.getInstance().set(CacheKey.scriptInstallInfo(info.uuid), info);
    chrome.tabs.create({
      url: `/src/install.html?uuid=${info.uuid}`,
    });
  }

  async checkSubscribeUpdate() {
    const checkCycle = await this.systemConfig.getCheckScriptUpdateCycle();
    if (!checkCycle) {
      return;
    }
    this.logger.debug("start check update");
    const checkDisable = await this.systemConfig.getUpdateDisableScript();
    const list = await this.subscribeDAO.find((_, value) => {
      return value.checktime + checkCycle * 1000 < Date.now();
    });

    list.forEach((subscribe) => {
      if (!checkDisable && subscribe.status === SUBSCRIBE_STATUS_ENABLE) {
        return;
      }
      this.checkUpdate(subscribe.url, "system");
    });
  }

  requestCheckUpdate(url: string) {
    return this.checkUpdate(url, "user");
  }

  enable(param: { url: string; enable: boolean }) {
    const logger = this.logger.with({
      url: param.url,
    });
    return this.subscribeDAO
      .update(param.url, {
        status: param.enable ? SUBSCRIBE_STATUS_ENABLE : SUBSCRIBE_STATUS_DISABLE,
      })
      .then(() => {
        logger.info("enable subscribe success");
        return Promise.resolve(true);
      })
      .catch((e) => {
        logger.error("enable subscribe error", Logger.E(e));
        return Promise.reject(e);
      });
  }

  init() {
    this.group.on("install", this.install.bind(this));
    this.group.on("delete", this.delete.bind(this));
    this.group.on("checkUpdate", this.requestCheckUpdate.bind(this));
    this.group.on("enable", this.enable.bind(this));

    subscribeSubscribeInstall(this.mq, (message) => {
      this.upsertScript(message.subscribe);
    });

    // 定时检查更新, 每10分钟检查一次
    chrome.alarms.create("checkSubscribeUpdate", {
      delayInMinutes: 10,
      periodInMinutes: 10,
    });
  }
}
