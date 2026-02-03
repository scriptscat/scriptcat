import { fetchScriptBody, parseMetadata, prepareScriptByCode } from "@App/pkg/utils/script";
import { v4 as uuidv4 } from "uuid";
import type { Group } from "@Packages/message/server";
import Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_SCRIPT_INFO } from "@App/app/cache_key";
import {
  checkSilenceUpdate,
  getBrowserType,
  getStorageName,
  openInCurrentTab,
  stringMatching,
} from "@App/pkg/utils/utils";
import { ltever } from "@App/pkg/utils/semver";
import type {
  SCMetadata,
  Script,
  SCRIPT_RUN_STATUS,
  ScriptDAO,
  ScriptRunResource,
  ScriptSite,
} from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, ScriptCodeDAO } from "@App/app/repo/scripts";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { createScriptInfo, type ScriptInfo, type InstallSource } from "@App/pkg/utils/scriptInstall";
import { type ResourceService } from "./resource";
import { type ValueService } from "./value";
import { compileScriptCode, isEarlyStartScript } from "../content/utils";
import { type SystemConfig } from "@App/pkg/config/config";
import { localePath } from "@App/locales/locales";
import { arrayMove } from "@dnd-kit/sortable";
import { DocumentationSite } from "@App/app/const";
import type {
  TScriptRunStatus,
  TDeleteScript,
  TEnableScript,
  TInstallScript,
  TSortedScript,
  TInstallScriptParams,
} from "../queue";
import { timeoutExecution } from "@App/pkg/utils/timer";
import { buildScriptRunResourceBasic, selfMetadataUpdate } from "./utils";
import {
  BatchUpdateListActionCode,
  type TBatchUpdateListAction,
  UpdateStatusCode,
  type TBatchUpdateRecord,
} from "./types";
import { getSimilarityScore, ScriptUpdateCheck } from "./script_update_check";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import { CompiledResourceDAO } from "@App/app/repo/resource";
import { initRegularUpdateCheck } from "./regular_updatecheck";

const cIdKey = `(cid_${Math.random()})`;

export type TCheckScriptUpdateOption = Partial<
  { checkType: "user"; noUpdateCheck?: number } | ({ checkType: "system" } & Record<string, any>)
>;

export type TOpenBatchUpdatePageOption = { q: string; dontCheckNow: boolean };

