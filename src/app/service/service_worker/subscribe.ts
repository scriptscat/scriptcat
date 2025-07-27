import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import Cache from "@App/app/cache";
import { ScriptDAO } from "@App/app/repo/scripts";
import type { Subscribe, SubscribeScript } from "@App/app/repo/subscribe";
import { SUBSCRIBE_STATUS_DISABLE, SUBSCRIBE_STATUS_ENABLE, SubscribeDAO } from "@App/app/repo/subscribe";
import { type SystemConfig } from "@App/pkg/config/config";
import { type MessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import { type ScriptService } from "./script";
import { createScriptInfo, type InstallSource } from "./types";
import { publishSubscribeInstall, subscribeSubscribeInstall } from "../queue";
import { checkSilenceUpdate, InfoNotification } from "@App/pkg/utils/utils";
import { ltever } from "@App/pkg/utils/semver";
import { fetchScriptBody, parseMetadata, prepareSubscribeByCode } from "@App/pkg/utils/script";
import { CACHE_KEY_SCRIPT_INFO } from "@App/app/cache_key";

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
      return param.subscribe.url;
    } catch (e) {
      logger.error("upsert subscribe error", Logger.E(e));
      throw e;
    }
  }

  async delete(param: { url: string }) {
    const url = param.url;
    const logger = this.logger.with({
      subscribeUrl: url,
    });
    const subscribe = await this.subscribeDAO.get(url);
    if (!subscribe) {
      logger.warn("subscribe not found");
      return false;
    }
    try {
      await Promise.all([
        // 删除相关脚本
        this.scriptDAO
          .find((_, value) => {
            return value.subscribeUrl === url;
          })
          .then((scripts) =>
            Promise.all(
              scripts.map((script) => {
                return this.scriptService.deleteScript(script.uuid);
              })
            )
          ),
        // 删除订阅
        this.subscribeDAO.delete(url),
      ]);
      logger.info("delete subscribe success");
      return true;
    } catch (e) {
      logger.error("uninstall subscribe error", Logger.E(e));
      throw e;
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
    const result: Promise<boolean>[] = [];
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
          return true;
        })().catch((e) => {
          logger.error("install script failed", Logger.E(e));
          return false;
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
          return true;
        })().catch((e) => {
          logger.error("delete script failed", Logger.E(e));
          return false;
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

    return true;
  }

  // 检查更新
  async checkUpdate(url: string, source: InstallSource) {
    const subscribe = await this.subscribeDAO.get(url);
    if (!subscribe) {
      return false;
    }
    const logger = this.logger.with({
      url: subscribe.url,
      name: subscribe.name,
    });
    await this.subscribeDAO.update(url, { checktime: Date.now() });
    try {
      const code = await fetchScriptBody(subscribe.url);
      const metadata = parseMetadata(code);
      const url = subscribe.url;
      const uuid = subscribe.url; // 使用 url 作為 uuid?
      if (!metadata) {
        logger.error("parse metadata failed");
        return false;
      }
      const newVersion = metadata.version && metadata.version[0];
      if (!newVersion) {
        logger.error("parse version failed", { version: metadata.version });
        return false;
      }
      let oldVersion = subscribe.metadata.version && subscribe.metadata.version[0];
      if (!oldVersion) {
        oldVersion = "0.0.0";
      }
      // 对比版本大小
      if (ltever(newVersion, oldVersion, logger)) {
        return false;
      }
      // 进行更新
      if (true === (await this.trySilenceUpdate(code, url))) {
        // slience update
      } else {
        await Cache.getInstance().set(
          `${CACHE_KEY_SCRIPT_INFO}${uuid}`,
          createScriptInfo(uuid, false, code, url, source, metadata)
        );
        chrome.tabs.create({
          url: `/src/install.html?uuid=${uuid}`,
        });
      }
      return true;
    } catch (e) {
      logger.error("check update failed", Logger.E(e));
      return false;
    }
  }

  async trySilenceUpdate(code: string, url: string) {
    const logger = this.logger.with({
      url,
    });
    // 是否静默更新
    const silenceUpdate = await this.systemConfig.getSilenceUpdateScript();
    if (silenceUpdate) {
      try {
        const newSubscribe = await prepareSubscribeByCode(code, url);
        if (checkSilenceUpdate(newSubscribe.oldSubscribe!.metadata, newSubscribe.subscribe.metadata)) {
          logger.info("silence update subscribe");
          this.install({
            subscribe: newSubscribe.subscribe,
          });
          return true;
        }
      } catch (e) {
        logger.error("prepare script failed", Logger.E(e));
      }
    }
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

  async enable(param: { url: string; enable: boolean }) {
    const logger = this.logger.with({
      url: param.url,
    });
    try {
      await this.subscribeDAO.update(param.url, {
        status: param.enable ? SUBSCRIBE_STATUS_ENABLE : SUBSCRIBE_STATUS_DISABLE,
      });
      logger.info("enable subscribe success");
      return true;
    } catch (e) {
      logger.error("enable subscribe error", Logger.E(e));
      throw e;
    }
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
    chrome.alarms.create(
      "checkSubscribeUpdate",
      {
        delayInMinutes: 10,
        periodInMinutes: 10,
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
          // Starting in Chrome 117, the number of active alarms is limited to 500. Once this limit is reached, chrome.alarms.create() will fail.
          console.error("Chrome alarm is unable to create. Please check whether limit is reached.");
        }
      }
    );
  }
}
