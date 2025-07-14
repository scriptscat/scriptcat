import { fetchScriptInfo, prepareScriptByCode } from "@App/pkg/utils/script";
import { v4 as uuidv4 } from "uuid";
import type { Group } from "@Packages/message/server";
import Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import Cache from "@App/app/cache";
import CacheKey from "@App/app/cache_key";
import { checkSilenceUpdate, InfoNotification, openInCurrentTab, randomString } from "@App/pkg/utils/utils";
import { ltever } from "@App/pkg/utils/semver";
import type { Script, SCRIPT_RUN_STATUS, ScriptDAO, ScriptRunResource } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, ScriptCodeDAO } from "@App/app/repo/scripts";
import { type MessageQueue } from "@Packages/message/message_queue";
import type { InstallSource } from "./types";
import { type ResourceService } from "./resource";
import { type ValueService } from "./value";
import { compileScriptCode } from "../content/utils";
import { type SystemConfig } from "@App/pkg/config/config";
import { localePath } from "@App/locales/locales";
import { arrayMove } from "@dnd-kit/sortable";

export class ScriptService {
  logger: Logger;
  scriptCodeDAO: ScriptCodeDAO = new ScriptCodeDAO();

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private mq: MessageQueue,
    private valueService: ValueService,
    private resourceService: ResourceService,
    private scriptDAO: ScriptDAO
  ) {
    this.logger = LoggerCore.logger().with({ service: "script" });
    this.scriptCodeDAO.enableCache();
  }

  listenerScriptInstall() {
    // 初始化脚本安装监听
    console.log("init script install listener");
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (req: chrome.webRequest.OnBeforeSendHeadersDetails) => {
        // 处理url, 实现安装脚本
        if (req.method !== "GET") {
          return undefined;
        }
        const url = new URL(req.url);
        // 判断是否有hash
        if (!url.hash) {
          return undefined;
        }
        // 判断是否有url参数
        if (!url.hash.includes("url=")) {
          return undefined;
        }
        // 获取url参数
        const targetUrl = url.hash.split("url=")[1];
        // 读取脚本url内容, 进行安装
        const logger = this.logger.with({ url: targetUrl });
        logger.debug("install script");
        this.openInstallPageByUrl(targetUrl, "user")
          .catch((e) => {
            logger.error("install script error", Logger.E(e));
            // 不再重定向当前url
            chrome.declarativeNetRequest.updateDynamicRules(
              {
                removeRuleIds: [2],
                addRules: [
                  {
                    id: 2,
                    priority: 1,
                    action: {
                      type: "allow" as chrome.declarativeNetRequest.RuleActionType,
                    },
                    condition: {
                      regexFilter: targetUrl,
                      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
                      requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod],
                    },
                  },
                ],
              },
              () => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "chrome.runtime.lastError in chrome.declarativeNetRequest.updateDynamicRules:",
                    chrome.runtime.lastError
                  );
                }
              }
            );
          })
          .finally(() => {
            // 回退到到安装页
            chrome.scripting.executeScript({
              target: { tabId: req.tabId },
              func: function () {
                history.back();
              },
            });
          });
      },
      {
        urls: [
          "https://docs.scriptcat.org/docs/script_installation/*",
          "https://docs.scriptcat.org/en/docs/script_installation/*",
          "https://www.tampermonkey.net/script_installation.php*",
        ],
        types: ["main_frame"],
      }
    );
    // 获取i18n
    // 重定向到脚本安装页
    chrome.declarativeNetRequest.updateDynamicRules(
      {
        removeRuleIds: [1, 2],
        addRules: [
          {
            id: 1,
            priority: 1,
            action: {
              type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
              redirect: {
                regexSubstitution: `https://docs.scriptcat.org${localePath}/docs/script_installation/#url=\\0`,
              },
            },
            condition: {
              regexFilter: "^([^#]+?)\\.user(\\.bg|\\.sub)?\\.js((\\?).*|$)",
              resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
              requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod],
              // 排除常见的符合上述条件的域名
              excludedRequestDomains: ["github.com"],
            },
          },
        ],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "chrome.runtime.lastError in chrome.declarativeNetRequest.updateDynamicRules:",
            chrome.runtime.lastError
          );
        }
      }
    );
  }

  public openInstallPageByUrl(url: string, source: InstallSource): Promise<{ success: boolean; msg: string }> {
    const uuid = uuidv4();
    return fetchScriptInfo(url, source, false, uuid)
      .then((info) => {
        Cache.getInstance().set(CacheKey.scriptInstallInfo(uuid), info);
        setTimeout(() => {
          // 清理缓存
          Cache.getInstance().del(CacheKey.scriptInstallInfo(uuid));
        }, 30 * 1000);
        openInCurrentTab(`/src/install.html?uuid=${uuid}`);
        return { success: true, msg: "" };
      })
      .catch((err) => {
        console.error(err);
        return { success: false, msg: err.message };
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
    return prepareScript.script;
  }

  // 直接通过code静默安装脚本
  async installByCode(param: { uuid: string; code: string; upsertBy: InstallSource }) {
    const prepareScript = await prepareScriptByCode(param.code, "", param.uuid, true);
    this.installScript({
      script: prepareScript.script,
      code: param.code,
      upsertBy: param.upsertBy,
    });
    return prepareScript.script;
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
        // 下载资源
        this.resourceService.checkScriptResource(script).then(() => {
          // 广播一下
          this.mq.publish("installScript", { script, update, upsertBy });
        });
        return { update };
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
        this.scriptCodeDAO.delete(uuid);
        logger.info("delete success");
        this.mq.publish("deleteScript", { uuid, script });
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
      .update(param.uuid, {
        status: param.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE,
        updatetime: new Date().getTime(),
      })
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
      throw new Error("update error");
    }
    this.mq.publish("scriptRunStatus", params);
    return true;
  }

  getCode(uuid: string) {
    return this.scriptCodeDAO.get(uuid);
  }

  async buildScriptRunResource(script: Script): Promise<ScriptRunResource> {
    const ret: ScriptRunResource = <ScriptRunResource>Object.assign(script);

    // 自定义配置
    if (ret.selfMetadata) {
      ret.metadata = { ...ret.metadata };
      Object.keys(ret.selfMetadata).forEach((key) => {
        ret.metadata[key] = ret.selfMetadata![key];
      });
    }

    ret.value = await this.valueService.getScriptValue(ret);

    ret.resource = await this.resourceService.getScriptResources(ret, true);

    ret.flag = randomString(16);
    const code = await this.getCode(ret.uuid);
    if (!code) {
      throw new Error("code is null");
    }
    ret.code = code.code;
    ret.code = compileScriptCode(ret);

    return ret;
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
      return false;
    }
    await this.scriptDAO.update(uuid, { checktime: new Date().getTime() });
    if (!script.checkUpdateUrl) {
      return false;
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
        return false;
      }
      const newVersion = metadata.version && metadata.version[0];
      if (!newVersion) {
        logger.error("parse version failed", { version: metadata.version });
        return false;
      }
      let oldVersion = script.metadata.version && script.metadata.version[0];
      if (!oldVersion) {
        oldVersion = "0.0.0";
      }
      // 对比版本大小
      if (ltever(newVersion, oldVersion, logger)) {
        return false;
      }
      // 进行更新
      this.openUpdatePage(script, source);
    } catch (e) {
      logger.error("check update failed", Logger.E(e));
      return false;
    }
    return true;
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
            // 如果不符合静默更新规则，走后面的流程
            logger.info("not silence update script, open install page");
          } catch (e) {
            logger.error("prepare script failed", Logger.E(e));
          }
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
        // 不检查更新
        if (script.checkUpdate === false) {
          return;
        }
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
    if (uuid) {
      return this.checkUpdate(uuid, "user");
    } else {
      // 批量检查更新
      InfoNotification("检查更新", "正在检查所有的脚本更新");
      this.scriptDAO
        .all()
        .then((scripts) => {
          return Promise.all(scripts.map((script) => this.checkUpdate(script.uuid, "user")));
        })
        .then(() => {
          InfoNotification("检查更新", "所有脚本检查完成");
        });
      return Promise.resolve(true); // 无视检查结果，立即回传true
    }
  }

  isInstalled({ name, namespace }: { name: string; namespace: string }) {
    return this.scriptDAO.findByNameAndNamespace(name, namespace).then((script) => {
      if (script) {
        return { installed: true, version: script.metadata.version && script.metadata.version[0] };
      }
      return { installed: false };
    });
  }

  getAllScripts() {
    // 获取数据并排序
    return this.scriptDAO.all().then((scripts) => {
      scripts.sort((a, b) => a.sort - b.sort);
      for (let i = 0; i < scripts.length; i += 1) {
        if (scripts[i].sort !== i) {
          this.scriptDAO.update(scripts[i].uuid, { sort: i });
          scripts[i].sort = i;
        }
      }
      return scripts;
    });
  }

  async sortScript({ active, over }: { active: string; over: string }) {
    const scripts = await this.scriptDAO.all();
    scripts.sort((a, b) => a.sort - b.sort);
    let oldIndex = 0;
    let newIndex = 0;
    scripts.forEach((item, index) => {
      if (item.uuid === active) {
        oldIndex = index;
      } else if (item.uuid === over) {
        newIndex = index;
      }
    });
    const newSort = arrayMove(scripts, oldIndex, newIndex);
    for (let i = 0; i < newSort.length; i += 1) {
      if (newSort[i].sort !== i) {
        this.scriptDAO.update(newSort[i].uuid, { sort: i, updatetime: new Date().getTime() });
        newSort[i].sort = i;
      }
    }
    this.mq.publish("sortScript", newSort);
  }

  importByUrl(url: string) {
    return this.openInstallPageByUrl(url, "user");
  }

  setCheckUpdateUrl({
    uuid,
    checkUpdate,
    checkUpdateUrl,
  }: {
    uuid: string;
    checkUpdate: boolean;
    checkUpdateUrl?: string;
  }) {
    return this.scriptDAO.update(uuid, { checkUpdate, downloadUrl: checkUpdateUrl, checkUpdateUrl });
  }

  init() {
    this.listenerScriptInstall();

    this.group.on("getAllScripts", this.getAllScripts.bind(this));
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
    this.group.on("isInstalled", this.isInstalled.bind(this));
    this.group.on("sortScript", this.sortScript.bind(this));
    this.group.on("importByUrl", this.importByUrl.bind(this));
    this.group.on("installByCode", this.installByCode.bind(this));
    this.group.on("setCheckUpdateUrl", this.setCheckUpdateUrl.bind(this));

    // 定时检查更新, 每10分钟检查一次
    chrome.alarms.create(
      "checkScriptUpdate",
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
