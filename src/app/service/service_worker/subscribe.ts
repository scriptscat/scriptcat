import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { ScriptDAO, type Script } from "@App/app/repo/scripts";
import type { SCMetadata, Subscribe, SubscribeScript } from "@App/app/repo/subscribe";
import { SubscribeDAO, SubscribeStatusType } from "@App/app/repo/subscribe";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import { type ScriptService } from "./script";
import { createScriptInfo, type InstallSource } from "@App/pkg/utils/scriptInstall";
import { type TInstallSubscribe } from "../queue";
import { checkSilenceUpdate } from "@App/pkg/utils/utils";
import { ltever } from "@App/pkg/utils/semver";
import { fetchScriptBody, parseMetadata, prepareSubscribeByCode } from "@App/pkg/utils/script";
import { cacheInstance } from "@App/app/cache";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { CACHE_KEY_SCRIPT_INFO } from "@App/app/cache_key";
import i18n, { i18nName } from "@App/locales/locales";
import { InfoNotification } from "./utils";

export class SubscribeService {
  logger: Logger;
  subscribeDAO = new SubscribeDAO();
  scriptDAO = new ScriptDAO();

  constructor(
    private group: Group,
    private mq: IMessageQueue,
    private scriptService: ScriptService
  ) {
    this.logger = LoggerCore.logger().with({ service: "subscribe" });
  }

