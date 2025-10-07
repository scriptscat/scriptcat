import type { EmitEventRequest, ScriptLoadInfo, ScriptMatchInfo, TScriptMatchInfoEntry } from "./types";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { Group, IGetSender } from "@Packages/message/server";
import type { ExtMessageSender, MessageSend } from "@Packages/message/types";
import type {
  SCMetadata,
  Script,
  SCRIPT_STATUS,
  ScriptDAO,
  ScriptRunResource,
  ScriptSite,
} from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { type ValueService } from "./value";
import GMApi, { GMExternalDependencies } from "./gm_api";
import type { TDeleteScript, TEnableScript, TInstallScript, TScriptValueUpdate, TSortedScript } from "../queue";
import { type ScriptService } from "./script";
import { runScript, stopScript } from "../offscreen/client";
import { complieInjectionCode, getUserScriptRegister } from "./utils";
import {
  checkUserScriptsAvailable,
  randomMessageFlag,
  getMetadataStr,
  getUserConfigStr,
  obtainBlackList,
} from "@App/pkg/utils/utils";
import { cacheInstance } from "@App/app/cache";
import { UrlMatch } from "@App/pkg/utils/match";
import { ExtensionContentMessageSend } from "@Packages/message/extension_message";
import { sendMessage } from "@Packages/message/client";
import type { CompileScriptCodeResource } from "../content/utils";
import {
  compileInjectScriptByFlag,
  compileScriptCode,
  compileScriptCodeByResource,
  isEarlyStartScript,
} from "../content/utils";
import LoggerCore from "@App/app/logger/core";
import PermissionVerify from "./permission_verify";
import { type SystemConfig } from "@App/pkg/config/config";
import { type ResourceService } from "./resource";
import { type LocalStorageDAO } from "@App/app/repo/localStorage";
import Logger from "@App/app/logger/logger";
import type { GMInfoEnv } from "../content/types";
import { localePath } from "@App/locales/locales";
import { DocumentationSite } from "@App/app/const";
import { extractUrlPatterns, RuleType, type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { parseUserConfig } from "@App/pkg/utils/yaml";
import type { CompliedResource, ResourceType } from "@App/app/repo/resource";
import { CompliedResourceDAO } from "@App/app/repo/resource";

const ORIGINAL_URLMATCH_SUFFIX = "{ORIGINAL}"; // 用于标记原始URLPatterns的后缀

const runtimeGlobal = {
  registered: false,
  messageFlag: "PENDING",
};

export class RuntimeService {
  scriptMatch: UrlMatch<string> = new UrlMatch<string>();
  blackMatch: UrlMatch<string> = new UrlMatch<string>();
  scriptMatchCache: Map<string, TScriptMatchInfoEntry> | null | undefined;

  logger: Logger;

  // 当前扩充是否允许执行 UserScripts API (例如是否已打开开发者模式，或已给予 userScripts 权限)
  // 在未初始化前，预设 false。一般情况初始化值会很快被替换
  isUserScriptsAvailable = false;

  // 当前扩充是否开启了启用脚本
  // 在未初始化前，预设 true。一般情况初始化值会很快被替换
  isLoadScripts = true;

  // 当前扩充的userAgentData
  // 在未初始化前，预设 {}。一般情况初始化值会很快被替换
  // 注意：即使没有使用 Object.freeze, 也不应该直接修改物件内容 (immutable)
  userAgentData: typeof GM_info.userAgentData = {};

  // 当前扩充的blacklist
  // 在未初始化前，预设 []。一般情况初始化值会很快被替换
  // 注意：即使没有使用 Object.freeze, 也不应该直接修改阵列内容 (immutable)
  blacklist: string[] = [];

  // 获取inject.js内容时调用，需要预先调用preInject
  injectJsCodePromise: Promise<string | undefined> | null = null;

  // initReady
  initReady: Promise<boolean> | boolean = false;

  mq: IMessageQueue;

  sitesLoaded: Set<string> = new Set<string>();
  updateSitesBusy: boolean = false;

  loadingInitFlagPromise: Promise<any> | undefined;
  loadingInitRegisteredPromise: Promise<any> | undefined;

  compliedResourceDAO: CompliedResourceDAO = new CompliedResourceDAO();

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private msgSender: MessageSend,
    mq: IMessageQueue,
    private value: ValueService,
    private script: ScriptService,
    private resource: ResourceService,
    private scriptDAO: ScriptDAO,
    private localStorageDAO: LocalStorageDAO
  ) {
    this.loadingInitFlagPromise = this.localStorageDAO
      .get("scriptInjectMessageFlag")
      .then((res) => {
        runtimeGlobal.messageFlag = res?.value || randomMessageFlag();
        return this.localStorageDAO.save({ key: "scriptInjectMessageFlag", value: runtimeGlobal.messageFlag });
      })
      .catch(console.error);
    this.loadingInitRegisteredPromise = new Promise<void>((resolve) => {
      let result = false;
      chrome.userScripts
        .getScripts({ ids: ["scriptcat-content", "scriptcat-inject"] })
        .then((res) => {
          if (res.length === 2) {
            result = true;
          }
        })
        .finally(() => {
          runtimeGlobal.registered = result;
          // 考虑 API 不可使用情况，使用 finally
          resolve();
        });
    });
    this.logger = LoggerCore.logger({ component: "runtime" });

    // 使用中间件
    this.group = this.group.use(async (_, __, next) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      return next();
    });
    this.mq = mq.group("", async (_, __, next) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      return next();
    });
  }

  async initUserAgentData() {
    // @ts-ignore
    const userAgentData = navigator.userAgentData;
    if (userAgentData) {
      this.userAgentData = {
        brands: userAgentData.brands,
        mobile: userAgentData.mobile,
        platform: userAgentData.platform,
      };
      // 处理architecture和bitness
      if (chrome.runtime.getPlatformInfo) {
        const platformInfo = await chrome.runtime.getPlatformInfo();
        this.userAgentData.architecture = platformInfo.nacl_arch;
        this.userAgentData.bitness = platformInfo.arch.includes("64") ? "64" : "32";
      }
    }
  }

  showNoDeveloperModeWarning() {
    // 判断是否首次
    this.localStorageDAO.get("firstShowDeveloperMode").then((res) => {
      if (!res) {
        this.localStorageDAO.save({
          key: "firstShowDeveloperMode",
          value: true,
        });
        // 打开页面
        chrome.tabs.create({
          url: `${DocumentationSite}${localePath}/docs/use/open-dev/`,
        });
      }
    });
    chrome.action.setBadgeBackgroundColor({
      color: "#ff8c00",
    });
    chrome.action.setBadgeTextColor({
      color: "#ffffff",
    });
    chrome.action.setBadgeText({
      text: "!",
    });

    chrome.permissions.onAdded.addListener((permissions: chrome.permissions.Permissions) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.permissions.onAdded:", lastError);
        return;
      }
      if (permissions.permissions?.includes("userScripts")) {
        chrome.action.setBadgeBackgroundColor({
          color: [0, 0, 0, 0], // transparent (RGBA)
        });
        chrome.action.setBadgeTextColor({
          color: "#ffffff", // default is white
        });
        chrome.action.setBadgeText({
          text: "", // clears badge
        });
      }
    });
  }

  async getInjectJsCode() {
    if (!this.injectJsCodePromise) {
      this.injectJsCodePromise = fetch("/src/inject.js")
        .then((res) => res.text())
        .catch((e) => {
          console.error("Unable to fetch /src/inject.js", e);
          return undefined;
        });
    }
    return this.injectJsCodePromise;
  }

  createMatchInfoEntry(
    scriptRes: ScriptRunResource,
    o: { scriptUrlPatterns: URLRuleEntry[]; originalUrlPatterns: URLRuleEntry[] | null }
  ) {
    const resourceCheck = {} as Record<string, [string, ResourceType]>;

    for (const [_key, res] of Object.entries(scriptRes.resource)) {
      if (res.url.startsWith("file:///")) {
        resourceCheck[res.url] = [res.hash.sha512, res.type];
      }
    }

    // 优化性能，将不需要的信息去掉
    // 而且可能会超过缓存的存储限制
    const matchInfo = {
      ...scriptRes,
      scriptUrlPatterns: o.scriptUrlPatterns,
      originalUrlPatterns: o.originalUrlPatterns === null ? o.scriptUrlPatterns : o.originalUrlPatterns,
      code: "",
      value: {},
      resource: {},
      resourceCheck,
    } as TScriptMatchInfoEntry;
    return matchInfo;
  }

  async waitInit() {
    const scriptMatchCache = (this.scriptMatchCache = new Map<string, TScriptMatchInfoEntry>());
    const [cScriptMatch, compliedResources, allScripts] = await Promise.all([
      cacheInstance.get<{ [key: string]: TScriptMatchInfoEntry }>("scriptMatch"),
      this.compliedResourceDAO.all(),
      this.scriptDAO.all(),
    ]);
    const isColdStart = !cScriptMatch;
    if (cScriptMatch) {
      for (const [key, value] of Object.entries(cScriptMatch)) {
        scriptMatchCache.set(key, value);
      }
    }
    const scriptResPromises = [] as Promise<[ScriptRunResource, URLRuleEntry[], URLRuleEntry[] | null]>[];
    allScripts.forEach((script) => {
      if (script.type !== SCRIPT_TYPE_NORMAL) {
        return;
      }
      const uuid = script.uuid;
      const compliedResource = compliedResources.find((res) => res.uuid === uuid);
      if (!compliedResource || !compliedResource.require || !compliedResource.scriptUrlPatterns?.length) return;

      const { scriptUrlPatterns, originalUrlPatterns } = compliedResource;
      const uuidOri = `${uuid}${ORIGINAL_URLMATCH_SUFFIX}`;
      // 添加新的数据
      this.scriptMatch.addRules(uuid, scriptUrlPatterns);
      if (originalUrlPatterns !== null && originalUrlPatterns !== scriptUrlPatterns) {
        this.scriptMatch.addRules(uuidOri, originalUrlPatterns);
      }
      if (isColdStart) {
        scriptResPromises.push(
          this.script
            .buildScriptRunResource(script, true)
            .then(
              (scriptRes) =>
                [scriptRes, scriptUrlPatterns, originalUrlPatterns] as [
                  ScriptRunResource,
                  URLRuleEntry[],
                  URLRuleEntry[] | null,
                ]
            )
        );
      }
    });
    if (scriptResPromises.length) {
      const scriptResList = await Promise.all(scriptResPromises);
      for (const [scriptRes, scriptUrlPatterns, originalUrlPatterns] of scriptResList) {
        const matchInfo = this.createMatchInfoEntry(scriptRes, { scriptUrlPatterns, originalUrlPatterns });
        scriptMatchCache.set(matchInfo.uuid, matchInfo);
      }
      await this.saveScriptMatchInfo();
    }

    // compliedResourceDAO是新功能。如果安装时未有建立compliedResource，则在初始化时建立
    await Promise.allSettled(
      allScripts.map(async (script) => {
        if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
          return undefined;
        }
        const result = await this.compliedResourceDAO.get(script.uuid);
        if (!result) {
          await this.buildAndSaveCompliedResource(script);
        }
      })
    );
  }

  async updateResourceOnScriptChange(script: Script) {
    if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
      throw "Invalid Calling of updateResourceOnScriptChange";
    }
    // 安裝，啟用，或earlyStartScript的value更新
    const scriptRes = await this.script.buildScriptRunResource(script);
    const scriptMatchInfo = await this.buildAndSetScriptMatchInfo(script, scriptRes);
    if (scriptMatchInfo) {
      const { apiScript } = await this.buildAndSaveCompliedResource(script, { scriptMatchInfo, scriptRes });
      await this.loadPageScript(scriptMatchInfo, apiScript!);
    }
  }

  init() {
    // 启动gm api
    const permission = new PermissionVerify(this.group.group("permission"), this.mq);
    const gmApi = new GMApi(
      this.systemConfig,
      permission,
      this.group,
      this.msgSender,
      this.mq,
      this.value,
      new GMExternalDependencies(this)
    );
    permission.init();
    gmApi.start();

    this.group.on("stopScript", this.stopScript.bind(this));
    this.group.on("runScript", this.runScript.bind(this));
    this.group.on("pageLoad", this.pageLoad.bind(this));

    // 监听脚本开启
    this.mq.subscribe<TEnableScript[]>("enableScripts", async (data) => {
      for (const { uuid, enable } of data) {
        const script = await this.scriptDAO.get(uuid);
        if (!script) {
          this.logger.error("script enable failed, script not found", {
            uuid: uuid,
          });
          continue;
        }
        if (enable !== (script.status === SCRIPT_STATUS_ENABLE)) {
          // 防止启用停止状态冲突
          this.logger.error("script enable status conflicts", {
            uuid: uuid,
          });
          continue;
        }
        // 如果是普通脚本, 在service worker中进行注册
        // 如果是后台脚本, 在offscreen中进行处理
        if (script.type === SCRIPT_TYPE_NORMAL) {
          // 加载页面脚本
          if (enable) {
            await this.updateResourceOnScriptChange(script);
          } else {
            await this.unregistryPageScript(script.uuid);
            await this.compliedResourceDAO.delete(uuid); // 没启用的删一下, 节省compliedResourceDAO空间
            try {
              // 不管是enable还是disable都需要调用buildAndSetScriptMatchInfo以更新缓存 ??
              await this.buildAndSetScriptMatchInfo(script);
            } catch {
              // 忽略
            }
          }
        }
      }
    });

    // 监听脚本安装
    this.mq.subscribe<TInstallScript>("installScript", async (data) => {
      const script = await this.scriptDAO.get(data.script.uuid);
      if (!script) {
        this.logger.error("script install failed, script not found", {
          uuid: data.script.uuid,
        });
        return;
      }
      const needReRegisterInjectJS = isEarlyStartScript(script.metadata);
      if (script.type === SCRIPT_TYPE_NORMAL) {
        if (script.status === SCRIPT_STATUS_ENABLE) {
          await this.updateResourceOnScriptChange(script);
          // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
          // 不是 earlyStart 的不用重新注入 （没有改变）
          if (needReRegisterInjectJS) await this.reRegisterInjectScript();
        } else {
          // 不管是enable还是disable都需要调用buildAndSetScriptMatchInfo以更新缓存 ??
          const _scriptMatchInfo = await this.buildAndSetScriptMatchInfo(script);
          // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
          // 不是 earlyStart 的不用重新注入 （没有改变）
          if (needReRegisterInjectJS) await this.reRegisterInjectScript();
        }
      }
    });

    // 监听脚本删除
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", async (data) => {
      for (const { uuid } of data) {
        await this.unregistryPageScript(uuid);
        await this.deleteScriptMatch(uuid);
      }
      // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
      await this.reRegisterInjectScript();
    });

    // 监听脚本排序
    this.mq.subscribe<TSortedScript[]>("sortedScripts", async (scripts) => {
      const uuidSort = Object.fromEntries(scripts.map(({ uuid, sort }) => [uuid, sort]));
      this.scriptMatch.setupSorter(uuidSort);
      // 更新缓存
      this.scriptMatchCache!.forEach((matchInfo, uuid) => {
        if (uuid in uuidSort) {
          matchInfo.sort = uuidSort[uuid];
        }
      });
      await this.saveScriptMatchInfo();
    });

    // 监听offscreen环境初始化, 初始化完成后, 再将后台脚本运行起来
    this.mq.subscribe("preparationOffscreen", () => {
      this.scriptDAO.all().then((list) => {
        const res = [];
        for (const script of list) {
          if (script.type === SCRIPT_TYPE_NORMAL) {
            continue;
          }
          res.push({
            uuid: script.uuid,
            enable: script.status === SCRIPT_STATUS_ENABLE,
          });
        }
        if (res.length > 0) {
          this.mq.publish<TEnableScript[]>("enableScripts", res);
        }
      });
    });

    // 监听脚本值变更
    this.mq.subscribe<TScriptValueUpdate>("valueUpdate", async ({ script }: TScriptValueUpdate) => {
      if (!isEarlyStartScript(script.metadata)) {
        return;
      }
      if (script.status === SCRIPT_STATUS_ENABLE) {
        // 如果是预加载脚本，需要更新脚本代码重新注册
        // scriptMatchInfo 里的 value 改变 => complieInjectionCode -> injectionCode 改变
        await this.updateResourceOnScriptChange(script);
      } else {
        try {
          // 不管是enable还是disable都需要调用buildAndSetScriptMatchInfo以更新缓存 ??
          await this.buildAndSetScriptMatchInfo(script);
        } catch {
          // 忽略
        }
      }
    });

    if (chrome.extension.inIncognitoContext) {
      this.systemConfig.addListener("enable_script_incognito", async (enable) => {
        // 隐身窗口不对注册了的脚本进行实际操作
        // 在pageLoad时，根据isLoadScripts进行判断
        this.isLoadScripts = enable && (await this.systemConfig.getEnableScriptNormal());
      });
      this.systemConfig.addListener("enable_script", async (enable) => {
        // 隐身窗口不对注册了的脚本进行实际操作
        // 当主窗口的enable改为false时，isLoadScripts也会更改为false
        this.isLoadScripts = enable && (await this.systemConfig.getEnableScriptIncognito());
      });
    } else {
      this.systemConfig.addListener("enable_script", async (enable) => {
        this.isLoadScripts = enable;
        await this.unregisterUserscripts();
        if (enable) {
          await this.registerUserscripts();
        }
      });
    }

    this.systemConfig.addListener("blacklist", async (blacklist: string) => {
      this.blacklist = obtainBlackList(blacklist);
      this.loadBlacklist();
      // 更新 scriptMatchCache
      this.scriptMatchCache!.forEach(async (matchInfo, uuid) => {
        const o = this.scriptURLPatternResults({
          metadata: matchInfo.metadata,
          originalMetadata: matchInfo.originalMetadata,
          selfMetadata: matchInfo.selfMetadata,
        });
        if (o) {
          matchInfo.scriptUrlPatterns = o.scriptUrlPatterns;
          matchInfo.originalUrlPatterns = o.originalUrlPatterns;
          this.scriptMatchCache!.set(uuid, matchInfo);
        }
      });
      await this.saveScriptMatchInfo();
      // 更新 CompliedResources
      const compliedResources = await this.compliedResourceDAO.gets([...this.scriptMatchCache!.keys()]);
      await Promise.all(
        compliedResources.map((compliedResource) => {
          if (compliedResource) {
            const matchInfo = this.scriptMatchCache!.get(compliedResource.uuid);
            if (matchInfo) {
              const { scriptUrlPatterns, originalUrlPatterns } = matchInfo;
              compliedResource.scriptUrlPatterns = scriptUrlPatterns;
              compliedResource.originalUrlPatterns =
                scriptUrlPatterns === originalUrlPatterns ? null : originalUrlPatterns;
              return this.compliedResourceDAO.save(compliedResource);
            }
          }
        })
      );
      await this.unregisterUserscripts();
      if (this.isUserScriptsAvailable && this.isLoadScripts) {
        // 重新注册用户脚本
        await this.registerUserscripts();
      }
      this.logger.info("blacklist updated", {
        blacklist,
      });
    });

    const onUserScriptAPIGrantAdded = async () => {
      this.isUserScriptsAvailable = true;
      // 注册脚本
      if (this.isLoadScripts) {
        await this.unregisterUserscripts();
        await this.registerUserscripts();
      }
    };

    const onUserScriptAPIGrantRemoved = async () => {
      this.isUserScriptsAvailable = false;
      // 取消当前注册 （如有）
      await this.unregisterUserscripts();
    };

    chrome.permissions.onAdded.addListener((permissions: chrome.permissions.Permissions) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.permissions.onAdded:", lastError);
        return;
      }
      if (permissions.permissions?.includes("userScripts")) {
        // Firefox 或其他浏览器或需要手动启动 optional_permission
        // 启动后注册脚本，不需重启扩充
        onUserScriptAPIGrantAdded();
      }
    });

    chrome.permissions.onRemoved.addListener((permissions: chrome.permissions.Permissions) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.permissions.onRemoved:", lastError);
        return;
      }
      if (permissions.permissions?.includes("userScripts")) {
        // 虽然在目前设计中未有使用 permissions.remove
        // 仅保留作为未来之用
        onUserScriptAPIGrantRemoved();
      }
    });

    // ======== 以下初始化是异步处理，因此扩充载入时可能会优先跑其他同步初始化 ========

    this.initReady = (async () => {
      // 取得初始值
      const [isUserScriptsAvailable, isLoadScripts, strBlacklist, _1, _2] = await Promise.all([
        checkUserScriptsAvailable(),
        this.systemConfig.getEnableScript(),
        this.systemConfig.getBlacklist(),
        this.loadingInitFlagPromise,
        this.loadingInitRegisteredPromise,
      ]);

      // 保存初始值
      this.isUserScriptsAvailable = isUserScriptsAvailable;
      this.isLoadScripts = isLoadScripts;
      this.blacklist = obtainBlackList(strBlacklist);

      // 检查是否开启了开发者模式
      if (!this.isUserScriptsAvailable) {
        // 未开启加上警告引导
        this.showNoDeveloperModeWarning();
      }

      // 初始化：加载黑名单
      this.loadBlacklist();
      // 初始化：userAgentData

      await Promise.all([
        // 初始化：userAgentData
        this.initUserAgentData(),
        // 注册脚本
        this.registerUserscripts(),
      ]);

      this.initReady = true;

      // 初始化完成
      return true;
    })();
  }

  private loadBlacklist() {
    // 设置黑名单match
    const blacklist = this.blacklist; // 重用cache的blacklist阵列 (immutable)

    const scriptUrlPatterns = extractUrlPatterns([...blacklist.map((e) => `@include ${e}`)]);
    this.blackMatch.clearRules("BK");
    this.blackMatch.addRules("BK", scriptUrlPatterns);
  }

  public isUrlBlacklist(url: string) {
    return this.blackMatch.urlMatch(url)[0] === "BK";
  }

  // 取消脚本注册
  async unregisterUserscripts() {
    // 检查 registered 避免重复操作增加系统开支
    if (runtimeGlobal.registered) {
      runtimeGlobal.registered = false;
      // 重置 flag 避免取消注册失败
      // 即使注册失败，通过重置 flag 可避免错误地呼叫已取消注册的Script
      runtimeGlobal.messageFlag = randomMessageFlag();
      await Promise.allSettled([
        chrome.userScripts.unregister(),
        this.localStorageDAO.save({ key: "scriptInjectMessageFlag", value: runtimeGlobal.messageFlag }),
      ]);
    }
  }

  getMessageFlag() {
    return runtimeGlobal.messageFlag;
  }

  getUserScriptRegister(scriptMatchInfo: ScriptMatchInfo, scriptCode: string) {
    const res = getUserScriptRegister(scriptMatchInfo, complieInjectionCode(scriptMatchInfo, scriptCode));
    const { registerScript } = res!;
    // 过滤掉matches为空的脚本
    if (!registerScript.matches || registerScript.matches.length === 0) {
      this.logger.error("registerScript matches is empty", {
        script: scriptMatchInfo.name,
        uuid: scriptMatchInfo.uuid,
      });
      return undefined;
    }
    return registerScript;
  }

  buildAndSaveCompliedResourceNull(script: Script) {
    const result = {
      flag: "",
      name: script.name,
      require: [],
      uuid: script.uuid,
      matches: [],
      includeGlobs: [],
      excludeMatches: [],
      excludeGlobs: [],
      allFrames: false,
      world: "",
      runAt: "",
      scriptUrlPatterns: [],
      originalUrlPatterns: null,
    } as CompliedResource;
    this.compliedResourceDAO.save(result);
    return { compliedResource: result, jsCode: "", apiScript: undefined };
  }

  async buildAndSaveCompliedResource_(
    script: Script,
    o: { scriptMatchInfo: TScriptMatchInfoEntry; scriptRes: ScriptRunResource }
  ) {
    const scriptRes = o.scriptRes;
    const scriptMatchInfo = o.scriptMatchInfo;
    const registerScript = this.getUserScriptRegister(scriptMatchInfo, scriptRes.code);

    if (!registerScript) return this.buildAndSaveCompliedResourceNull(script);

    const scriptUrlPatterns = scriptMatchInfo.scriptUrlPatterns;
    const originalUrlPatterns = scriptMatchInfo.originalUrlPatterns;
    const result = {
      flag: scriptMatchInfo.flag,
      name: script.name,
      require: (script.metadata["require"] || [])
        .map((res) => scriptRes.resource[res]?.url)
        .filter((res) => res) as string[], // 仅储存url
      uuid: script.uuid,
      matches: registerScript.matches || [],
      includeGlobs: registerScript.includeGlobs || [],
      excludeMatches: registerScript.excludeMatches || [],
      excludeGlobs: registerScript.excludeGlobs || [],
      allFrames: registerScript.allFrames || false,
      world: registerScript.world || "",
      runAt: registerScript.runAt || "",
      scriptUrlPatterns: scriptUrlPatterns!,
      originalUrlPatterns: scriptUrlPatterns === originalUrlPatterns ? null : originalUrlPatterns,
    } as CompliedResource;

    this.compliedResourceDAO.save(result);
    return { compliedResource: result, jsCode: registerScript.js[0].code!, apiScript: registerScript };
  }

  async buildAndSaveCompliedResource(
    script: Script,
    o: { scriptMatchInfo?: TScriptMatchInfoEntry; scriptRes?: ScriptRunResource } = {}
  ) {
    // 如果没开启, 则不注册
    if (script.status === SCRIPT_STATUS_ENABLE) {
      const scriptRes = o.scriptRes || (await this.script.buildScriptRunResource(script));
      const scriptMatchInfo = o.scriptMatchInfo || (await this.buildAndSetScriptMatchInfo(script, scriptRes));
      if (scriptMatchInfo) {
        return await this.buildAndSaveCompliedResource_(script, {
          scriptRes,
          scriptMatchInfo,
        });
      }
    }
    return this.buildAndSaveCompliedResourceNull(script);
  }

  async restoreJSCodeFromCompliedResource(result: CompliedResource) {
    const originalCode = await this.script.scriptCodeDAO.get(result.uuid);
    const require: CompileScriptCodeResource["require"] = [];
    for (const requireUrl of result.require) {
      const res = await this.resource.resourceDAO.get(requireUrl);
      if (res) {
        require.push({ url: res.url, content: res.content });
      }
    }
    return compileInjectScriptByFlag(
      result.flag,
      compileScriptCodeByResource({
        name: result.name,
        code: originalCode?.code || "",
        require,
      })
    );
  }

  async getParticularScriptList() {
    const list = await this.scriptDAO.all();
    // 按照脚本顺序位置排序
    list.sort((a, b) => a.sort - b.sort);
    const registerScripts = await Promise.all(
      list.map(async (script) => {
        if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
          return undefined;
        }
        let resultCode = "";
        let result = await this.compliedResourceDAO.get(script.uuid);
        if (!result || !result.require || !result.scriptUrlPatterns?.length) {
          // 按常理不会跑这个
          const ret = await this.buildAndSaveCompliedResource(script);
          result = ret.compliedResource;
          resultCode = ret.jsCode;
        } else {
          resultCode = await this.restoreJSCodeFromCompliedResource(result);
        }
        if (!resultCode) return undefined;

        const registerScript = {
          id: result.uuid,
          js: [{ code: resultCode }],
          matches: result.matches,
          includeGlobs: result.includeGlobs,
          excludeMatches: result.excludeMatches,
          excludeGlobs: result.excludeGlobs,
          allFrames: result.allFrames,
          world: result.world,
        } as chrome.userScripts.RegisteredUserScript;
        if (result.runAt) {
          registerScript.runAt = result.runAt as "document_start" | "document_end" | "document_idle";
        }
        return registerScript;
      })
    ).then(async (res) => {
      // 过滤掉undefined和未开启的
      return res.filter((item) => item) as chrome.userScripts.RegisteredUserScript[];
    });
    return registerScripts;
  }

  // 获取content.js和inject.js的脚本注册信息
  async getContentAndInjectScript() {
    // 黑名单排除
    const blacklist = this.blacklist;
    const excludeMatches = [];
    const excludeGlobs = [];
    const rules = extractUrlPatterns([...blacklist.map((e) => `@include ${e}`)]);
    for (const rule of rules) {
      if (rule.ruleType === RuleType.MATCH_INCLUDE) {
        // matches -> excludeMatches
        excludeMatches.push(rule.patternString);
      } else if (rule.ruleType === RuleType.GLOB_INCLUDE) {
        // includeGlobs -> excludeGlobs
        excludeGlobs.push(rule.patternString);
      }
    }

    const messageFlag = runtimeGlobal.messageFlag;
    // 配置脚本运行环境: 注册时前先准备 chrome.runtime 等设定
    // Firefox MV3 只提供 runtime.sendMessage 及 runtime.connect
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts/WorldProperties#messaging
    try {
      await chrome.userScripts.configureWorld({
        csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
        messaging: true,
      });
    } catch (_e) {
      try {
        await chrome.userScripts.configureWorld({
          messaging: true,
        });
      } catch (_e) {
        console.error("chrome.userScripts.configureWorld({messaging:true}) failed.");
        // do nothing
      }
    }
    const retScript: chrome.userScripts.RegisteredUserScript[] = [];
    retScript.push({
      id: "scriptcat-content",
      js: [{ file: "src/content.js" }],
      matches: ["<all_urls>"],
      allFrames: true,
      runAt: "document_start",
      world: "USER_SCRIPT",
      excludeMatches,
      excludeGlobs,
    });

    // inject.js
    const injectJs = await this.getInjectJsCode();
    if (injectJs) {
      const apiScripts = this.compileInjectUserScript(injectJs, messageFlag, {
        excludeMatches,
        excludeGlobs,
      });
      retScript.push(...apiScripts);
    }

    return retScript;
  }

  // 如果是重复注册，需要先调用 unregisterUserscripts
  async registerUserscripts() {
    // 若 UserScript API 不可使用 或 ScriptCat设定为不启用脚本 则退出
    if (!this.isUserScriptsAvailable || !this.isLoadScripts) return;

    // 判断是否已经注册过
    if (runtimeGlobal.registered) {
      // 异常情况
      // 检查scriptcat-content和scriptcat-inject是否存在
      const res = await chrome.userScripts.getScripts({ ids: ["scriptcat-content", "scriptcat-inject"] });
      if (res.length === 2) {
        return;
      }
      // scriptcat-content/scriptcat-inject不存在的情况
      // 走一次重新注册的流程
      this.logger.warn("registered = true but scriptcat-content/scriptcat-inject not exists, re-register userscripts.");
    }
    // 删除旧注册
    await this.unregisterUserscripts();
    // 使注册时重新注入 chrome.runtime
    try {
      await chrome.userScripts.resetWorldConfiguration();
    } catch (e: any) {
      console.error("chrome.userScripts.resetWorldConfiguration() failed.", e);
    }

    const ts = Date.now();
    const particularScriptList = await this.getParticularScriptList();
    // getContentAndInjectScript依赖loadScriptMatchInfo
    // 需要等getParticularScriptList完成后再执行
    const generalScriptList = await this.getContentAndInjectScript();
    console.log("ts: ", Date.now() - ts);

    const list: chrome.userScripts.RegisteredUserScript[] = [...particularScriptList, ...generalScriptList];

    runtimeGlobal.registered = true;
    try {
      await chrome.userScripts.register(list);
    } catch (e: any) {
      this.logger.error("batch registration error", Logger.E(e));
      // 批量注册失败则退回单个注册
      for (const script of list) {
        try {
          await chrome.userScripts.register([script]);
        } catch (e: any) {
          if (e.message?.includes("Duplicate script ID")) {
            // 如果是重复注册, 则更新
            try {
              await chrome.userScripts.update([script]);
            } catch (e) {
              this.logger.error("update error", Logger.E(e));
            }
          } else {
            this.logger.error("register error", Logger.E(e));
          }
        }
      }
    }
  }

  // 给指定tab发送消息
  sendMessageToTab(to: ExtMessageSender, action: string, data: any) {
    if (to.tabId === -1) {
      // 如果是-1, 代表给offscreen发送消息
      return sendMessage(this.msgSender, "offscreen/runtime/" + action, data);
    }
    return sendMessage(
      new ExtensionContentMessageSend(to.tabId, {
        documentId: to.documentId,
        frameId: to.frameId,
      }),
      "content/runtime/" + action,
      data
    );
  }

  // 给指定脚本触发事件
  emitEventToTab(to: ExtMessageSender, req: EmitEventRequest) {
    if (to.tabId === -1) {
      // 如果是-1, 代表给offscreen发送消息
      return sendMessage(this.msgSender, "offscreen/runtime/emitEvent", req);
    }
    return sendMessage(
      new ExtensionContentMessageSend(to.tabId, {
        documentId: to.documentId,
        frameId: to.frameId,
      }),
      "content/runtime/emitEvent",
      req
    );
  }

  getPageScriptMatchingResultByUrl(url: string, includeNonEffective: boolean = false) {
    // 返回当前页面匹配的uuids
    // 如果有使用自定义排除，原本脚本定义的会返回 uuid{Ori}
    // 因此基于自定义排除页面被排除的情况下，结果只包含 uuid{Ori} 而不包含 uuid
    const matchedUuids = this.scriptMatch.urlMatch(url!);
    const ret = new Map<string, { uuid: string; effective: boolean; matchInfo?: TScriptMatchInfoEntry }>();
    const scriptMatchCache = this.scriptMatchCache!;
    for (const e of matchedUuids) {
      const uuid = e.endsWith(ORIGINAL_URLMATCH_SUFFIX) ? e.slice(0, -ORIGINAL_URLMATCH_SUFFIX.length) : e;
      if (!includeNonEffective && uuid !== e) continue;
      const o = ret.get(uuid) || { uuid, effective: false };
      // 只包含 uuid{Ori} 而不包含 uuid 的情况，effective = false
      if (e === uuid) {
        o.effective = true;
      }
      // 把匹配脚本的资料从 cache 取出来
      o.matchInfo = scriptMatchCache.get(uuid);
      ret.set(uuid, o);
    }
    // ret 只包含 uuid 为键的 matchingResult
    return ret;
  }

  async updateSites() {
    if (this.sitesLoaded.size === 0 || this.updateSitesBusy) return;
    this.updateSitesBusy = true;
    const list = [...this.sitesLoaded];
    this.sitesLoaded.clear();
    const currentSites = (await this.localStorageDAO.getValue<ScriptSite>("sites")) || ({} as ScriptSite);
    const sets: Partial<Record<string, Set<string>>> = {};
    for (const str of list) {
      const [uuid, domain] = str.split("|");
      const s = sets[uuid] || (sets[uuid] = new Set([] as string[]));
      s.add(domain);
    }
    for (const uuid in sets) {
      const s = new Set([...sets[uuid]!, ...(currentSites[uuid] || ([] as string[]))]);
      const arr = (currentSites[uuid] = [...s]);
      if (arr.length > 50) arr.length = 50;
    }
    await this.localStorageDAO.saveValue("sites", currentSites);
    this.updateSitesBusy = false;
    if (this.sitesLoaded.size > 0) {
      Promise.resolve().then(() => this.updateSites());
    }
  }

  async pageLoad(_: any, sender: IGetSender) {
    if (!this.isLoadScripts) {
      return { flag: "", scripts: [] };
    }
    const chromeSender = sender.getSender();
    if (!chromeSender?.url) {
      // 异常加载
      return { flag: "", scripts: [] };
    }

    // 判断是否黑名单（针对网址，与个别脚本设定无关）
    if (this.isUrlBlacklist(chromeSender.url!)) {
      // 如果在黑名单中, 则不加载脚本
      return { flag: "", scripts: [] };
    }

    const scriptFlag = this.getMessageFlag();

    // 匹配当前页面的脚本（只包含有效脚本。自定义排除了的不包含）
    const matchingResult = this.getPageScriptMatchingResultByUrl(chromeSender.url!);

    const enableScript = [] as ScriptLoadInfo[];

    for (const [_uuid, o] of matchingResult) {
      // 物件部份内容预设为空
      const scriptRes = Object.assign({}, o.matchInfo, {
        code: "",
        value: {},
        resource: {},
        metadataStr: "",
        userConfigStr: "",
      }) as ScriptLoadInfo;
      // 判断脚本是否开启
      if (scriptRes.status === SCRIPT_STATUS_DISABLE) {
        continue;
      }
      // 判断注入页面类型
      if (scriptRes.metadata["run-in"]) {
        const runIn = scriptRes.metadata["run-in"][0];
        if (runIn !== "all") {
          // 判断插件运行环境
          const contextType = chrome.extension.inIncognitoContext ? "incognito-tabs" : "normal-tabs";
          if (runIn !== contextType) {
            continue;
          }
        }
      }
      // 如果是iframe,判断是否允许在iframe里运行
      if (chromeSender.frameId) {
        if (scriptRes.metadata.noframes) {
          continue;
        }
      }
      enableScript.push(scriptRes);
    }

    const scriptCodes = {} as Record<string, string>;
    // 更新资源使用了file协议的脚本
    const scriptsWithUpdatedResources = new Map<string, ScriptLoadInfo>();
    for (const scriptRes of enableScript) {
      if (scriptRes.resourceCheck) {
        let resourceUpdated = false;
        for (const [url, [sha512, type]] of Object.entries(scriptRes.resourceCheck)) {
          const resourceList = scriptRes.metadata[type];
          if (!resourceList) continue;
          const updatedResource = await this.resource.updateResource(scriptRes.uuid, url, type);
          if (updatedResource.hash?.sha512 !== sha512) {
            for (const uri of resourceList) {
              /** 资源键名 */
              let resourceKey = uri;
              /** 文件路径 */
              let path: string | null = uri;
              if (type === "resource") {
                // @resource xxx https://...
                const split = uri.split(/\s+/);
                if (split.length === 2) {
                  resourceKey = split[0];
                  path = split[1].trim();
                } else {
                  path = null;
                }
              }
              if (path === url) {
                const r = scriptRes.resource[resourceKey];
                if (r) {
                  resourceUpdated = true;
                  r.content = updatedResource.content;
                  r.contentType = updatedResource.contentType;
                  r.createtime = updatedResource.createtime;
                  r.hash = updatedResource.hash;
                  r.link = updatedResource.link;
                  r.type = updatedResource.type;
                  r.updatetime = updatedResource.updatetime;
                }
              }
            }
          }
        }
        if (resourceUpdated) {
          scriptsWithUpdatedResources.set(scriptRes.uuid, scriptRes);
          scriptCodes[scriptRes.uuid] = scriptRes.code || "";
        }
      }
    }

    const { value, resource, scriptDAO } = this;
    await Promise.all(
      enableScript.flatMap((script) => [
        // 加载value
        value.getScriptValue(script!).then((value) => {
          script.value = value;
        }),
        // 加载resource
        resource.getScriptResources(script, false).then((resource) => {
          script.resource = resource;
          for (const name of Object.keys(resource)) {
            const res = script.resource[name];
            // 删除base64以节省资源
            // 如果有content就删除base64
            if (res.content) {
              res.base64 = undefined;
            }
          }
        }),
        // 加载code相关的信息
        scriptDAO.scriptCodeDAO.get(script.uuid).then((code) => {
          if (code) {
            const metadataStr = getMetadataStr(code.code) || "";
            const userConfigStr = getUserConfigStr(code.code) || "";
            const userConfig = parseUserConfig(userConfigStr);
            script.metadataStr = metadataStr;
            script.userConfigStr = userConfigStr;
            script.userConfig = userConfig;
            if (scriptCodes[script.uuid] === "") {
              scriptCodes[script.uuid] = code.code;
            }
          }
        }),
      ])
    );

    if (scriptsWithUpdatedResources.size) {
      const scriptRegisterInfoList = (
        await chrome.userScripts.getScripts({
          ids: [...scriptsWithUpdatedResources.keys()],
        })
      ).filter((scriptRegisterInfo) => {
        const targetUUID = scriptRegisterInfo.id;
        const scriptRes = scriptsWithUpdatedResources.get(targetUUID);
        const scriptDAOCode = scriptCodes[targetUUID];
        if (scriptRes && scriptDAOCode) {
          const scriptCode = compileScriptCode(scriptRes, scriptDAOCode);
          const scriptInjectCode = complieInjectionCode(scriptRes, scriptCode);
          scriptRegisterInfo.js = [
            {
              code: scriptInjectCode,
            },
          ];
          return true;
        }
        return false;
      });
      // 批量更新
      if (scriptRegisterInfoList.length) {
        try {
          await chrome.userScripts.update(scriptRegisterInfoList);
        } catch (e) {
          this.logger.error("update registered userscripts error", Logger.E(e));
        }
      }
    }
    this.mq.emit("pageLoad", {
      tabId: chromeSender.tab?.id || -1,
      frameId: chromeSender.frameId,
      scripts: enableScript,
    });

    let domain = "";
    try {
      const url = chromeSender.url ? new URL(chromeSender.url) : null;
      if (url?.protocol?.startsWith("http")) {
        domain = url.hostname;
      }
    } catch {
      // ignore
    }
    if (domain) {
      for (const script of enableScript) {
        this.sitesLoaded.add(`${script.uuid}|${domain}`);
      }
      Promise.resolve().then(() => this.updateSites());
    }

    return {
      flag: scriptFlag,
      scripts: enableScript,
      envInfo: {
        sandboxMode: "raw",
        isIncognito: chrome.extension?.inIncognitoContext ?? undefined,
        userAgentData: this.userAgentData ?? undefined,
      } as GMInfoEnv,
    };
  }

  // 停止脚本
  async stopScript(uuid: string) {
    return await stopScript(this.msgSender, uuid);
  }

  // 运行脚本
  async runScript(uuid: string) {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return;
    }
    const res = await this.script.buildScriptRunResource(script);
    return await runScript(this.msgSender, res);
  }

  compileInjectUserScript(injectJs: string, messageFlag: string, o: Record<string, any>) {
    // 替换ScriptFlag
    const earlyScriptFlag: string[] = [];
    // 遍历early-start的脚本
    this.scriptMatchCache!.forEach((script) => {
      if (isEarlyStartScript(script.metadata)) {
        earlyScriptFlag.push(script.flag);
      }
    });

    // 构建inject.js的脚本注册信息
    const code = `(function (MessageFlag, EarlyScriptFlag) {\n${injectJs}\n})('${messageFlag}', ${JSON.stringify(earlyScriptFlag)})`;
    const script: chrome.userScripts.RegisteredUserScript = {
      id: "scriptcat-inject",
      js: [{ code }],
      matches: ["<all_urls>"],
      allFrames: true,
      world: "MAIN",
      runAt: "document_start",
      excludeMatches: o.excludeMatches,
      excludeGlobs: o.excludeGlobs,
    };

    // 构建给content.js用的early-start脚本flag
    return [
      {
        id: "scriptcat-early-start-flag",
        js: [{ code: "window.EarlyScriptFlag=" + JSON.stringify(earlyScriptFlag) + ";" }],
        matches: ["<all_urls>"],
        allFrames: true,
        world: "USER_SCRIPT",
        runAt: "document_start",
        excludeMatches: o.excludeMatches,
        excludeGlobs: o.excludeGlobs,
      },
      script,
    ] as chrome.userScripts.RegisteredUserScript[];
  }

  // 重新注册inject.js，主要是为了更新early-start的脚本flag
  async reRegisterInjectScript() {
    // 若 UserScript API 不可使用 或 ScriptCat设定为不启用脚本 则退出
    if (!this.isUserScriptsAvailable || !this.isLoadScripts) return;
    const messageFlag = this.getMessageFlag();
    const [scripts, injectJs] = await Promise.all([
      chrome.userScripts.getScripts({ ids: ["scriptcat-inject"] }),
      this.getInjectJsCode(),
    ]);

    if (!messageFlag || !scripts?.[0] || !injectJs) {
      return;
    }
    const apiScripts = this.compileInjectUserScript(injectJs, messageFlag, scripts[0]);
    try {
      await chrome.userScripts.update(apiScripts);
    } catch (e: any) {
      this.logger.error("register inject.js error", Logger.E(e));
    }
  }

  // 一般情况下请不要直接访问 loadingScript 此变数 （私有变数）
  loadingScript: Promise<void> | null = null;

  // 保存脚本匹配信息
  async saveScriptMatchInfo() {
    return await cacheInstance.set("scriptMatch", Object.fromEntries(this.scriptMatchCache!));
  }

  scriptMatchEntry(
    scriptRes: ScriptRunResource,
    o: {
      scriptUrlPatterns: URLRuleEntry[];
      originalUrlPatterns: URLRuleEntry[];
    }
  ) {
    const { uuid } = scriptRes;
    const { scriptUrlPatterns, originalUrlPatterns } = o;

    const matchInfoEntry = this.createMatchInfoEntry(scriptRes, {
      scriptUrlPatterns: scriptUrlPatterns,
      originalUrlPatterns: originalUrlPatterns === scriptUrlPatterns ? null : originalUrlPatterns,
    });
    const uuidOri = `${uuid}${ORIGINAL_URLMATCH_SUFFIX}`;
    // 清理一下老数据
    this.scriptMatch.clearRules(uuid);
    this.scriptMatch.clearRules(uuidOri);
    // 添加新的数据
    this.scriptMatch.addRules(uuid, scriptUrlPatterns);
    if (matchInfoEntry.originalUrlPatterns && originalUrlPatterns !== scriptUrlPatterns) {
      this.scriptMatch.addRules(uuidOri, originalUrlPatterns);
    }
    return matchInfoEntry;
  }

  async updateScriptStatus(uuid: string, status: SCRIPT_STATUS) {
    const script = this.scriptMatchCache!.get(uuid);
    if (script) {
      script.status = status;
      await this.saveScriptMatchInfo();
    }
  }

  async deleteScriptMatch(uuid: string) {
    this.scriptMatchCache!.delete(uuid);
    this.scriptMatch.clearRules(uuid);
    this.scriptMatch.clearRules(`${uuid}${ORIGINAL_URLMATCH_SUFFIX}`);
    await this.saveScriptMatchInfo();
  }

  scriptURLPatternResults(scriptRes: {
    metadata: SCMetadata;
    originalMetadata: SCMetadata;
    selfMetadata?: SCMetadata;
  }): {
    scriptUrlPatterns: URLRuleEntry[];
    originalUrlPatterns: URLRuleEntry[];
  } | null {
    const { metadata, originalMetadata } = scriptRes;
    const metaMatch = metadata.match;
    const metaInclude = metadata.include;
    const metaExclude = metadata.exclude;
    if ((metaMatch?.length ?? 0) + (metaInclude?.length ?? 0) === 0) {
      return null;
    }

    // 黑名单排除
    const blacklist = this.blacklist;

    const scriptUrlPatterns = extractUrlPatterns([
      ...(metaMatch || []).map((e) => `@match ${e}`),
      ...(metaInclude || []).map((e) => `@include ${e}`),
      ...(metaExclude || []).map((e) => `@exclude ${e}`),
      ...(blacklist || []).map((e) => `@exclude ${e}`),
    ]);

    // 如果使用了自定义排除，无法在脚本原有的网域看到匹配情况
    // 所有统一把原本的pattern都解析一下

    const selfMetadata = scriptRes.selfMetadata;
    const originalUrlPatterns: URLRuleEntry[] | null =
      selfMetadata?.match || selfMetadata?.include || selfMetadata?.exclude
        ? extractUrlPatterns([
            ...(originalMetadata.match || []).map((e) => `@match ${e}`),
            ...(originalMetadata.include || []).map((e) => `@include ${e}`),
            ...(originalMetadata.exclude || []).map((e) => `@exclude ${e}`),
            ...(blacklist || []).map((e) => `@exclude ${e}`),
          ])
        : scriptUrlPatterns;

    return { scriptUrlPatterns, originalUrlPatterns };
  }

  async buildAndSetScriptMatchInfo(script: Script, scriptRes_?: ScriptRunResource) {
    const scriptRes = scriptRes_ || (await this.script.buildScriptRunResource(script));
    const o = this.scriptURLPatternResults(scriptRes);
    if (!o) {
      return undefined;
    }
    // 构建脚本匹配信息
    const scriptMatchInfo = this.scriptMatchEntry(scriptRes, o);
    // 把脚本信息放入缓存中
    this.scriptMatchCache!.set(scriptRes.uuid, scriptMatchInfo);
    await this.saveScriptMatchInfo();
    return scriptMatchInfo;
  }

  // 加载页面脚本, 会把脚本信息放入缓存中
  // 如果脚本开启, 则注册脚本
  async loadPageScript(scriptMatchInfo: ScriptMatchInfo, registerScript_: chrome.userScripts.RegisteredUserScript) {
    // 如果脚本开启, 则注册脚本
    if (!this.isUserScriptsAvailable || !this.isLoadScripts || scriptMatchInfo.status !== SCRIPT_STATUS_ENABLE) {
      return;
    }
    const { name, uuid } = scriptMatchInfo;
    const registerScript = registerScript_;
    const res: chrome.userScripts.RegisteredUserScript | undefined = (
      await chrome.userScripts.getScripts({ ids: [uuid] })
    )?.[0];
    const logger = LoggerCore.logger({
      name,
      registerMatch: {
        matches: registerScript.matches,
        excludeMatches: registerScript.excludeMatches,
      },
    });
    if (res) {
      try {
        await chrome.userScripts.update([registerScript]);
      } catch (e) {
        logger.error("update registerScript error", Logger.E(e));
      }
    } else {
      try {
        await chrome.userScripts.register([registerScript]);
      } catch (e) {
        logger.error("registerScript error", Logger.E(e));
      }
    }
  }

  async unregistryPageScript(uuid: string) {
    if (!this.isUserScriptsAvailable || !this.isLoadScripts) {
      return;
    }
    const result = await chrome.userScripts.getScripts({ ids: [uuid] });
    if (result.length === 1) {
      // 修改脚本状态为disable，浏览器取消注册该脚本
      await Promise.all([
        this.updateScriptStatus(uuid, SCRIPT_STATUS_DISABLE),
        chrome.userScripts.unregister({ ids: [uuid] }),
      ]);
    }
  }
}