export class ScriptService {
  logger: Logger;
  scriptCodeDAO: ScriptCodeDAO = new ScriptCodeDAO();
  localStorageDAO: LocalStorageDAO = new LocalStorageDAO();
  compiledResourceDAO: CompiledResourceDAO = new CompiledResourceDAO();
  private readonly scriptUpdateCheck;

  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly group: Group,
    private readonly mq: IMessageQueue,
    private readonly valueService: ValueService,
    private readonly resourceService: ResourceService,
    private readonly scriptDAO: ScriptDAO
  ) {
    this.logger = LoggerCore.logger().with({ service: "script" });
    this.scriptCodeDAO.enableCache();
    this.scriptUpdateCheck = new ScriptUpdateCheck(systemConfig, group, mq, valueService, resourceService, scriptDAO);
  }

  listenerScriptInstall() {
    // 初始化脚本安装监听
    chrome.webRequest.onBeforeRequest.addListener(
      (req: chrome.webRequest.OnBeforeRequestDetails) => {
        // 处理url, 实现安装脚本
        if (req.method !== "GET") {
          return undefined;
        }
        let targetUrl: string | null = null;
        // 判断是否为 file:///*/*.user.js
        if (req.url.startsWith("file://") && req.url.endsWith(".user.js")) {
          targetUrl = req.url;
        } else {
          const reqUrl = new URL(req.url);
          // 判断是否有hash
          if (!reqUrl.hash) {
            return undefined;
          }
          // 判断是否有url参数
          if (!reqUrl.hash.includes("url=")) {
            return undefined;
          }
          // 获取url参数
          targetUrl = reqUrl.hash.split("url=")[1];
        }
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
          `${DocumentationSite}/docs/script_installation/*`,
          `${DocumentationSite}/en/docs/script_installation/*`,
          "https://www.tampermonkey.net/script_installation.php*",
          "file:///*/*.user.js*",
        ],
        types: ["main_frame"],
      }
    );
    // 兼容 chrome 内核 < 128 处理
    const browserType = getBrowserType();
    const addResponseHeaders = browserType.chrome && browserType.chromeVersion >= 128;
    // Chrome 84+
    const conditions: chrome.declarativeNetRequest.RuleCondition[] = [
      {
        regexFilter: "^([^?#]+?\\.user(\\.bg|\\.sub)?\\.js)", // Chrome 84+
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME], // Chrome 84+
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod], // Chrome 91+
        isUrlFilterCaseSensitive: false, // Chrome 84+
        excludedRequestDomains: ["github.com", "gitlab.com", "gitea.com", "bitbucket.org"], // Chrome 101+
      },
      {
        regexFilter: "^(.+?\\.user(\\.bg|\\.sub)?\\.js&response-content-type=application%2Foctet-stream)",
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod], // Chrome 91+
        isUrlFilterCaseSensitive: false,
        requestDomains: ["githubusercontent.com"], // Chrome 101+
      },
      {
        regexFilter:
          "^(https?:\\/\\/github.com\\/[^\\s/?#]+\\/[^\\s/?#]+\\/releases/[^\\s/?#]+/download/[^?#]+?\\.user(\\.bg|\\.sub)?\\.js)",
        // https://github.com/<user>/<repo>/releases/latest/download/file.user.js
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod], // Chrome 91+
        isUrlFilterCaseSensitive: false,
        requestDomains: ["github.com"], // Chrome 101+
      },
      {
        regexFilter:
          "^(https?:\\/\\/gitlab\\.com\\/[^\\s/?#]+\\/[^\\s/?#]+\\/-\\/raw\\/[a-z0-9_/.-]+\\/[^?#]+?\\.user(\\.bg|\\.sub)?\\.js)",
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod], // Chrome 91+
        isUrlFilterCaseSensitive: false,
        requestDomains: ["gitlab.com"], // Chrome 101+
      },
      {
        regexFilter: "^(https?:\\/\\/github\\.com\\/[^\\/]+\\/[^\\/]+\\/releases\\/[^?#]+?\\.user(\\.bg|\\.sub)?\\.js)",
        // https://github.com/<user>/<repo>/releases/latest/download/file.user.js
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod], // Chrome 91+
        isUrlFilterCaseSensitive: false,
        requestDomains: ["github.com"], // Chrome 101+
      },
      {
        regexFilter: "^(https?://github.com/[^\\s/?#]+/[^\\s/?#]+/raw/[a-z]+/[^?#]+?.user(\\.bg|\\.sub)?.js)",
        // https://github.com/<user>/<repo>/raw/refs/heads/main/.../file.user.js
        // https://github.com/<user>/<repo>/raw/<branch>/.../file.user.js
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod], // Chrome 91+
        isUrlFilterCaseSensitive: false,
        requestDomains: ["github.com"], // Chrome 101+
      },
      {
        regexFilter:
          "^(https?://gitlab\\.com/[^\\s/?#]+/[^\\s/?#]+/-/raw/[a-z0-9_/.-]+/[^?#]+?\\.user(\\.bg|\\.sub)?\\.js)",
        // https://gitlab.com/<user>/<repo>/-/raw/<branch>/.../file.user.js
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod],
        isUrlFilterCaseSensitive: false,
        requestDomains: ["gitlab.com"], // Chrome 101+
      },
      {
        regexFilter:
          "^(https?://gitea\\.com/[^\\s/?#]+/[^\\s/?#]+/raw/[a-z0-9_/.-]+/[^?#]+?\\.user(\\.bg|\\.sub)?\\.js)",
        // https://gitea.com/<user>/<repo>/raw/<branch>/.../file.user.js
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod],
        isUrlFilterCaseSensitive: false,
        requestDomains: ["gitea.com"], // Chrome 101+
      },
      {
        regexFilter:
          "^(https?://bitbucket\\.org/[^\\s/?#]+/[^\\s/?#]+/raw/[a-z0-9_/.-]+/[^?#]+?\\.user(\\.bg|\\.sub)?\\.js)",
        // https://bitbucket.org/<user>/<repo>/raw/<branch>/.../file.user.js
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod],
        isUrlFilterCaseSensitive: false,
        requestDomains: ["bitbucket.org"], // Chrome 101+
      },
    ];
    const rules = conditions.map((condition, idx) => {
      Object.assign(condition, {
        excludedTabIds: [chrome.tabs.TAB_ID_NONE],
      });
      if (addResponseHeaders) {
        Object.assign(condition, {
          responseHeaders: [
            {
              header: "Content-Type",
              values: [
                "text/javascript*",
                "application/javascript*",
                "text/html*",
                "text/plain*",
                "application/octet-stream*",
                "application/force-download*",
              ],
            },
          ],
        });
      }
      return {
        id: 1000 + idx,
        priority: 1,
        action: {
          type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
          redirect: {
            regexSubstitution: `${DocumentationSite}${localePath}/docs/script_installation/#url=\\1`,
          },
        },
        condition: condition,
      } as chrome.declarativeNetRequest.Rule;
    });
    // 重定向到脚本安装页
    chrome.declarativeNetRequest.updateDynamicRules(
      {
        removeRuleIds: [1],
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
    chrome.declarativeNetRequest.updateSessionRules(
      {
        removeRuleIds: [...rules.map((rule) => rule.id)],
        addRules: rules,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "chrome.runtime.lastError in chrome.declarativeNetRequest.updateSessionRules:",
            chrome.runtime.lastError
          );
        }
      }
    );
  }

  public async openInstallPageByUrl(url: string, source: InstallSource): Promise<{ success: boolean; msg: string }> {
    const uuid = uuidv4();
    try {
      await this.openUpdateOrInstallPage(uuid, url, source, false);
      timeoutExecution(
        `${cIdKey}_cleanup_${uuid}`,
        () => {
          // 清理缓存
          cacheInstance.del(`${CACHE_KEY_SCRIPT_INFO}${uuid}`);
        },
        30 * 1000
      );
      await openInCurrentTab(`/src/install.html?uuid=${uuid}`);
      return { success: true, msg: "" };
    } catch (err: any) {
      console.error(err);
      return { success: false, msg: err.message };
    }
  }

  // 直接通过url静默安装脚本
  async installByUrl(url: string, source: InstallSource, subscribeUrl?: string) {
    const uuid = uuidv4();
    const code = await fetchScriptBody(url);
    const { script } = await prepareScriptByCode(code, url, uuid);
    script.subscribeUrl = subscribeUrl;
    await this.installScript({
      script,
      code,
      upsertBy: source,
    });
    return script;
  }

  // 直接通过code静默安装脚本
  async installByCode(param: { uuid: string; code: string; upsertBy: InstallSource }) {
    const { code, upsertBy, uuid } = param;
    const { script } = await prepareScriptByCode(code, "", uuid, true);
    await this.installScript({
      script,
      code,
      upsertBy,
    });
    return script;
  }

  // 获取安装信息
  getInstallInfo(uuid: string) {
    const cacheKey = `${CACHE_KEY_SCRIPT_INFO}${uuid}`;
    return cacheInstance.get<[boolean, ScriptInfo]>(cacheKey);
  }

  publishInstallScript(scriptFull: Script, options: any) {
    const { uuid, type, status, name, namespace, origin, checkUpdateUrl, downloadUrl } = scriptFull;
    const script = { uuid, type, status, name, namespace, origin, checkUpdateUrl, downloadUrl } as TInstallScriptParams;
    return this.mq.publish<TInstallScript>("installScript", { script, ...options });
  }

  // 安装脚本 / 更新腳本
  async installScript(param: { script: Script; code: string; upsertBy: InstallSource }) {
    param.upsertBy = param.upsertBy || "user";
    const { script, upsertBy } = param;
    // 删 storage cache
    const compiledResourceUpdatePromise = this.compiledResourceDAO.delete(script.uuid);
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
    if (script.ignoreVersion) script.ignoreVersion = "";
    return this.scriptDAO
      .save(script)
      .then(async () => {
        await this.scriptCodeDAO.save({
          uuid: script.uuid,
          code: param.code,
        });
        logger.info("install success");

        // Cache更新 & 下载资源
        await Promise.all([
          compiledResourceUpdatePromise,
          this.resourceService.updateResourceByType(script, "require"),
          this.resourceService.updateResourceByType(script, "require-css"),
          this.resourceService.updateResourceByType(script, "resource"),
        ]);

        // 广播一下
        // Runtime 會負責更新 CompiledResource
        this.publishInstallScript(script, { update, upsertBy });

        return { update };
      })
      .catch((e: any) => {
        logger.error("install error", Logger.E(e));
        throw e;
      });
  }

  async deleteScript(uuid: string, deleteBy?: InstallSource) {
    let logger = this.logger.with({ uuid });
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      logger.error("script not found");
      throw new Error("script not found");
    }
    logger = logger.with({ name: script.name });
    const storageName = getStorageName(script);
    return this.scriptDAO
      .delete(uuid)
      .then(async () => {
        await this.scriptCodeDAO.delete(uuid);
        await this.compiledResourceDAO.delete(uuid);
        logger.info("delete success");
        const data = [{ uuid, storageName, type: script.type, deleteBy }] as TDeleteScript[];
        this.mq.publish("deleteScripts", data);
        return true;
      })
      .catch((e) => {
        logger.error("delete error", Logger.E(e));
        throw e;
      });
  }

  async deleteScripts(uuids: string[]) {
    const logger = this.logger.with({ uuids });
    const scripts = (await this.scriptDAO.gets(uuids)).filter((s) => !!s);
    if (!scripts.length) {
      logger.error("scripts not found");
      throw new Error("scripts not found");
    }
    return this.scriptDAO
      .deletes(uuids)
      .then(async () => {
        await this.scriptCodeDAO.deletes(uuids);
        await this.compiledResourceDAO.deletes(uuids);
        logger.info("delete success");
        const data = scripts.map((script) => ({
          uuid: script.uuid,
          storageName: getStorageName(script),
          type: script.type,
          isEarlyStart: isEarlyStartScript(script.metadata),
        }));
        this.mq.publish<TDeleteScript[]>("deleteScripts", data);
        return true;
      })
      .catch((e) => {
        logger.error("delete error", Logger.E(e));
        throw e;
      });
  }

  async enableScript(param: { uuid: string; enable: boolean }) {
    const { uuid, enable } = param;
    const logger = this.logger.with({ uuid, enable });
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      logger.error("script not found");
      throw new Error("script not found");
    }
    return this.scriptDAO
      .update(uuid, {
        status: enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE,
        updatetime: Date.now(),
      })
      .then(() => {
        logger.info("enable success");
        this.mq.publish<TEnableScript[]>("enableScripts", [{ uuid: uuid, enable: enable }]);
        return {};
      })
      .catch((e) => {
        logger.error("enable error", Logger.E(e));
        throw e;
      });
  }

  async enableScripts(param: { uuids: string[]; enable: boolean }) {
    const { uuids, enable } = param;
    const logger = this.logger.with({ uuids, enable });
    const scripts = await this.scriptDAO.gets(uuids);
    const uuids2: string[] = [];
    for (let i = 0, l = uuids.length; i < l; i++) {
      const script = scripts[i];
      if (script && script.uuid && script.uuid === uuids[i]) {
        uuids2.push(script.uuid);
      }
    }
    if (!uuids2.length) {
      logger.error("scripts not found");
      throw new Error("scripts not found");
    }
    return this.scriptDAO
      .updates(uuids2, {
        status: enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE,
        updatetime: Date.now(),
      })
      .then(() => {
        logger.info("enable success");
        this.mq.publish<TEnableScript[]>(
          "enableScripts",
          uuids2.map((uuid) => ({ uuid, enable }))
        );
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
    // 如果脚本删除了就不再更新状态
    const script = await this.scriptDAO.get(params.uuid);
    if (!script) {
      return false;
    }
    if (
      (await this.scriptDAO.update(params.uuid, {
        runStatus: params.runStatus,
        lastruntime: Date.now(),
        error: params.error,
        nextruntime: params.nextruntime,
      })) === false
    ) {
      throw new Error("update error");
    }
    this.mq.publish<TScriptRunStatus>("scriptRunStatus", params);
    return true;
  }

  async getFilterResult(req: { value: string }) {
    const OPTION_CASE_INSENSITIVE = true;
    const scripts = await this.scriptDAO.all();
    const scriptCodes = await Promise.all(
      scripts.map((script) => this.scriptCodeDAO.get(script.uuid).catch((_) => undefined))
    );

    const keyword = req.value.toLocaleLowerCase();

    // 空格分开关键字搜索
    const keys = keyword.split(/\s+/).filter((e) => e.length);

    const results: Partial<Record<string, string | boolean>>[] = [];
    const codeCache: Partial<Record<string, string>> = {}; // temp cache
    if (!keys.length) return results;
    for (let i = 0, l = scripts.length; i < l; i++) {
      const script = scripts[i];
      const scriptCode = scriptCodes[i];
      const uuid = script.uuid;
      const result: Partial<Record<string, string | boolean>> = { uuid };

      const searchName = (keyword: string) => {
        if (OPTION_CASE_INSENSITIVE) {
          return stringMatching(script.name.toLowerCase(), keyword.toLowerCase());
        }
        return stringMatching(script.name, keyword);
      };
      const searchCode = (keyword: string) => {
        let c = codeCache[script.uuid];
        if (!c) {
          const code = scriptCode;
          if (code && code.uuid === script.uuid) {
            codeCache[script.uuid] = c = code.code;
            c = code.code;
          }
        }
        if (c) {
          if (OPTION_CASE_INSENSITIVE) {
            return stringMatching(c.toLowerCase(), keyword.toLowerCase());
          }
          return stringMatching(c, keyword);
        }
        return false;
      };

      let codeMatched = true;
      let nameMatched = true;
      for (const key of keys) {
        if (codeMatched && !searchCode(key)) {
          codeMatched = false;
        }
        if (nameMatched && !searchName(key)) {
          nameMatched = false;
        }
        if (!codeMatched && !nameMatched) break;
      }
      result.code = codeMatched;
      result.name = nameMatched;
      if (result.name || result.code) {
        result.auto = true;
      }
      results.push(result);
    }
    return results;
  }

  async getScriptRunResourceByUUID(uuid: string) {
    const script = await this.fetchInfo(uuid);
    if (!script) return null;
    const scriptRes = await this.buildScriptRunResource(script);
    scriptRes.code = compileScriptCode(scriptRes);
    return scriptRes;
  }

  async buildScriptRunResource(script: Script): Promise<ScriptRunResource> {
    const ret = buildScriptRunResourceBasic(script);
    return Promise.all([
      this.valueService.getScriptValue(ret),
      this.resourceService.getScriptResources(ret, true),
      this.scriptCodeDAO.get(script.uuid),
    ]).then(([value, resource, code]) => {
      if (!code) {
        throw new Error("code is null");
      }
      ret.value = value;
      ret.resource = resource;
      ret.code = code.code;
      return ret;
    });
  }

  // ScriptMenuList 的 excludeUrl - 排除或回复
  async excludeUrl({ uuid, excludePattern, remove }: { uuid: string; excludePattern: string; remove: boolean }) {
    let script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    // 建立Set去掉重复（如有）
    const excludeSet = new Set(script.selfMetadata?.exclude || script.metadata?.exclude || []);
    if (remove) {
      const deleted = excludeSet.delete(excludePattern);
      if (!deleted) {
        return; // scriptDAO 不用更新
      }
    } else {
      excludeSet.add(excludePattern);
    }
    // 更新 script.selfMetadata.exclude
    script = selfMetadataUpdate(script, "exclude", excludeSet);
    return this.scriptDAO
      .update(uuid, script)
      .then(() => {
        // 广播一下
        this.publishInstallScript(script, { update: true });
        return true;
      })
      .catch((e) => {
        this.logger.error("exclude url error", Logger.E(e));
        throw e;
      });
  }

  async resetExclude({ uuid, exclude }: { uuid: string; exclude: string[] | undefined }) {
    let script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    // 建立Set去掉重复（如有）
    const excludeSet = new Set(exclude || []);
    // 更新 script.selfMetadata.exclude
    script = selfMetadataUpdate(script, "exclude", excludeSet);
    return this.scriptDAO
      .update(uuid, script)
      .then(() => {
        // 广播一下
        this.publishInstallScript(script, { update: true });
        return true;
      })
      .catch((e) => {
        this.logger.error("reset exclude error", Logger.E(e));
        throw e;
      });
  }

  async resetMatch({ uuid, match }: { uuid: string; match: string[] | undefined }) {
    let script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    // 建立Set去掉重复（如有）
    const matchSet = new Set(match || []);
    // 更新 script.selfMetadata.match
    script = selfMetadataUpdate(script, "match", matchSet);
    return this.scriptDAO
      .update(uuid, script)
      .then(() => {
        // 广播一下
        this.publishInstallScript(script, { update: true });
        return true;
      })
      .catch((e) => {
        this.logger.error("reset match error", Logger.E(e));
        throw e;
      });
  }

  async checkUpdatesAvailable(
    uuids: string[],
    opts: {
      MIN_DELAY: number;
      MAX_DELAY: number;
    }
  ) {
    // 检查更新有无

    // 更新 checktime 并返回 script资料列表
    const scripts = await this.scriptDAO.updates(uuids, { checktime: Date.now() });
    const checkScripts = scripts.filter((script) => script && typeof script === "object" && script.checkUpdateUrl);
    if (checkScripts.length === 0) return [];
    const n = checkScripts.length;
    let i = 0;
    const { MIN_DELAY, MAX_DELAY } = opts;

    const delayFn = () =>
      new Promise((resolve) =>
        setTimeout(resolve, Math.round(MIN_DELAY + ((++i / n + Math.random()) / 2) * (MAX_DELAY - MIN_DELAY)))
      );

    return Promise.all(
      (uuids as string[]).map(async (uuid, _idx) => {
        const script = scripts[_idx];
        const res =
          !script || script.uuid !== uuid || !checkScripts.includes(script)
            ? false
            : await this._checkUpdateAvailable(script, delayFn);
        if (!res) return false;
        return res;
      })
    );
  }

  async _checkUpdateAvailable(
    script: {
      uuid: string;
      name: string;
      checkUpdateUrl?: string;
      metadata: Partial<Record<string, any>>;
    },
    delayFn?: () => Promise<any>
  ): Promise<false | { updateAvailable: true; code: string; metadata: SCMetadata }> {
    const { uuid, name, checkUpdateUrl } = script;

    if (!checkUpdateUrl) {
      return false;
    }
    const logger = LoggerCore.logger({
      uuid,
      name,
    });
    try {
      if (delayFn) await delayFn();
      const code = await fetchScriptBody(checkUpdateUrl);
      const metadata = parseMetadata(code);
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
      if (ltever(newVersion, oldVersion)) {
        return false;
      }
      return { updateAvailable: true, code, metadata };
    } catch (e) {
      logger.error("check update failed", Logger.E(e));
      return false;
    }
  }

  async checkUpdateAvailable(uuid_: string) {
    // 检查更新
    const script = await this.scriptDAO.get(uuid_);
    if (!script || !script.checkUpdateUrl) {
      return false;
    }
    await this.scriptDAO.update(uuid_, { checktime: Date.now() });
    const res = await this._checkUpdateAvailable(script);
    if (!res) return false;
    return script;
  }

  async openUpdateOrInstallPage(uuid: string, url: string, upsertBy: InstallSource, update: boolean, logger?: Logger) {
    const code = await fetchScriptBody(url);
    if (update && (await this.systemConfig.getSilenceUpdateScript())) {
      try {
        const { oldScript, script } = await prepareScriptByCode(code, url, uuid);
        if (checkSilenceUpdate(oldScript!.metadata, script.metadata)) {
          logger?.info("silence update script");
          await this.installScript({
            script,
            code,
            upsertBy,
          });
          return 2;
        }
        // 如果不符合静默更新规则，走后面的流程
        logger?.info("not silence update script, open install page");
      } catch (e) {
        logger?.error("prepare script failed", Logger.E(e));
      }
    }
    const metadata = parseMetadata(code);
    if (!metadata) {
      throw new Error("parse script info failed");
    }
    const si = [update, createScriptInfo(uuid, code, url, upsertBy, metadata)];
    await cacheInstance.set(`${CACHE_KEY_SCRIPT_INFO}${uuid}`, si);
    return 1;
  }

  // 打开更新窗口
  public async openUpdatePage(script: Script, source: "user" | "system") {
    const { uuid, name, downloadUrl, checkUpdateUrl } = script;
    const logger = this.logger.with({
      uuid,
      name,
      downloadUrl,
      checkUpdateUrl,
    });
    const url = downloadUrl || checkUpdateUrl!;
    try {
      const ret = await this.openUpdateOrInstallPage(uuid, url, source, true, logger);
      if (ret === 2) return; // slience update
      // 打开安装页面
      openInCurrentTab(`/src/install.html?uuid=${uuid}`);
    } catch (e) {
      logger.error("fetch script info failed", Logger.E(e));
    }
  }

  async openBatchUpdatePage(opts: TOpenBatchUpdatePageOption) {
    const { q, dontCheckNow } = opts;
    const p = q ? `?${q}` : "";
    await openInCurrentTab(`/src/batchupdate.html${p}`);
    if (!dontCheckNow) {
      await this.checkScriptUpdate({ checkType: "user", noUpdateCheck: 10 * 60 * 1000 });
    }
    return true;
  }

  shouldIgnoreUpdate(script: Script, newMeta: Partial<Record<string, string[]>> | null) {
    return script.ignoreVersion === newMeta?.version?.[0];
  }

  // 用于定时自动检查脚本更新
  async _checkScriptUpdate(opts: TCheckScriptUpdateOption): Promise<
    | {
        ok: true;
        targetSites: string[];
        err?: undefined;
        fresh: boolean;
        checktime: number;
      }
    | {
        ok: false;
        targetSites?: undefined;
        err?: string | Error;
      }
  > {
    // const executeSlienceUpdate = opts.checkType === "system";
    const executeSlienceUpdate = opts.checkType === "system" && (await this.systemConfig.getSilenceUpdateScript());
    // const executeSlienceUpdate = true;
    const checkCycle = await this.systemConfig.getCheckScriptUpdateCycle();
    if (!checkCycle) {
      return {
        ok: false,
        err: "checkCycle is undefined.",
      };
    }
    const checkDisableScript = await this.systemConfig.getUpdateDisableScript();
    const scripts = await this.scriptDAO.all();
    // const now = Date.now();

    const checkScripts = scripts.filter((script) => {
      // 不检查更新
      if (script.checkUpdate === false || !script.checkUpdateUrl) {
        return false;
      }
      // 是否检查禁用脚本
      if (!checkDisableScript && script.status === SCRIPT_STATUS_DISABLE) {
        return false;
      }
      // 检查是否符合
      // if (script.checktime + checkCycle * 1000 > now) {
      //   return false;
      // }
      return true;
    });

    const checkDelay =
      opts?.checkType === "user"
        ? {
            MIN_DELAY: 250,
            MAX_DELAY: 1600,
          }
        : {
            MIN_DELAY: 400,
            MAX_DELAY: 4200,
          };

    const checkScriptsResult = await this.checkUpdatesAvailable(
      checkScripts.map((script) => script.uuid),
      checkDelay
    );
    const checkResults = [];
    const slienceUpdates = [];
    for (let i = 0, l = checkScripts.length; i < l; i++) {
      const script = checkScripts[i];
      const result = checkScriptsResult[i];
      if (result) {
        const withNewConnect = !checkSilenceUpdate(script.metadata, result.metadata);
        if (executeSlienceUpdate && !withNewConnect && !this.shouldIgnoreUpdate(script, result.metadata)) {
          slienceUpdates.push({
            uuid: script.uuid,
            script,
            result,
            withNewConnect,
          });
        } else {
          checkResults.push({
            uuid: script.uuid,
            script,
            result,
            withNewConnect,
          });
        }
        // this.openUpdatePage(script, "system");
      }
    }

    const checkScriptsOldCode = await this.scriptCodeDAO.gets(checkResults.map((entry) => entry.uuid));

    const checkScriptsNewCode = await Promise.all(
      checkResults.map(async (entry) => {
        const script = entry.script;
        const url = script.downloadUrl || script.checkUpdateUrl;
        try {
          return url
            ? url === script.checkUpdateUrl
              ? (entry.result.code as string)
              : await fetchScriptBody(url)
            : "";
        } catch (_e) {
          return "";
        }
      })
    );

    const slienceUpdatesNewCode = await Promise.all(
      slienceUpdates.map(async (entry) => {
        const script = entry.script;
        const url = script.downloadUrl || script.checkUpdateUrl;
        try {
          return url
            ? url === script.checkUpdateUrl
              ? (entry.result.code as string)
              : await fetchScriptBody(url)
            : "";
        } catch (_e) {
          return "";
        }
      })
    );

    for (let i = 0, l = slienceUpdates.length; i < l; i++) {
      const entry = slienceUpdates[i];
      const url = entry.script.downloadUrl || entry.script.checkUpdateUrl || "";
      const code = slienceUpdatesNewCode[i];
      const uuid = entry.uuid;
      const { script } = await prepareScriptByCode(code, url, uuid);
      console.log("slienceUpdate", script.name);
      await this.installScript({
        script,
        code,
        upsertBy: "system",
      });
    }

    const checkScriptsScores = await Promise.all(
      checkResults.map(async (entry, i) => {
        let oldCode: any = checkScriptsOldCode[i];
        if (typeof oldCode === "object" && typeof oldCode.code === "string") oldCode = oldCode.code;
        const score = await getSimilarityScore(oldCode, checkScriptsNewCode[i]);
        return +(Math.floor(score * 1000) / 1000);
      })
    );

    const currentSites: ScriptSite = (await this.localStorageDAO.getValue<ScriptSite>("sites")) || ({} as ScriptSite);

    const batchUpdateRecord = checkResults.map((entry, i) => {
      const script = entry.script;
      const result = entry.result;
      // const uuid = entry.uuid;
      if (!result || !script.downloadUrl) {
        return {
          uuid: script.uuid,
          checkUpdate: false,
        } as TBatchUpdateRecord;
      }
      let oldCode: any = checkScriptsOldCode[i];
      if (typeof oldCode === "object" && typeof oldCode.code === "string") oldCode = oldCode.code;
      const newCode = checkScriptsNewCode[i];
      return {
        uuid: script.uuid,
        checkUpdate: true,
        oldCode: oldCode,
        newCode: newCode,
        codeSimilarity: checkScriptsScores[i],
        newMeta: {
          ...(result.metadata || {}),
        },
        script: script,
        sites: currentSites[script.uuid] || ([] as string[]),
        withNewConnect: entry.withNewConnect,
      } as TBatchUpdateRecord;
    });

    this.scriptUpdateCheck.setCacheFull({
      checktime: Date.now(),
      list: batchUpdateRecord,
    });

    // set CHECKED_BEFORE
    this.scriptUpdateCheck.state.status |= UpdateStatusCode.CHECKED_BEFORE;
    this.scriptUpdateCheck.state.checktime = this.scriptUpdateCheck.cacheFull?.checktime;

    return {
      ok: true,
      targetSites: this.scriptUpdateCheck.getTargetSites(),
      fresh: true,
      checktime: this.scriptUpdateCheck.lastCheck,
    };
  }

  async checkScriptUpdate(opts: TCheckScriptUpdateOption) {
    let res;
    if ((this.scriptUpdateCheck.state.status & UpdateStatusCode.CHECKING_UPDATE) === UpdateStatusCode.CHECKING_UPDATE) {
      res = {
        ok: false,
        err: "checkScriptUpdate is busy. Please try again later.",
      } as {
        ok: false;
        targetSites?: undefined;
        err?: string | Error;
      };
    } else if (this.scriptUpdateCheck.canSkipScriptUpdateCheck(opts)) {
      return {
        ok: true,
        targetSites: this.scriptUpdateCheck.getTargetSites(),
        fresh: false,
        checktime: this.scriptUpdateCheck.lastCheck,
      };
    } else {
      // set CHECKING_UPDATE
      this.scriptUpdateCheck.state.status |= UpdateStatusCode.CHECKING_UPDATE;
      this.scriptUpdateCheck.announceMessage(this.scriptUpdateCheck.state);
      try {
        res = await this._checkScriptUpdate(opts);
      } catch (e) {
        console.error(e);
        res = {
          ok: false,
          err: e,
        } as {
          ok: false;
          targetSites?: undefined;
          err?: string | Error;
        };
      }
      // clear CHECKING_UPDATE
      this.scriptUpdateCheck.state.status &= ~UpdateStatusCode.CHECKING_UPDATE;
      this.scriptUpdateCheck.state.checktime = this.scriptUpdateCheck.cacheFull?.checktime;
      this.scriptUpdateCheck.announceMessage(this.scriptUpdateCheck.state);
    }
    return res;
  }

  requestCheckUpdate(uuid: string) {
    // src/pages/options/routes/ScriptList.tsx
    return this.checkUpdateAvailable(uuid).then((script) => {
      if (script) {
        // 如有更新则打开更新画面进行更新
        this.openUpdatePage(script, "user");
        return true;
      }
      return false;
    });

    // 没有空值 case
    /*
    if (uuid) {
      return this.checkUpdateAvailable(uuid).then((script) => {
        if (script) {
          // 如有更新则打开更新画面进行更新
          this.openUpdatePage(script, "user");
          return true;
        }
        return false;
      });
    } else {
      // 批量检查更新
      InfoNotification("检查更新", "正在检查所有的脚本更新");
      this.scriptDAO
        .all()
        .then(async (scripts) => {
          // 检查是否有更新
          const results = await this.checkUpdatesAvailable(
            scripts.map((script) => script.uuid),
            {
              MIN_DELAY: 300,
              MAX_DELAY: 800,
            }
          );
          return Promise.all(
            scripts.map((script, i) => {
              const result = results[i];
              if (result) {
                // 如有更新则打开更新画面进行更新
                this.openUpdatePage(script, "user");
              }
            })
          );
        })
        .then(() => {
          InfoNotification("检查更新", "所有脚本检查完成");
        });
      return Promise.resolve(true); // 无视检查结果，立即回传true
    }
    */
  }

  isInstalled({ name, namespace }: { name: string; namespace: string }): Promise<App.IsInstalledResponse> {
    return this.scriptDAO.findByNameAndNamespace(name, namespace).then((script) => {
      if (script) {
        return {
          installed: true,
          version: script.metadata.version && script.metadata.version[0],
        } as App.IsInstalledResponse;
      }
      return { installed: false } as App.IsInstalledResponse;
    });
  }

  async getAllScripts() {
    // 获取数据并排序
    const scripts = await this.scriptDAO.all();
    scripts.sort((a, b) => a.sort - b.sort);
    for (let i = 0; i < scripts.length; i += 1) {
      if (scripts[i].sort !== i) {
        this.scriptDAO.update(scripts[i].uuid, { sort: i });
        scripts[i].sort = i;
      }
    }
    return scripts;
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
    const updatetime = Date.now();
    for (let i = 0, l = newSort.length; i < l; i += 1) {
      const item = newSort[i];
      if (item.sort !== i) {
        item.sort = i;
        await this.scriptDAO.update(item.uuid, { sort: i, updatetime });
      }
    }
    this.mq.publish<TSortedScript[]>(
      "sortedScripts",
      newSort.map(({ uuid, sort }) => ({ uuid, sort }))
    );
  }

  async pinToTop(uuids: string[]) {
    const scripts = await this.scriptDAO.all();
    const m = uuids.length;
    const oldSorts = new Map<string, number>();
    for (const script of scripts) {
      oldSorts.set(script.uuid, script.sort);
      const idx = uuids.indexOf(script.uuid);
      if (idx >= 0) {
        script.sort = idx;
      } else {
        script.sort += m;
      }
    }
    scripts.sort((a, b) => a.sort - b.sort);
    const updatetime = Date.now();
    for (let i = 0, l = scripts.length; i < l; i += 1) {
      const item = scripts[i];
      item.sort = i;
      if (item.sort !== oldSorts.get(item.uuid)) {
        await this.scriptDAO.update(item.uuid, { sort: i, updatetime });
      }
    }
    this.mq.publish<TSortedScript[]>(
      "sortedScripts",
      scripts.map(({ uuid, sort }) => ({ uuid, sort }))
    );
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
    const update: Partial<Script> = { checkUpdate };
    if (checkUpdateUrl) {
      update.downloadUrl = checkUpdateUrl;
      update.checkUpdateUrl = checkUpdateUrl;
    }
    return this.scriptDAO.update(uuid, update);
  }

  // 更新脚本元数据
  async updateMetadata({ uuid, key, value }: { uuid: string; key: string; value: string[] }) {
    let script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    const valueSet = new Set(value);
    script = selfMetadataUpdate(script, key, valueSet);
    return this.scriptDAO
      .update(uuid, script)
      .then(() => {
        // 广播一下
        this.mq.publish<TInstallScript>("installScript", { script, update: true });
        return true;
      })
      .catch((e) => {
        this.logger.error("reset exclude error", Logger.E(e));
        throw e;
      });
  }

  async getBatchUpdateRecordLite(i: number) {
    return this.scriptUpdateCheck.makeDeliveryPacket(i);
  }

  async fetchCheckUpdateStatus() {
    this.scriptUpdateCheck.announceMessage(this.scriptUpdateCheck.state);
  }

  async sendUpdatePageOpened() {
    this.mq.publish<any>("msgUpdatePageOpened", {});
  }

  async batchUpdateListAction(action: TBatchUpdateListAction) {
    if (action.actionCode === BatchUpdateListActionCode.IGNORE) {
      const map = new Map();
      await Promise.allSettled(
        action.actionPayload.map(async (script) => {
          const { uuid, ignoreVersion } = script;
          const updatedScript = await this.scriptDAO.update(uuid, { ignoreVersion });
          if (!updatedScript || updatedScript.uuid !== uuid) return;
          map.set(uuid, updatedScript);
        })
      );
      if (this.scriptUpdateCheck.cacheFull) {
        this.scriptUpdateCheck.cacheFull.list?.forEach((entry) => {
          const uuid = entry.uuid;
          const script = map.get(entry.uuid);
          if (script && entry.script?.uuid === uuid && script.uuid === uuid) {
            entry.script = script;
          }
        });
        this.scriptUpdateCheck.setCacheFull(this.scriptUpdateCheck.cacheFull);
        this.scriptUpdateCheck.announceMessage({ refreshRecord: true });
      }
    } else if (action.actionCode === BatchUpdateListActionCode.UPDATE) {
      const uuids = action.actionPayload.map((entry) => entry.uuid);
      const list = this.scriptUpdateCheck.cacheFull?.list;
      if (!list) return;
      const data = new Map<string, TBatchUpdateRecord>();
      const set = new Set(uuids);
      for (const entry of list) {
        if (set.has(entry.uuid)) {
          if (!entry.newCode) continue;
          data.set(entry.uuid, entry);
        }
      }
      const res = [];
      const updated = new Set();
      for (const uuid of set) {
        const entry = data.get(uuid);
        try {
          await this.installByCode({ uuid, code: entry?.newCode, upsertBy: "user" });
          res.push({
            uuid,
            success: true,
          });
          updated.add(uuid);
        } catch (e) {
          console.error(e);
          res.push({
            uuid,
            success: false,
          });
        }
      }
      if (this.scriptUpdateCheck.cacheFull?.list) {
        this.scriptUpdateCheck.cacheFull = {
          ...this.scriptUpdateCheck.cacheFull,
          list: this.scriptUpdateCheck.cacheFull.list.filter((entry) => {
            return !updated.has(entry.uuid);
          }),
        };
        this.scriptUpdateCheck.setCacheFull(this.scriptUpdateCheck.cacheFull);
        this.scriptUpdateCheck.announceMessage({ refreshRecord: true });
      }
      return res;
    }
  }

  async openUpdatePageByUUID(uuid: string) {
    const source = "user"; // TBC
    const oldScript = await this.scriptDAO.get(uuid);
    if (!oldScript || oldScript.uuid !== uuid) return;
    const { name, downloadUrl, checkUpdateUrl } = oldScript;
    //@ts-ignore
    const script = { uuid, name, downloadUrl, checkUpdateUrl } as Script;
    await this.openUpdatePage(script, source);
  }

  init() {
    this.listenerScriptInstall();

    this.group.on("getAllScripts", this.getAllScripts.bind(this));
    this.group.on("getInstallInfo", this.getInstallInfo);
    this.group.on("install", this.installScript.bind(this));
    // this.group.on("delete", this.deleteScript.bind(this));
    this.group.on("deletes", this.deleteScripts.bind(this));
    this.group.on("enable", this.enableScript.bind(this));
    this.group.on("enables", this.enableScripts.bind(this));
    this.group.on("fetchInfo", this.fetchInfo.bind(this));
    this.group.on("updateRunStatus", this.updateRunStatus.bind(this));
    this.group.on("getFilterResult", this.getFilterResult.bind(this));
    this.group.on("getScriptRunResourceByUUID", this.getScriptRunResourceByUUID.bind(this));
    this.group.on("excludeUrl", this.excludeUrl.bind(this));
    this.group.on("resetMatch", this.resetMatch.bind(this));
    this.group.on("resetExclude", this.resetExclude.bind(this));
    this.group.on("requestCheckUpdate", this.requestCheckUpdate.bind(this));
    this.group.on("isInstalled", this.isInstalled.bind(this));
    this.group.on("sortScript", this.sortScript.bind(this));
    this.group.on("pinToTop", this.pinToTop.bind(this));
    this.group.on("importByUrl", this.importByUrl.bind(this));
    this.group.on("installByCode", this.installByCode.bind(this));
    this.group.on("setCheckUpdateUrl", this.setCheckUpdateUrl.bind(this));
    this.group.on("updateMetadata", this.updateMetadata.bind(this));
    this.group.on("getBatchUpdateRecordLite", this.getBatchUpdateRecordLite.bind(this));
    this.group.on("fetchCheckUpdateStatus", this.fetchCheckUpdateStatus.bind(this));
    this.group.on("sendUpdatePageOpened", this.sendUpdatePageOpened.bind(this));
    this.group.on("batchUpdateListAction", this.batchUpdateListAction.bind(this));
    this.group.on("openUpdatePageByUUID", this.openUpdatePageByUUID.bind(this));
    this.group.on("openBatchUpdatePage", this.openBatchUpdatePage.bind(this));
    this.group.on("checkScriptUpdate", this.checkScriptUpdate.bind(this));

    initRegularUpdateCheck(this.systemConfig);
  }
}
