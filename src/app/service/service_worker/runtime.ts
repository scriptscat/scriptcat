import type { EmitEventRequest, ScriptLoadInfo, ScriptMatchInfo } from "./types";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { Group, IGetSender } from "@Packages/message/server";
import type { ExtMessageSender, MessageSend } from "@Packages/message/types";
import type { Script, ScriptDAO, ScriptRunResource, ScriptSite } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { type ValueService } from "./value";
import GMApi, { GMExternalDependencies } from "./gm_api";
import type { TDeleteScript, TEnableScript, TInstallScript, TScriptValueUpdate, TSortedScript } from "../queue";
import { type ScriptService } from "./script";
import { runScript, stopScript } from "../offscreen/client";
import {
  buildScriptRunResourceBasic,
  compileInjectionCode,
  getUserScriptRegister,
  scriptURLPatternResults,
} from "./utils";
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
  compileScriptCodeByResource,
  getScriptFlag,
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
import type { CompiledResource, ResourceType } from "@App/app/repo/resource";
import { CompiledResourceDAO } from "@App/app/repo/resource";
import { setOnTabURLChanged } from "./url_monitor";

const ORIGINAL_URLMATCH_SUFFIX = "{ORIGINAL}"; // 用于标记原始URLPatterns的后缀

const runtimeGlobal = {
  registered: false,
  messageFlag: "PENDING",
};

export class RuntimeService {
  earlyScriptFlags = new Set<string>();
  scriptMatchEnable: UrlMatch<string> = new UrlMatch<string>();
  scriptMatchDisable: UrlMatch<string> = new UrlMatch<string>();
  blackMatch: UrlMatch<string> = new UrlMatch<string>();

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
  blacklistExcludeMatches: string[] = [];
  blacklistExcludeGlobs: string[] = [];

  // 获取inject.js内容时调用，需要预先调用preInject
  injectJsCodePromise: Promise<string | undefined> | null = null;

  // initReady
  initReady: Promise<boolean> | boolean = false;

  mq: IMessageQueue;

  sitesLoaded: Set<string> = new Set<string>();
  updateSitesBusy: boolean = false;

  loadingInitFlagPromise: Promise<any> | undefined;
  loadingInitProcessPromise: Promise<any> | undefined;
  initialCompiledResourcePromise: Promise<any> | undefined;