  async install(param: { subscribe: Subscribe }) {
    // 1）由安装页呼叫，进行 user.sub.js 的安装
    // 2）静默更新启动状态下，Subscribe 列表自动更新
    const logger = this.logger.with({
      subscribeUrl: param.subscribe.url,
      name: param.subscribe.name,
    });
    try {
      await this.subscribeDAO.save(param.subscribe); // 所谓的安装，仅储存脚本资源。
      logger.info("upsert subscribe success");
      // 广播后才会根据 subscribe.scripts 的 url 取得/更新脚本
      // 注：installSubscribe 的广播是自己和自己对话。（不等待回应）
      this.mq.publish<TInstallSubscribe>("installSubscribe", {
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

  // 更新订阅的脚本（ installSubscribe ）
  // 已订阅的脚本则根据 Script脚本 本身的更新逻辑更新，与 Subscribe脚本 的更新无关
  async upsertScript(url: string) {
    const subscribe = await this.subscribeDAO.get(url);
    if (!subscribe || !subscribe.metadata.usersubscribe) return; // 有效的 Subscribe 必定有 usersubscribe
    const logger = this.logger.with({
      url: subscribe.url,
      name: subscribe.name,
    });
    // 对比脚本是否有变化
    const addedScripts: string[] = [];
    const removedScripts: SubscribeScript[] = [];
    const metaScriptUrlSet = new Set(subscribe.metadata.scripturl || []); // 订阅列表
    const subscribeScripts = new Set(Object.keys(subscribe.scripts)); // 已关联 uuid 的列表
    // 注：首次安装时， subscribeScripts 是空的。
    for (const url of metaScriptUrlSet) {
      // 不存在于已安装的脚本中, 则添加
      if (!subscribeScripts.has(url)) {
        addedScripts.push(url);
      }
    }
    for (const url of subscribeScripts) {
      // 不存在于订阅的脚本中, 则删除
      if (!metaScriptUrlSet.has(url)) {
        removedScripts.push(subscribe.scripts[url]);
      }
    }

    // 一次性取出所有已安装脚本，建立 URL → Script 的索引，避免每个 addedScript 都全表扫描
    const allScripts = await this.scriptDAO.find();
    const scriptByUrl = new Map<string, Script>();
    for (const script of allScripts) {
      if (script.downloadUrl) scriptByUrl.set(script.downloadUrl, script);
      if (script.origin) scriptByUrl.set(script.origin, script);
    }

    const addedScriptNames: string[] = [];
    const removedScriptNames: string[] = [];
    const promises: Promise<void>[] = [];
    // 添加脚本: 根据 订阅列表 的 Script脚本URLs 进行安装
    addedScripts.forEach((url) => {
      promises.push(
        (async () => {
          const existingScript = scriptByUrl.get(url);
          if (existingScript) {
            // 仅关联至 已安装脚本的 uuid
            // 注：1）已安装的脚本可能是用户用直接下载方式安装
            //     2）已安装的脚本可能是用户用其他 Subscribe 安装
            //     这里的 existingScript 的 subscribeUrl 值不一定是这个 Subscribe 的 url
            subscribe.scripts[url] = {
              url,
              uuid: existingScript.uuid,
            };
          } else {
            // 安装Script脚本 ( script.subscribeUrl 会指定为这个 Subscribe. 当移除 Subscribe 时会一并移除 )
            const script = await this.scriptService.installByUrl(url, "subscribe", subscribe.url);
            const name = i18nName(script);
            // 把Script脚本关联至Subscribe
            subscribe.scripts[url] = {
              url,
              uuid: script.uuid,
            };
            addedScriptNames.push(name);
          }
        })().catch((e) => {
          logger.error("install script failed", Logger.E(e));
        })
      );
    });
    // 删除脚本: 根据 subscribeScripts 的 Script脚本UUIDs 进行反安装
    removedScripts.forEach((item) => {
      // 通过uuid查询脚本id
      promises.push(
        (async () => {
          // 以 uuid 找出已安装的Script脚本资讯
          const script = await this.scriptDAO.get(item.uuid);
          const url = item.url;
          // 无论是否删除脚本，都需要清理 subscribe.scripts 中的关联
          delete subscribe.scripts[url];
          if (script) {
            const name = i18nName(script);
            // 如果不是以此 Subscribe 安装的话则略过删除（例如其他 Subscribe、直接安装、本地安装等）
            if (script.subscribeUrl === subscribe.url) {
              await this.scriptService.deleteScript(script.uuid);
              removedScriptNames.push(name);
            } else {
              logger.warn("Subscribe Update: skip deletion", {
                scriptUUID: script.uuid,
                scriptUrl: url,
                scriptName: name,
              });
            }
          }
        })().catch((e) => {
          logger.error("delete script failed", Logger.E(e));
        })
      );
    });

    await Promise.allSettled(promises);

    // 把 subscribe.scripts 的新资讯储存到 subscribeDAO
    await this.subscribeDAO.update(subscribe.url, subscribe);

    InfoNotification(
      i18n.t("notification.subscribe_update", { subscribeName: subscribe.name }),
      i18n.t("notification.subscribe_update_desc", {
        newScripts: addedScriptNames.join(","),
        deletedScripts: removedScriptNames.join(","),
      })
    );

    logger.info("subscribe list update", {
      installed: addedScriptNames,
      deleted: removedScriptNames,
    });

    return true;
  }

  async _checkUpdateAvailable(
    subscribe: {
      url: string;
      name: string;
      checkUpdateUrl?: string;
      metadata: Partial<Record<string, any>>;
    },
    delayFn?: () => Promise<any>
  ): Promise<false | { updateAvailable: true; code: string; metadata: SCMetadata }> {
    const { url, name } = subscribe;
    const logger = this.logger.with({
      url,
      name,
    });
    try {
      if (delayFn) await delayFn();
      const code = await fetchScriptBody(url); // user.sub.js 的 代码
      const metadata = parseMetadata(code); // user.sub.js 的 metadata = 代码内容分析; metadata.usersubscribe 是 空阵列
      if (!metadata || !metadata.usersubscribe) {
        logger.error("parse metadata failed");
        return false;
      }
      const newVersion = metadata.version?.[0] || "0.0";
      const oldVersion = subscribe.metadata.version?.[0] || "0.0";
      // 对比版本大小
      if (ltever(newVersion, oldVersion)) {
        return false;
      }
      return { updateAvailable: true, code, metadata };
    } catch (e) {
      logger.error("check update failed", Logger.E(e));
      return false;
    }
  }

  // 检查更新
  /**
   * @param url Subscribe脚本 的 url
   * @param source 系统自动检查: "system"; subscribeClient.checkUpdate(subscribe.url) 的时候: "user"
   * @returns
   */
  async checkUpdate(url: string, source: InstallSource) {
    const subscribe = await this.subscribeDAO.get(url);
    if (!subscribe) {
      return false;
    }
    // 先写入更新触发时间
    await this.subscribeDAO.update(url, { checktime: Date.now() });
    const logger = this.logger.with({
      url: subscribe.url,
      name: subscribe.name,
    });
    const res = await this._checkUpdateAvailable(subscribe);
    if (res) {
      const { code, metadata } = res;
      const { url } = subscribe;
      const uuid = uuidv4();
      try {
        // 进行更新
        if (true === (await this.trySilenceUpdate(code, url))) {
          // slience update
        } else {
          const si = [false, createScriptInfo(uuid, code, url, source, metadata), {}];
          await cacheInstance.set(`${CACHE_KEY_SCRIPT_INFO}${uuid}`, si);
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
  }

  // 订阅始终尝试静默更新，不受「非重要变更静默更新脚本」开关控制
  // 仅当订阅的 @connect 新增了域时才需要用户确认
  async trySilenceUpdate(code: string, url: string) {
    const logger = this.logger.with({
      url,
    });
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

  async checkSubscribeUpdate(checkCycle: number, checkDisable: boolean) {
    const list = await this.subscribeDAO.find((_, value) => {
      return value.checktime + checkCycle * 1000 < Date.now();
    });

    for (const subscribe of list) {
      if (!checkDisable && subscribe.status === SubscribeStatusType.disable) {
        // 旧代码一直写反了这个 enable disable
        continue;
      }
      this.checkUpdate(subscribe.url, "system");
    }
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
        status: param.enable ? SubscribeStatusType.enable : SubscribeStatusType.disable,
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

    this.mq.subscribe<TInstallSubscribe>("installSubscribe", (message) => {
      this.upsertScript(message.subscribe.url);
    });

    chrome.alarms.clear("checkSubscribeUpdate");
  }
}
