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
  InfoNotification,
  getStorageName,
  openInCurrentTab,
  randomMessageFlag,
} from "@App/pkg/utils/utils";
import { ltever } from "@App/pkg/utils/semver";
import type { SCMetadata, Script, SCRIPT_RUN_STATUS, ScriptDAO, ScriptRunResource } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, ScriptCodeDAO } from "@App/app/repo/scripts";
import { type MessageQueue } from "@Packages/message/message_queue";
import { createScriptInfo, type ScriptInfo, type InstallSource } from "@App/pkg/utils/scriptInstall";
import { type ResourceService } from "./resource";
import { type ValueService } from "./value";
import { compileScriptCode } from "../content/utils";
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
import { getCombinedMeta, selfMetadataUpdate } from "./utils";
import type { SearchType } from "./types";

const cIdKey = `(cid_${Math.random()})`;

export class ScriptService {
  logger: Logger;
  scriptCodeDAO: ScriptCodeDAO = new ScriptCodeDAO();

  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly group: Group,
    private readonly mq: MessageQueue,
    private readonly valueService: ValueService,
    private readonly resourceService: ResourceService,
    private readonly scriptDAO: ScriptDAO
  ) {
    this.logger = LoggerCore.logger().with({ service: "script" });
    this.scriptCodeDAO.enableCache();
  }

  listenerScriptInstall() {
    // 初始化脚本安装监听
    chrome.webRequest.onBeforeRequest.addListener(
      (req: chrome.webRequest.OnBeforeRequestDetails) => {
        // 处理url, 实现安装脚本
        if (req.method !== "GET") {
          return undefined;
        }
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
        const targetUrl = reqUrl.hash.split("url=")[1];
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
        ],
        types: ["main_frame"],
      }
    );
    // 兼容 chrome 内核 < 128 处理
    const condition: chrome.declarativeNetRequest.RuleCondition = {
      regexFilter: "^([^#]+?)\\.user(\\.bg|\\.sub)?\\.js((\\?).*|$)",
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      requestMethods: ["get" as chrome.declarativeNetRequest.RequestMethod],
    };
    const browserType = getBrowserType();
    if (browserType.chrome && browserType.chromeVersion >= 128) {
      condition.excludedResponseHeaders = [
        {
          header: "Content-Type",
          values: ["text/html"],
        },
      ];
    } else {
      condition.excludedRequestDomains = ["github.com"];
    }
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
                regexSubstitution: `${DocumentationSite}${localePath}/docs/script_installation/#url=\\0`,
              },
            },
            condition: condition,
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
    this.installScript({
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
    this.installScript({
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
          this.publishInstallScript(script, { update, upsertBy });
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
    const storageName = getStorageName(script);
    return this.scriptDAO
      .delete(uuid)
      .then(async () => {
        await this.scriptCodeDAO.delete(uuid);
        logger.info("delete success");
        const data = [{ uuid, storageName }];
        await this.mq.publish<TDeleteScript[]>("deleteScripts", data);
        return true;
      })
      .catch((e) => {
        logger.error("delete error", Logger.E(e));
        throw e;
      });
  }

  async deleteScripts(uuids: string[]) {
    const logger = this.logger.with({ uuids });
    const scripts = await this.scriptDAO.gets(uuids);
    const uuids2: string[] = [];
    const storageNames: string[] = [];
    for (let i = 0, l = uuids.length; i < l; i++) {
      const script = scripts[i];
      if (script && script.uuid && script.uuid === uuids[i]) {
        uuids2.push(script.uuid);
        storageNames.push(getStorageName(script));
      }
    }
    if (!uuids2.length) {
      logger.error("scripts not found");
      throw new Error("scripts not found");
    }
    return this.scriptDAO
      .deletes(uuids2)
      .then(async () => {
        await this.scriptCodeDAO.deletes(uuids2);
        logger.info("delete success");
        const data = uuids2.map((uuid, i) => ({
          uuid,
          storageName: storageNames[i],
        }));
        await this.mq.publish<TDeleteScript[]>("deleteScripts", data);
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

  async getFilterResult(req: { type: SearchType; value: string }) {
    const OPTION_CASE_INSENSITIVE = true;
    const scripts = await this.scriptDAO.all();
    const scriptCodes = await Promise.all(
      scripts.map((script) => this.scriptCodeDAO.get(script.uuid).catch((_) => undefined))
    );

    const keyword = req.value.toLocaleLowerCase();

    // 空格分开关键字搜索
    const keys = keyword.split(" ");

    const results: Partial<Record<string, string | boolean>>[] = [];
    const codeCache: Partial<Record<string, string>> = {}; // temp cache
    for (let i = 0, l = scripts.length; i < l; i++) {
      const script = scripts[i];
      const scriptCode = scriptCodes[i];
      const uuid = script.uuid;
      const result: Partial<Record<string, string | boolean>> = { uuid };

      const searchName = (keyword: string) => {
        if (OPTION_CASE_INSENSITIVE) {
          return script.name.toLowerCase().includes(keyword.toLowerCase());
        }
        return script.name.includes(keyword);
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
            return c.toLowerCase().includes(keyword.toLowerCase());
          }
          return c.includes(keyword);
        }
        return false;
      };

      for (const key of keys) {
        if (result.code === undefined && searchCode(key)) {
          result.code = true;
        }
        if (result.name === undefined && searchName(key)) {
          result.name = true;
        }
      }
      if (result.name || result.code) {
        result.auto = true;
      }
      results.push(result);
    }
    return results;
  }

  // getScriptRunResource(script: Script) {
  //   return this.buildScriptRunResource(script);
  // }

  async getScriptRunResourceByUUID(uuid: string) {
    const script = await this.fetchInfo(uuid);
    if (!script) return null;
    return this.buildScriptRunResource(script);
  }

  async buildScriptRunResource(script: Script, scriptFlag?: string): Promise<ScriptRunResource> {
    const ret: ScriptRunResource = { ...script } as ScriptRunResource;
    // 自定义配置
    const { match, include, exclude } = ret.metadata;
    ret.originalMetadata = { match, include, exclude }; // 目前只需要 match, include, exclude
    if (ret.selfMetadata) {
      ret.metadata = getCombinedMeta(ret.metadata, ret.selfMetadata);
    }
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
      ret.flag = scriptFlag || randomMessageFlag();
      ret.code = code.code;
      ret.code = compileScriptCode(ret);
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

  async _checkUpdateAvailable(script: {
    uuid: string;
    name: string;
    checkUpdateUrl?: string;
    metadata: Partial<Record<string, any>>;
  }): Promise<false | { updateAvailable: true; code: string; metadata: SCMetadata }> {
    const { uuid, name, checkUpdateUrl } = script;

    if (!checkUpdateUrl) {
      return false;
    }
    const logger = LoggerCore.logger({
      uuid,
      name,
    });
    try {
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
      if (ltever(newVersion, oldVersion, logger)) {
        return false;
      }
      return { updateAvailable: true, code, metadata };
    } catch (e) {
      logger.error("check update failed", Logger.E(e));
      return false;
    }
  }

  async checkUpdate(uuid_: string, source: "user" | "system") {
    // 检查更新
    const script = await this.scriptDAO.get(uuid_);
    if (!script || !script.checkUpdateUrl) {
      return false;
    }
    await this.scriptDAO.update(uuid_, { checktime: Date.now() });
    const res = await this._checkUpdateAvailable(script);
    if (!res) return false;
    // 进行更新
    this.openUpdatePage(script, source);
    return true;
  }

  async openUpdateOrInstallPage(uuid: string, url: string, upsertBy: InstallSource, update: boolean, logger?: Logger) {
    const code = await fetchScriptBody(url);
    if (update && (await this.systemConfig.getSilenceUpdateScript())) {
      try {
        const { oldScript, script } = await prepareScriptByCode(code, url, uuid);
        if (checkSilenceUpdate(oldScript!.metadata, script.metadata)) {
          logger?.info("silence update script");
          this.installScript({
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

  async checkScriptUpdate() {
    const checkCycle = await this.systemConfig.getCheckScriptUpdateCycle();
    if (!checkCycle) {
      return;
    }
    this.scriptDAO.all().then(async (scripts) => {
      const checkDisableScript = await this.systemConfig.getUpdateDisableScript();
      const now = Date.now();
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
        if (script.checktime + checkCycle * 1000 > now) {
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
    try {
      scripts.sort((a, b) => a.sort - b.sort);
      for (let i = 0; i < scripts.length; i += 1) {
        if (scripts[i].sort !== i) {
          this.scriptDAO.update(scripts[i].uuid, { sort: i });
          scripts[i].sort = i;
        }
      }
    } catch (_) {
      //
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
    // this.group.on("getScriptRunResource", this.getScriptRunResource.bind(this));
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