  compiledResourceDAO: CompiledResourceDAO = new CompiledResourceDAO();

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private msgSender: MessageSend,
    mq: IMessageQueue,
    private value: ValueService,
    public script: ScriptService,
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
        try {
          const platformInfo = await chrome.runtime.getPlatformInfo();
          this.userAgentData.architecture = platformInfo.nacl_arch;
          this.userAgentData.bitness = platformInfo.arch.includes("64") ? "64" : "32";
        } catch (e) {
          // 避免 API 无法执行的问题。不影响整体运作
          console.warn(e);
        }
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
    // 优化性能，将不需要的信息去掉
    // 而且可能会超过缓存的存储限制
    const matchInfo = {
      ...scriptRes,
      scriptUrlPatterns: o.scriptUrlPatterns,
      originalUrlPatterns: o.originalUrlPatterns === null ? o.scriptUrlPatterns : o.originalUrlPatterns,
      code: "",
      value: {},
      resource: {},
    } as ScriptMatchInfo;
    return matchInfo;
  }

  async waitInit() {
    const [cRuntimeStartFlag, compiledResources, allScripts] = await Promise.all([
      cacheInstance.get<boolean>("runtimeStartFlag"),
      this.compiledResourceDAO.all(),
      this.scriptDAO.all(),
    ]);

    const unregisterScriptIds = [] as string[];
    // 没有 CompiledResources 表示这是 没有启用脚本 或 代码有改变需要重新安装。
    // 这个情况会把所有有效脚本跟Inject&Content脚本先取消注册。后续载入时会重新以新代码注册。
    const cleanUpPreviousRegister = !compiledResources.length;
    this.initialCompiledResourcePromise = Promise.all(
      allScripts.map(async (script) => {
        const uuid = script.uuid;
        const isNormalScript = script.type === SCRIPT_TYPE_NORMAL;
        const enable = script.status === SCRIPT_STATUS_ENABLE;

        if (isNormalScript && enable && isEarlyStartScript(script.metadata)) {
          this.earlyScriptFlags.add(uuid);
        } else {
          this.earlyScriptFlags.delete(uuid);
        }

        if (!isNormalScript || !enable) {
          // 确保浏览器没有残留 PageScripts
          if (uuid) unregisterScriptIds.push(uuid);
        } else if (cleanUpPreviousRegister) {
          // CompiledResourceNamespace 修改后先反注册残留脚本，之后再重新加载 PageScripts
          if (uuid) unregisterScriptIds.push(uuid);
        }

        if (isNormalScript) {
          let compiledResource = await this.compiledResourceDAO.get(uuid);
          if (!compiledResource) {
            const ret = await this.buildAndSaveCompiledResourceFromScript(script, false);
            compiledResource = ret?.compiledResource;
          }
          if (!compiledResource?.scriptUrlPatterns) {
            throw new Error(`No valid scriptUrlPatterns. Script UUID: ${uuid}`);
          }

          const { scriptUrlPatterns, originalUrlPatterns } = compiledResource;
          const uuidOri = `${uuid}${ORIGINAL_URLMATCH_SUFFIX}`;
          // 添加新的数据
          const scriptMatch = enable ? this.scriptMatchEnable : this.scriptMatchDisable;
          scriptMatch.addRules(uuid, scriptUrlPatterns);
          if (originalUrlPatterns !== null && originalUrlPatterns !== scriptUrlPatterns) {
            scriptMatch.addRules(uuidOri, originalUrlPatterns);
          }
        }
      })
    );
    if (cleanUpPreviousRegister) {
      // 先反注册残留脚本
      unregisterScriptIds.push("scriptcat-early-start-flag", "scriptcat-inject", "scriptcat-content");
    }
    if (unregisterScriptIds.length) {
      // 忽略 UserScripts API 无法执行
      await Promise.allSettled([this.unregistryPageScripts(unregisterScriptIds, true)]); // ignore success or fail
    }
    if (!cRuntimeStartFlag) {
      await cacheInstance.set<boolean>("runtimeStartFlag", true);
    }

    let registered = false;
    try {
      const res = await chrome.userScripts.getScripts({ ids: ["scriptcat-content", "scriptcat-inject"] });
      registered = res.length === 2;
    } finally {
      // 考虑 UserScripts API 不可使用等情况
      runtimeGlobal.registered = registered;
    }
  }

  async updateResourceOnScriptChange(script: Script) {
    if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
      throw new Error("Invalid Calling of updateResourceOnScriptChange");
    }
    // 安装，启用，或earlyStartScript的value更新
    const ret = await this.buildAndSaveCompiledResourceFromScript(script, true);
    if (!ret) return;
    const { apiScript } = ret;
    await this.loadPageScript(script, apiScript!);
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
      let needReRegisterInjectJS = false;
      const unregisteyUuids = [] as string[];
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
        // 脚本类别不会更改
        if (script.type === SCRIPT_TYPE_NORMAL) {
          const isEarlyStart = isEarlyStartScript(script.metadata);
          if (isEarlyStart && enable) {
            this.earlyScriptFlags.add(uuid);
          } else {
            this.earlyScriptFlags.delete(uuid);
          }
          if (isEarlyStart) {
            needReRegisterInjectJS = true;
          }
          // 加载页面脚本
          if (enable) {
            await this.updateResourceOnScriptChange(script);
          } else {
            unregisteyUuids.push(uuid);
          }
        }
      }
      await this.unregistryPageScripts(unregisteyUuids);
      if (needReRegisterInjectJS) await this.reRegisterInjectScript();
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
      // 代码更新时脚本类别不会更改
      if (script.type === SCRIPT_TYPE_NORMAL) {
        const needReRegisterInjectJS = isEarlyStartScript(script.metadata);
        const enable = script.status === SCRIPT_STATUS_ENABLE;
        if (needReRegisterInjectJS && enable) {
          this.earlyScriptFlags.add(script.uuid);
        } else {
          this.earlyScriptFlags.delete(script.uuid);
        }
        if (enable) {
          await this.updateResourceOnScriptChange(script);
        } else {
          // 还是要建立 CompiledResoure, 否则 Popup 看不到 Script
          await this.buildAndSaveCompiledResourceFromScript(script, false);
        }
        // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
        // 不是 earlyStart 的不用重新注入 （没有改变）
        if (needReRegisterInjectJS) await this.reRegisterInjectScript();
      }
    });

    // 监听脚本删除
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", async (data) => {
      let needReRegisterInjectJS = false;
      const unregisteyUuids = [] as string[];
      for (const { uuid, type, isEarlyStart } of data) {
        unregisteyUuids.push(uuid);
        this.earlyScriptFlags.delete(uuid);
        this.scriptMatchEnable.clearRules(uuid);
        this.scriptMatchEnable.clearRules(`${uuid}${ORIGINAL_URLMATCH_SUFFIX}`);
        this.scriptMatchDisable.clearRules(uuid);
        this.scriptMatchDisable.clearRules(`${uuid}${ORIGINAL_URLMATCH_SUFFIX}`);
        if (type === SCRIPT_TYPE_NORMAL && isEarlyStart) {
          needReRegisterInjectJS = true;
        }
      }
      await this.unregistryPageScripts(unregisteyUuids);
      if (needReRegisterInjectJS) {
        // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
        await this.reRegisterInjectScript();
      }
    });

    // 监听脚本排序
    this.mq.subscribe<TSortedScript[]>("sortedScripts", async (scripts) => {
      const uuidSort = Object.fromEntries(scripts.map(({ uuid, sort }) => [uuid, sort]));
      this.scriptMatchEnable.setupSorter(uuidSort);
      this.scriptMatchDisable.setupSorter(uuidSort);
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
      if (script.status === SCRIPT_STATUS_ENABLE && isEarlyStartScript(script.metadata)) {
        // 如果是预加载脚本，需要更新脚本代码重新注册
        // scriptMatchInfo 里的 value 改变 => compileInjectionCode -> injectionCode 改变
        await this.updateResourceOnScriptChange(script);
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
      await this.unregisterUserscripts();
      if (this.isUserScriptsAvailable && this.isLoadScripts) {
        // 重新注册用户脚本；注册是会用加入 blacklistExcludeMatches 和 blacklistExcludeGlobs
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

    // waitInit 优先处理 （包括处理重启问题）
    this.loadingInitProcessPromise = this.waitInit();

    this.initReady = (async () => {
      // 取得初始值 或 等待各种异步同时进行的初始化 (_1, _2, ...)
      const [isUserScriptsAvailable, isLoadScripts, strBlacklist, _1, _2, _3] = await Promise.all([
        checkUserScriptsAvailable(),
        this.systemConfig.getEnableScript(),
        this.systemConfig.getBlacklist(),
        this.loadingInitFlagPromise, // messageFlag 初始化等待
        this.loadingInitProcessPromise, // 初始化程序等待
        this.initUserAgentData(), // 初始化：userAgentData
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

      // 或许能加快PageLoad的载入速度。subframe 的 URL 不捕捉。
      setOnTabURLChanged((newUrl: string) => {
        if (!this.isUrlBlacklist(newUrl)) {
          this.scriptMatchEnable.urlMatch(newUrl);
        }
      });

      // 注册脚本
      await this.initialCompiledResourcePromise; // 先等待 CompiledResource 完成避免注册时重复生成
      await this.registerUserscripts();

      this.initReady = true;

      // 初始化完成
      return true;
    })();
  }

  public loadBlacklist() {
    // 设置黑名单match
    const blacklist = this.blacklist; // 重用cache的blacklist阵列 (immutable)

    const rules = extractUrlPatterns([...blacklist.map((e) => `@include ${e}`)]);
    this.blackMatch.clearRules("BK");
    this.blackMatch.addRules("BK", rules);

    // 黑名单排除
    const excludeMatches = [];
    const excludeGlobs = [];
    for (const rule of rules) {
      if (rule.ruleType === RuleType.MATCH_INCLUDE) {
        // matches -> excludeMatches
        excludeMatches.push(rule.patternString);
      } else if (rule.ruleType === RuleType.GLOB_INCLUDE) {
        // includeGlobs -> excludeGlobs
        excludeGlobs.push(rule.patternString);
      }
    }
    this.blacklistExcludeMatches = excludeMatches;
    this.blacklistExcludeGlobs = excludeGlobs;
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

  async buildAndSaveCompiledResourceFromScript(script: Script, withCode: boolean = false) {
    const scriptRes = withCode ? await this.script.buildScriptRunResource(script) : buildScriptRunResourceBasic(script);
    const resources = withCode ? scriptRes.resource : await this.resource.getScriptResources(scriptRes, true);
    const resourceUrls = (script.metadata["require"] || []).map((res) => resources[res]?.url).filter((res) => res);
    const scriptMatchInfo = await this.applyScriptMatchInfo(scriptRes);
    if (!scriptMatchInfo) return undefined;

    const res = getUserScriptRegister(scriptMatchInfo);
    const registerScript = res.registerScript;

    let jsCode = "";
    if (withCode) {
      const code = compileInjectionCode(scriptRes, scriptRes.code);
      registerScript.js[0].code = jsCode = code;
    }

    // 过滤掉matches为空的脚本
    if (!registerScript.matches || registerScript.matches.length === 0) {
      this.logger.error("registerScript matches is empty", {
        script: script.name,
        uuid: script.uuid,
      });
      return undefined;
    }

    const scriptUrlPatterns = scriptMatchInfo.scriptUrlPatterns;
    const originalUrlPatterns = scriptMatchInfo.originalUrlPatterns;
    const result = {
      flag: scriptRes.flag,
      name: script.name,
      require: resourceUrls, // 仅储存url
      uuid: script.uuid,
      matches: registerScript.matches || [],
      includeGlobs: registerScript.includeGlobs || [],
      excludeMatches: registerScript.excludeMatches || [],
      excludeGlobs: registerScript.excludeGlobs || [],
      allFrames: registerScript.allFrames || false,
      world: registerScript.world || "",
      runAt: registerScript.runAt || "",
      scriptUrlPatterns: scriptUrlPatterns,
      originalUrlPatterns: scriptUrlPatterns === originalUrlPatterns ? null : originalUrlPatterns,
    } as CompiledResource;

    this.compiledResourceDAO.save(result);

    return { compiledResource: result, jsCode, apiScript: registerScript };
  }

  // 从CompiledResource中还原脚本代码
  async restoreJSCodeFromCompiledResource(script: Script, result: CompiledResource) {
    const earlyScript = isEarlyStartScript(script.metadata);
    // 如果是预加载脚本，需要另外的处理方式
    if (earlyScript) {
      const scriptRes = await this.script.buildScriptRunResource(script);
      if (!scriptRes) return "";
      return compileInjectionCode(scriptRes, scriptRes.code);
    }

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

  async getParticularScriptList({
    excludeMatches,
    excludeGlobs,
  }: {
    excludeMatches: string[];
    excludeGlobs: string[];
  }) {
    const list = await this.scriptDAO.all();
    // 按照脚本顺序位置排序
    list.sort((a, b) => a.sort - b.sort);
    const registerScripts = await Promise.all(
      list.map(async (script) => {
        if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
          return undefined;
        }
        let resultCode = "";
        let result = await this.compiledResourceDAO.get(script.uuid);
        if (!result || !result.scriptUrlPatterns?.length) {
          // 按常理不会跑这个
          const ret = await this.buildAndSaveCompiledResourceFromScript(script, true);
          if (!ret) return undefined;
          result = ret.compiledResource;
          resultCode = ret.jsCode;
        } else {
          resultCode = await this.restoreJSCodeFromCompiledResource(script, result);
        }
        if (!resultCode) return undefined;
        const registerScript = {
          id: result.uuid,
          js: [{ code: resultCode }],
          matches: result.matches,
          includeGlobs: result.includeGlobs,
          excludeMatches: [...result.excludeMatches, ...excludeMatches],
          excludeGlobs: [...result.excludeGlobs, ...excludeGlobs],
          allFrames: result.allFrames,
          world: result.world,
        } as chrome.userScripts.RegisteredUserScript;
        if (result.runAt) {
          registerScript.runAt = result.runAt as chrome.extensionTypes.RunAt;
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
  async getContentAndInjectScript({
    excludeMatches,
    excludeGlobs,
  }: {
    excludeMatches: string[];
    excludeGlobs: string[];
  }) {
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
    // 若 UserScripts API 不可使用 或 ScriptCat设定为不启用脚本 则退出
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

    const options = {
      excludeMatches: this.blacklistExcludeMatches,
      excludeGlobs: this.blacklistExcludeGlobs,
    };

    const particularScriptList = await this.getParticularScriptList(options);
    // getContentAndInjectScript依赖loadScriptMatchInfo
    // 需要等getParticularScriptList完成后再执行
    const generalScriptList = await this.getContentAndInjectScript(options);

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

  getPageScriptMatchingResultByUrl(
    url: string,
    includeDisabled: boolean = false,
    includeNonEffective: boolean = false
  ) {
    // 返回当前页面匹配的uuids
    // 如果有使用自定义排除，原本脚本定义的会返回 uuid{Ori}
    // 因此基于自定义排除页面被排除的情况下，结果只包含 uuid{Ori} 而不包含 uuid
    let matchedUuids = this.scriptMatchEnable.urlMatch(url!);
    if (includeDisabled) {
      matchedUuids = [...matchedUuids, ...this.scriptMatchDisable.urlMatch(url!)];
    }
    const ret = new Map<string, { uuid: string; effective: boolean }>();
    for (const e of matchedUuids) {
      const uuid = e.endsWith(ORIGINAL_URLMATCH_SUFFIX) ? e.slice(0, -ORIGINAL_URLMATCH_SUFFIX.length) : e;
      if (!includeNonEffective && uuid !== e) continue;
      const o = ret.get(uuid) || { uuid, effective: false };
      // 只包含 uuid{Ori} 而不包含 uuid 的情况，effective = false
      if (e === uuid) {
        o.effective = true;
      }
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
    const matchingResult = this.getPageScriptMatchingResultByUrl(chromeSender.url!, false, false);

    const enableScript = [] as ScriptLoadInfo[];

    const uuids = [...matchingResult.keys()];

    const [scripts, compiledResources] = await Promise.all([
      this.scriptDAO.gets(uuids),
      this.compiledResourceDAO.gets(uuids),
    ]);

    const resourceChecks = {} as { [uuid: string]: Record<string, [string, ResourceType]> };

    for (let idx = 0, l = uuids.length; idx < l; idx++) {
      const uuid = uuids[idx];
      const script = scripts[idx];
      const compiledResource = compiledResources[idx];

      if (!script || !compiledResource) continue;
      const scriptRes_ = buildScriptRunResourceBasic(script);
      const { scriptUrlPatterns, originalUrlPatterns } = compiledResource;

      for (const [_key, res] of Object.entries(scriptRes_.resource)) {
        if (res.url.startsWith("file:///")) {
          const resourceCheck =
            resourceChecks[uuid] || (resourceChecks[uuid] = {} as Record<string, [string, ResourceType]>);
          resourceCheck[res.url] = [res.hash.sha512, res.type];
        }
      }

      // 物件部份内容预设为空
      const scriptRes = {
        ...scriptRes_,
        scriptUrlPatterns: scriptUrlPatterns,
        originalUrlPatterns: originalUrlPatterns === null ? scriptUrlPatterns : originalUrlPatterns,
        code: "",
        value: {},
        resource: {},
        metadataStr: "",
        userConfigStr: "",
      };

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
      const uuid = scriptRes.uuid;
      const resourceCheck = resourceChecks[uuid];
      if (resourceCheck) {
        let resourceUpdated = false;
        for (const [url, [sha512, type]] of Object.entries(resourceCheck)) {
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
          const scriptInjectCode = compileInjectionCode(scriptRes, scriptDAOCode);
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

  compileInjectUserScript(
    injectJs: string,
    messageFlag: string,
    { excludeMatches, excludeGlobs }: { excludeMatches: string[] | undefined; excludeGlobs: string[] | undefined }
  ) {
    // 替换ScriptFlag
    // 遍历early-start的脚本
    const earlyScriptFlag = [...this.earlyScriptFlags].map((uuid) => getScriptFlag(uuid));
    const flagParam = JSON.stringify(earlyScriptFlag);

    // 构建inject.js的脚本注册信息
    const code = `(function (MessageFlag, EarlyScriptFlag) {\n${injectJs}\n})('${messageFlag}', ${flagParam})`;
    const script: chrome.userScripts.RegisteredUserScript = {
      id: "scriptcat-inject",
      js: [{ code }],
      matches: ["<all_urls>"],
      allFrames: true,
      world: "MAIN",
      runAt: "document_start",
      excludeMatches: excludeMatches,
      excludeGlobs: excludeGlobs,
    };

    // 构建给content.js用的early-start脚本flag
    return [
      {
        id: "scriptcat-early-start-flag",
        js: [{ code: "window.EarlyScriptFlag=" + flagParam + ";" }],
        matches: ["<all_urls>"],
        allFrames: true,
        world: "USER_SCRIPT",
        runAt: "document_start",
        excludeMatches: excludeMatches,
        excludeGlobs: excludeGlobs,
      },
      script,
    ] as chrome.userScripts.RegisteredUserScript[];
  }

  // 重新注册inject.js，主要是为了更新early-start的脚本flag
  async reRegisterInjectScript() {
    // 若 UserScripts API 不可使用 或 ScriptCat设定为不启用脚本 则退出
    if (!this.isUserScriptsAvailable || !this.isLoadScripts) return;
    const messageFlag = this.getMessageFlag();
    const [scripts, injectJs] = await Promise.all([
      chrome.userScripts.getScripts({ ids: ["scriptcat-inject"] }),
      this.getInjectJsCode(),
    ]);

    if (!messageFlag || !scripts?.[0] || !injectJs) {
      return;
    }
    // 提取现有的 excludeMatches 和 excludeGlobs
    const { excludeMatches, excludeGlobs } = scripts[0];
    const apiScripts = this.compileInjectUserScript(injectJs, messageFlag, { excludeMatches, excludeGlobs });
    try {
      await chrome.userScripts.update(apiScripts); // 里面包括 "scriptcat-inject" 和 "scriptcat-early-start-flag"
    } catch (e: any) {
      this.logger.error("register inject.js error", Logger.E(e));
    }
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
    this.scriptMatchEnable.clearRules(uuid);
    this.scriptMatchEnable.clearRules(uuidOri);
    this.scriptMatchDisable.clearRules(uuid);
    this.scriptMatchDisable.clearRules(uuidOri);
    const scriptMatch = scriptRes.status === SCRIPT_STATUS_ENABLE ? this.scriptMatchEnable : this.scriptMatchDisable;
    // 添加新的数据
    scriptMatch.addRules(uuid, scriptUrlPatterns);
    if (originalUrlPatterns && originalUrlPatterns !== scriptUrlPatterns) {
      scriptMatch.addRules(uuidOri, originalUrlPatterns);
    }
    return matchInfoEntry;
  }

  /**
   * applyScriptMatchInfo 对脚本进行URL匹配信息的处理
   */
  async applyScriptMatchInfo(scriptRes: ScriptRunResource) {
    const o = scriptURLPatternResults(scriptRes);
    if (!o) {
      return undefined;
    }
    // 构建脚本匹配信息
    return this.scriptMatchEntry(scriptRes, o);
  }

  // 加载页面脚本, 会把脚本信息放入缓存中
  // 如果脚本开启, 则注册脚本
  async loadPageScript(script: Script, registerScript_: chrome.userScripts.RegisteredUserScript) {
    // 如果脚本开启, 则注册脚本
    if (!this.isUserScriptsAvailable || !this.isLoadScripts || script.status !== SCRIPT_STATUS_ENABLE) {
      return;
    }
    const { name, uuid } = script;
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

  async unregistryPageScripts(uuids: string[], forced: boolean = false) {
    if (forced ? false : !this.isUserScriptsAvailable || !this.isLoadScripts) {
      return;
    }
    const result = await chrome.userScripts.getScripts({ ids: uuids });
    const filteredIds = result.map((entry) => entry.id).filter((id) => !!id);
    if (filteredIds.length > 0) {
      // 修改脚本状态为disable，浏览器取消注册该脚本
      await chrome.userScripts.unregister({ ids: filteredIds });
    }
  }
}
