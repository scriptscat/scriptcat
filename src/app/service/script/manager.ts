import {
  fetchScriptInfo,
  parseMetadata,
  prepareScriptByCode,
} from "@App/pkg/utils/script";
import Cache from "@App/app/cache";
import semver from "semver";
import CacheKey from "@App/pkg/utils/cache_key";
import { MessageHander } from "@App/app/message/message";
import IoC from "@App/app/ioc";
import axios from "axios";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { SystemConfig } from "@App/pkg/config/config";
import Manager from "../manager";
import {
  Metadata,
  Script,
  SCRIPT_STATUS_DISABLE,
  ScriptDAO,
} from "../../repo/scripts";
import ScriptEventListener from "./event";
import Hook from "../hook";

// 脚本管理器,负责脚本实际的安装、卸载、更新等操作
@IoC.Singleton(MessageHander, SystemConfig)
export class ScriptManager extends Manager {
  static hook = new Hook<"upsert" | "enable" | "disable" | "delete">();

  event: ScriptEventListener;

  scriptDAO: ScriptDAO;

  logger: Logger;

  systemConfig: SystemConfig;

  constructor(center: MessageHander, systemConfig: SystemConfig) {
    super(center);
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
            // 更新检查时间
            this.scriptDAO.update(script.id, {
              checktime: new Date().getTime(),
            });
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
        ScriptManager.openInstallPage(req);
        // eslint-disable-next-line no-script-url
        return { redirectUrl: "javascript:void 0" };
      },
      {
        urls: [
          "*://*/*.user.js",
          "https://*/*.user.sub.js",
          "https://*/*.user.bg.js",
        ],
        types: ["main_frame"],
      },
      ["blocking"]
    );
  }

  public static openInstallPage(req: chrome.webRequest.WebRequestBodyDetails) {
    fetchScriptInfo(req.url, "user", false)
      .then((info) => {
        Cache.getInstance().set(CacheKey.scriptInfo(info.uuid), info);
        setTimeout(() => {
          // 清理缓存
          Cache.getInstance().del(CacheKey.scriptInfo(info.uuid));
        }, 60 * 1000);
        chrome.tabs.create({
          url: `src/install.html?uuid=${info.uuid}`,
        });
      })
      .catch(() => {
        chrome.tabs.update(req.tabId, {
          url: `${req.url}#bypass=true`,
        });
      });
  }

  public async checkUpdate(id: number, source: "user" | "system") {
    // 检查更新
    const script = await this.scriptDAO.findById(id);
    if (!script) {
      return Promise.resolve(false);
    }
    if (!script.checkUpdateUrl) {
      return Promise.resolve(false);
    }
    const logger = LoggerCore.getLogger({
      scriptId: id,
      name: script.name,
    });
    this.scriptDAO.update(id, { checktime: new Date().getTime() });
    try {
      const resp = await axios.get(script.checkUpdateUrl, {
        responseType: "text",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (resp.status !== 200) {
        logger.error("check update failed", { status: resp.status });
        return Promise.resolve(false);
      }
      const metadata = parseMetadata(resp.data);
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
      if (semver.lte(newVersion, oldVersion)) {
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
    fetchScriptInfo(script.downloadUrl || script.checkUpdateUrl!, source, true)
      .then(async (info) => {
        // 是否静默更新
        if (this.systemConfig.silenceUpdateScript) {
          try {
            const newScript = await prepareScriptByCode(
              info.code,
              script.downloadUrl || script.checkUpdateUrl!,
              script.uuid
            );
            if (
              this.checkUpdateRule(
                newScript.oldScript!.metadata,
                newScript.metadata
              )
            ) {
              logger.info("silence update script");
              this.event.upsertHandler(newScript);
            }
          } catch (e) {
            logger.error("prepare script failed", Logger.E(e));
            return;
          }
        }
        Cache.getInstance().set(CacheKey.scriptInfo(info.uuid), info);
        chrome.tabs.create({
          url: `src/install.html?uuid=${info.uuid}`,
        });
      })
      .catch((e) => {
        logger.error("fetch script info failed", Logger.E(e));
      });
  }

  // 检查订阅规则是否改变,是否能够静默更新
  public checkUpdateRule(oldMeta: Metadata, newMeta: Metadata): boolean {
    // 判断connect是否改变
    const oldConnect = new Map();
    const newConnect = new Map();
    oldMeta.connect &&
      oldMeta.connect.forEach((val) => {
        oldConnect.set(val, 1);
      });
    newMeta.connect &&
      newMeta.connect.forEach((val) => {
        newConnect.set(val, 1);
      });
    // 老的里面没有新的就需要用户确认了
    const keys = Object.keys(newConnect);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!oldConnect.has(key)) {
        return false;
      }
    }
    return true;
  }
}

export default ScriptManager;
