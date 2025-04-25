import { fetchScriptInfo, prepareScriptByCode } from "@App/pkg/utils/script";
import { v4 as uuidv4 } from "uuid";
import { Group } from "@Packages/message/server";
import Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import Cache from "@App/app/cache";
import CacheKey from "@App/app/cache_key";
import { checkSilenceUpdate, ltever, openInCurrentTab, randomString } from "@App/pkg/utils/utils";
import {
  Script,
  SCRIPT_RUN_STATUS,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  ScriptCodeDAO,
  ScriptDAO,
  ScriptRunResouce,
} from "@App/app/repo/scripts";
import { MessageQueue } from "@Packages/message/message_queue";
import { InstallSource } from ".";
import { ResourceService } from "./resource";
import { ValueService } from "./value";
import { compileScriptCode } from "../content/utils";
import { SystemConfig } from "@App/pkg/config/config";

export class ScriptService {
  logger: Logger;
  scriptDAO: ScriptDAO = new ScriptDAO();
  scriptCodeDAO: ScriptCodeDAO = new ScriptCodeDAO();

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private mq: MessageQueue,
    private valueService: ValueService,
    private resourceService: ResourceService
  ) {
    this.logger = LoggerCore.logger().with({ service: "script" });
  }

  listenerScriptInstall() {
    // 初始化脚本安装监听
    chrome.webRequest.onBeforeRequest.addListener(
      (req: chrome.webRequest.WebRequestBodyDetails) => {
        // 处理url, 实现安装脚本
        if (req.method !== "GET") {
          return;
        }
        const url = new URL(req.url);
        // 判断是否有hash
        if (!url.hash) {
          return;
        }
        // 判断是否有url参数
        if (!url.hash.includes("url=")) {
          return;
        }
        // 获取url参数
        const targetUrl = url.hash.split("url=")[1];
        // 读取脚本url内容, 进行安装
        const logger = this.logger.with({ url: targetUrl });
        logger.debug("install script");
        this.openInstallPageByUrl(targetUrl, "user").catch((e) => {
          logger.error("install script error", Logger.E(e));
          // 如果打开失败, 则重定向到安装页
          chrome.scripting.executeScript({
            target: { tabId: req.tabId },
            func: function () {
              history.back();
            },
          });
          // 并不再重定向当前url
          chrome.declarativeNetRequest.updateDynamicRules(
            {
              removeRuleIds: [2],
              addRules: [
                {
                  id: 2,
                  priority: 1,
                  action: {
                    type: chrome.declarativeNetRequest.RuleActionType.ALLOW,
                  },
                  condition: {
                    regexFilter: targetUrl,
                    resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
                    requestMethods: [chrome.declarativeNetRequest.RequestMethod.GET],
                  },
                },
              ],
            },
            () => {
              if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
              }
            }
          );
        });
      },
      {
        urls: [
          "https://docs.scriptcat.org/docs/script_installation",
          "https://www.tampermonkey.net/script_installation.php",
        ],
        types: ["main_frame"],
      }
    );
    // 重定向到脚本安装页
    chrome.declarativeNetRequest.updateDynamicRules(
      {
        removeRuleIds: [1, 2],
        addRules: [
          {
            id: 1,
            priority: 1,
            action: {
              type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
              redirect: {
                regexSubstitution: "https://docs.scriptcat.org/docs/script_installation#url=\\0",
              },
            },
            condition: {
              regexFilter: "^([^#]+?)\\.user(\\.bg|\\.sub)?\\.js((\\?).*|$)",
              resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
              requestMethods: [chrome.declarativeNetRequest.RequestMethod.GET],
              // 排除常见的符合上述条件的域名
              excludedRequestDomains: ["github.com"],
            },
          },
        ],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        }
      }
    );
  }

  public openInstallPageByUrl(url: string, source: InstallSource) {
    const uuid = uuidv4();
    return fetchScriptInfo(url, source, false, uuidv4()).then((info) => {
      Cache.getInstance().set(CacheKey.scriptInstallInfo(uuid), info);
      setTimeout(() => {
        // 清理缓存
        Cache.getInstance().del(CacheKey.scriptInstallInfo(uuid));
      }, 30 * 1000);
      openInCurrentTab(`/src/install.html?uuid=${uuid}`);
    });
  }

  // 直接通过url静默安装脚本
  async installByUrl(url: string, source: InstallSource, subscribeUrl?: string) {
    const info = await fetchScriptInfo(url, source, false, uuidv4());
    const prepareScript = await prepareScriptByCode(info.code, url, info.uuid);
    prepareScript.script.subscribeUrl = subscribeUrl;
    this.installScript({
      script: prepareScript.script,
      code: info.code,
      upsertBy: source,
    });
    return Promise.resolve(prepareScript.script);
  }

  // 获取安装信息
  getInstallInfo(uuid: string) {
    return Cache.getInstance().get(CacheKey.scriptInstallInfo(uuid));
  }

  // 安装脚本
  async installScript(param: { script: Script; code: string; upsertBy: InstallSource }) {
    param.upsertBy = param.upsertBy || "user";
    const { script, upsertBy } = param;
    const logger = this.logger.with({
      name: script.name,
      uuid: script.uuid,
      version: script.metadata.version![0],
      upsertBy,
    });
    let update = false;
    // 判断是否已经安装
    const oldScript = await this.scriptDAO.get(script.uuid);
    if (oldScript) {
      // 执行更新逻辑
      update = true;
      script.selfMetadata = oldScript.selfMetadata;
    }
    return this.scriptDAO
      .save(script)
      .then(async () => {
        await this.scriptCodeDAO.save({
          uuid: script.uuid,
          code: param.code,
        });
        logger.info("install success");
        // 广播一下
        this.mq.publish("installScript", { script, update, upsertBy });
        return Promise.resolve({ update });
      })
      .catch((e: any) => {
        logger.error("install error", Logger.E(e));
        throw e;
      });
  }

  async deleteScript(uuid: string) {
    const logger = this.logger.with({ uuid });
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      logger.error("script not found");
      throw new Error("script not found");
    }
    return this.scriptDAO
      .delete(uuid)
      .then(() => {
        logger.info("delete success");
        this.mq.publish("deleteScript", { uuid });
        return true;
      })
      .catch((e) => {
        logger.error("delete error", Logger.E(e));
        throw e;
      });
  }

  async enableScript(param: { uuid: string; enable: boolean }) {
    const logger = this.logger.with({ uuid: param.uuid, enable: param.enable });
    const script = await this.scriptDAO.get(param.uuid);
    if (!script) {
      logger.error("script not found");
      throw new Error("script not found");
    }
    return this.scriptDAO
      .update(param.uuid, { status: param.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE })
      .then(() => {
        logger.info("enable success");
        this.mq.publish("enableScript", { uuid: param.uuid, enable: param.enable });
        return {};
      })
      .catch((e) => {
        logger.error("enable error", Logger.E(e));
        throw e;
      });
  }

  async fetchInfo(uuid: string) {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return null;
    }
    return script;
  }

  async updateRunStatus(params: { uuid: string; runStatus: SCRIPT_RUN_STATUS; error?: string; nextruntime?: number }) {
    if (
      (await this.scriptDAO.update(params.uuid, {
        runStatus: params.runStatus,
        lastruntime: new Date().getTime(),
        error: params.error,
        nextruntime: params.nextruntime,
      })) === false
    ) {
      return Promise.reject("update error");
    }
    this.mq.publish("scriptRunStatus", params);
    return Promise.resolve(true);
  }

  getCode(uuid: string) {
    return this.scriptCodeDAO.get(uuid);
  }

  async buildScriptRunResource(script: Script): Promise<ScriptRunResouce> {
    const ret: ScriptRunResouce = <ScriptRunResouce>Object.assign(script);

    // 自定义配置
    if (ret.selfMetadata) {
      ret.metadata = { ...ret.metadata };
      Object.keys(ret.selfMetadata).forEach((key) => {
        ret.metadata[key] = ret.selfMetadata![key];
      });
    }

    ret.value = await this.valueService.getScriptValue(ret);

    ret.resource = await this.resourceService.getScriptResources(ret);

    ret.flag = randomString(16);
    const code = await this.getCode(ret.uuid);
    if (!code) {
      throw new Error("code is null");
    }
    ret.code = code.code;
    ret.code = compileScriptCode(ret);

    return Promise.resolve(ret);
  }

  async excludeUrl({ uuid, url, remove }: { uuid: string; url: string; remove: boolean }) {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    script.selfMetadata = script.selfMetadata || {};
    let excludes = script.selfMetadata.exclude || script.metadata.exclude || [];
    if (remove) {
      excludes = excludes.filter((item) => item !== url);
    } else {
      excludes.push(url);
    }
    script.selfMetadata.exclude = excludes;
    return this.scriptDAO
      .update(uuid, script)
      .then(() => {
        // 广播一下
        this.mq.publish("installScript", { script, update: true });
        return true;
      })
      .catch((e) => {
        this.logger.error("exclude url error", Logger.E(e));
        throw e;
      });
  }

  async resetExclude({ uuid, exclude }: { uuid: string; exclude: string[] | undefined }) {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    script.selfMetadata = script.selfMetadata || {};
    if (exclude) {
      script.selfMetadata.exclude = exclude;
    } else {
      delete script.selfMetadata.exclude;
    }
    return this.scriptDAO
      .update(uuid, script)
      .then(() => {
        // 广播一下
        this.mq.publish("installScript", { script, update: true });
        return true;
      })
      .catch((e) => {
        this.logger.error("reset exclude error", Logger.E(e));
        throw e;
      });
  }

  async resetMatch({ uuid, match }: { uuid: string; match: string[] | undefined }) {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    script.selfMetadata = script.selfMetadata || {};
    if (match) {
      script.selfMetadata.match = match;
    } else {
      delete script.selfMetadata.match;
    }
    return this.scriptDAO
      .update(uuid, script)
      .then(() => {
        // 广播一下
        this.mq.publish("installScript", { script, update: true });
        return true;
      })
      .catch((e) => {
        this.logger.error("reset match error", Logger.E(e));
        throw e;
      });
  }

  async checkUpdate(uuid: string, source: "user" | "system") {
    // 检查更新
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return Promise.resolve(false);
    }
    await this.scriptDAO.update(uuid, { checktime: new Date().getTime() });
    if (!script.checkUpdateUrl) {
      return Promise.resolve(false);
    }
    const logger = LoggerCore.logger({
      uuid: script.uuid,
      name: script.name,
    });
    try {
      const info = await fetchScriptInfo(script.checkUpdateUrl, source, false, script.uuid);
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
      uuid: script.uuid,
      name: script.name,
      downloadUrl: script.downloadUrl,
      checkUpdateUrl: script.checkUpdateUrl,
    });
    fetchScriptInfo(script.downloadUrl || script.checkUpdateUrl!, source, true, script.uuid)
      .then(async (info) => {
        // 是否静默更新
        if (await this.systemConfig.getSilenceUpdateScript()) {
          try {
            const prepareScript = await prepareScriptByCode(
              info.code,
              script.downloadUrl || script.checkUpdateUrl!,
              script.uuid
            );
            if (checkSilenceUpdate(prepareScript.oldScript!.metadata, prepareScript.script.metadata)) {
              logger.info("silence update script");
              this.installScript({
                script: prepareScript.script,
                code: info.code,
                upsertBy: source,
              });
              return;
            }
          } catch (e) {
            logger.error("prepare script failed", Logger.E(e));
          }
          return;
        }
        // 打开安装页面
        Cache.getInstance().set(CacheKey.scriptInstallInfo(info.uuid), info);
        chrome.tabs.create({
          url: `/src/install.html?uuid=${info.uuid}`,
        });
      })
      .catch((e) => {
        logger.error("fetch script info failed", Logger.E(e));
      });
  }

  async checkScriptUpdate() {
    const checkCycle = await this.systemConfig.getCheckScriptUpdateCycle();
    if (!checkCycle) {
      return;
    }
    this.scriptDAO.all().then(async (scripts) => {
      const checkDisableScript = await this.systemConfig.getUpdateDisableScript();
      scripts.forEach(async (script) => {
        // 是否检查禁用脚本
        if (!checkDisableScript && script.status === SCRIPT_STATUS_DISABLE) {
          return;
        }
        // 检查是否符合
        if (script.checktime + checkCycle * 1000 > Date.now()) {
          return;
        }
        this.checkUpdate(script.uuid, "system");
      });
    });
  }

  requestCheckUpdate(uuid: string) {
    return this.checkUpdate(uuid, "user");
  }

  init() {
    this.listenerScriptInstall();

    this.group.on("getInstallInfo", this.getInstallInfo);
    this.group.on("install", this.installScript.bind(this));
    this.group.on("delete", this.deleteScript.bind(this));
    this.group.on("enable", this.enableScript.bind(this));
    this.group.on("fetchInfo", this.fetchInfo.bind(this));
    this.group.on("updateRunStatus", this.updateRunStatus.bind(this));
    this.group.on("getCode", this.getCode.bind(this));
    this.group.on("getScriptRunResource", this.buildScriptRunResource.bind(this));
    this.group.on("excludeUrl", this.excludeUrl.bind(this));
    this.group.on("resetMatch", this.resetMatch.bind(this));
    this.group.on("resetExclude", this.resetExclude.bind(this));
    this.group.on("requestCheckUpdate", this.requestCheckUpdate.bind(this));

    // 定时检查更新, 每10分钟检查一次
    chrome.alarms.create("checkScriptUpdate", {
      delayInMinutes: 10,
      periodInMinutes: 10,
    });
  }
}
