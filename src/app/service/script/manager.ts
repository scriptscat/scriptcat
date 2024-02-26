import { v4 as uuidv4 } from "uuid";
import { fetchScriptInfo, prepareScriptByCode } from "@App/pkg/utils/script";
import Cache from "@App/app/cache";
import CacheKey from "@App/pkg/utils/cache_key";
import { MessageHander } from "@App/app/message/message";
import IoC from "@App/app/ioc";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { SystemConfig } from "@App/pkg/config/config";
import {
  checkSilenceUpdate,
  ltever,
  openInCurrentTab,
} from "@App/pkg/utils/utils";
import Manager from "../manager";
import { Script, SCRIPT_STATUS_DISABLE, ScriptDAO } from "../../repo/scripts";
import ScriptEventListener from "./event";
import Hook from "../hook";

export type InstallSource = "user" | "system" | "sync" | "subscribe" | "vscode";

// 脚本管理器,负责脚本实际的安装、卸载、更新等操作
@IoC.Singleton(MessageHander, SystemConfig)
export class ScriptManager extends Manager {
  static hook = new Hook<"upsert" | "enable" | "disable" | "delete">();

  event: ScriptEventListener;

  scriptDAO: ScriptDAO;

  logger: Logger;

  systemConfig: SystemConfig;

  constructor(center: MessageHander, systemConfig: SystemConfig) {
    super(center, "script");
    this.event = new ScriptEventListener(this, new ScriptDAO());
    this.scriptDAO = new ScriptDAO();
    this.systemConfig = systemConfig;
    this.logger = LoggerCore.getLogger({ component: "scriptManager" });
  }

  @CacheKey.Trigger()
  static CacheManager() {
    ScriptManager.hook.addListener("upsert", (script: Script) => {
      Cache.getInstance().del(CacheKey.script(script.id));
      return Promise.resolve(true);
    });
    ScriptManager.hook.addListener("delete", (script: Script) => {
      Cache.getInstance().del(CacheKey.script(script.id));
      return Promise.resolve(true);
    });
  }

  public start() {
    this.listenInstallRequest();
    // 启动脚本检查更新
    // 十分钟对符合要求的脚本进行检查更新
    setInterval(() => {
      if (!this.systemConfig.checkScriptUpdateCycle) {
        return;
      }
      this.logger.debug("start check update");
      this.scriptDAO.table
        .where("checktime")
        .belowOrEqual(
          new Date().getTime() - this.systemConfig.checkScriptUpdateCycle * 1000
        )
        .toArray()
        .then((scripts) => {
          scripts.forEach((script) => {
            if (
              !this.systemConfig.updateDisableScript &&
              script.status === SCRIPT_STATUS_DISABLE
            ) {
              return;
            }
            this.checkUpdate(script.id, "system");
          });
        });
    }, 600 * 1000);
  }

  // 监听脚本安装/更新请求
  public listenInstallRequest() {
    chrome.webRequest.onBeforeRequest.addListener(
      (req: chrome.webRequest.WebRequestBodyDetails) => {
        if (req.method !== "GET") {
          return {};
        }
        const hash = req.url.split("#").splice(1).join("#");
        if (hash.indexOf("bypass=true") !== -1) {
          return {};
        }
        this.openInstallPage(req);
        // eslint-disable-next-line no-script-url
        return { redirectUrl: "javascript:void 0" };
      },
      {
        urls: [
          "*://*/*.user.js",
          "*://*/*.user.js?*",
          "https://*/*.user.sub.js",
          "https://*/*.user.sub.js?*",
          "https://*/*.user.bg.js",
          "https://*/*.user.bg.js?*",
          "file:///*/*.user.js",
        ],
        types: ["main_frame"],
      },
      ["blocking"]
    );
  }

  public openInstallPage(req: chrome.webRequest.WebRequestBodyDetails) {
    this.openInstallPageByUrl(req.url).catch(() => {
      chrome.tabs.update(req.tabId, {
        url: `${req.url}#bypass=true`,
      });
    });
  }

  public openInstallPageByUrl(url: string) {
    return fetchScriptInfo(url, "user", false, uuidv4()).then((info) => {
      Cache.getInstance().set(CacheKey.scriptInfo(info.uuid), info);
      setTimeout(() => {
        // 清理缓存
        Cache.getInstance().del(CacheKey.scriptInfo(info.uuid));
      }, 60 * 1000);
      openInCurrentTab(`/src/install.html?uuid=${info.uuid}`);
    });
  }

  public async checkUpdate(id: number, source: "user" | "system") {
    // 检查更新
    const script = await this.scriptDAO.findById(id);
    if (!script) {
      return Promise.resolve(false);
    }
    this.scriptDAO.update(id, { checktime: new Date().getTime() });
    if (!script.checkUpdateUrl) {
      return Promise.resolve(false);
    }
    const logger = LoggerCore.getLogger({
      scriptId: id,
      name: script.name,
    });
    try {
      const info = await fetchScriptInfo(
        script.checkUpdateUrl,
        source,
        false,
        script.uuid
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
      let oldVersion = script.metadata.version && script.metadata.version[0];
      if (!oldVersion) {
        oldVersion = "0.0.0";
      }
      // 对比版本大小
      if (ltever(newVersion, oldVersion, logger)) {
        return Promise.resolve(false);
      }
      // 进行更新
      this.openUpdatePage(script, source);
    } catch (e) {
      logger.error("check update failed", Logger.E(e));
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  // 打开更新窗口
  public openUpdatePage(script: Script, source: "user" | "system") {
    const logger = this.logger.with({
      scriptId: script.id,
      name: script.name,
      downloadUrl: script.downloadUrl,
      checkUpdateUrl: script.checkUpdateUrl,
    });
    fetchScriptInfo(
      script.downloadUrl || script.checkUpdateUrl!,
      source,
      true,
      script.uuid
    )
      .then(async (info) => {
        // 是否静默更新
        if (this.systemConfig.silenceUpdateScript) {
          try {
            const prepareScript = await prepareScriptByCode(
              info.code,
              script.downloadUrl || script.checkUpdateUrl!,
              script.uuid
            );
            if (
              checkSilenceUpdate(
                prepareScript.oldScript!.metadata,
                prepareScript.script.metadata
              )
            ) {
              logger.info("silence update script");
              this.event.upsertHandler(prepareScript.script);
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
      })
      .catch((e) => {
        logger.error("fetch script info failed", Logger.E(e));
      });
  }

  // 直接通过url静默安装脚本
  async installByUrl(
    url: string,
    source: InstallSource,
    subscribeUrl?: string
  ) {
    const info = await fetchScriptInfo(url, source, false, uuidv4());
    const prepareScript = await prepareScriptByCode(info.code, url, info.uuid);
    prepareScript.script.subscribeUrl = subscribeUrl;
    await this.event.upsertHandler(prepareScript.script, source);
    return Promise.resolve(prepareScript.script);
  }
}

export default ScriptManager;
