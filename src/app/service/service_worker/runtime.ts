import type { EmitEventRequest, ScriptLoadInfo, TScriptMatchInfoEntry } from "./types";
import type { MessageQueue } from "@Packages/message/message_queue";
import type { GetSender, Group } from "@Packages/message/server";
import type { ExtMessageSender, MessageSender, MessageSend } from "@Packages/message/types";
import type { Script, SCRIPT_STATUS, ScriptDAO, ScriptRunResource } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { type ValueService } from "./value";
import GMApi, { GMExternalDependencies } from "./gm_api";
import type { TDeleteScript, TEnableScript, TInstallScript, TScriptValueUpdate, TSortScript } from "../queue";
import { type ScriptService } from "./script";
import { runScript, stopScript } from "../offscreen/client";
import { getRunAt } from "./utils";
import {
  isUserScriptsAvailable,
  randomMessageFlag,
  getMetadataStr,
  getUserConfigStr,
  obtainBlackList,
} from "@App/pkg/utils/utils";
import { cacheInstance } from "@App/app/cache";
import { UrlMatch } from "@App/pkg/utils/match";
import { ExtensionContentMessageSend } from "@Packages/message/extension_message";
import { sendMessage } from "@Packages/message/client";
import { compileInjectScript, compilePreInjectScript, compileScriptCode, isEarlyStartScript } from "../content/utils";
import LoggerCore from "@App/app/logger/core";
import PermissionVerify from "./permission_verify";
import { type SystemConfig } from "@App/pkg/config/config";
import { type ResourceService } from "./resource";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import Logger from "@App/app/logger/logger";
import type { GMInfoEnv } from "../content/types";
import { localePath } from "@App/locales/locales";
import { DocumentationSite } from "@App/app/const";
import { CACHE_KEY_REGISTRY_SCRIPT } from "@App/app/cache_key";
import {
  getApiMatchesAndGlobs,
  extractUrlPatterns,
  RuleType,
  toUniquePatternStrings,
  type URLRuleEntry,
} from "@App/pkg/utils/url_matcher";
import { parseUserConfig } from "@App/pkg/utils/yaml";

const ORIGINAL_URLMATCH_SUFFIX = "{ORIGINAL}"; // 用于标记原始URLPatterns的后缀

export class RuntimeService {
  scriptMatch: UrlMatch<string> = new UrlMatch<string>();
  blackMatch: UrlMatch<string> = new UrlMatch<string>();
  scriptMatchCache: Map<string, TScriptMatchInfoEntry> | null | undefined;

  logger: Logger;

  // 当前扩充是否允许执行 UserScripts API (例如是否已打开开发者模式，或已给予 userScripts 权限)
  // 在未初始化前，预设 false。一般情况初始化值会很快被替换
  boolUserScriptsAvailable = false;

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

  // Promise to pre-fetch inject.js
  injectJsCodePromise: Promise<string | undefined> | null = null;

  // initReady
  initReady: Promise<boolean> | boolean = false;

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private sender: MessageSend,
    private mq: MessageQueue,
    private value: ValueService,
    private script: ScriptService,
    private resource: ResourceService,
    private scriptDAO: ScriptDAO
  ) {
    this.logger = LoggerCore.logger({ component: "runtime" });
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
    const localStorage = new LocalStorageDAO();
    localStorage.get("firstShowDeveloperMode").then((res) => {
      if (!res) {
        localStorage.save({
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

  async valueUpdate(data: TScriptValueUpdate) {
    if (typeof this.initReady !== "boolean") await this.initReady;
    if (!isEarlyStartScript(data.script)) {
      return;
    }
    // 如果是预加载脚本，需要更新脚本代码重新注册
    await this.loadPageScript(data.script);
  }

  async preFetch() {
    if (!this.injectJsCodePromise) {
      this.injectJsCodePromise = fetch("/src/inject.js")
        .then((res) => res.text())
        .catch((e) => {
          console.error("Unable to fetch /src/inject.js", e);
          return undefined;
        });
    }
  }

  async init() {
    // 启动gm api
    const permission = new PermissionVerify(this.group.group("permission"), this.mq);
    const gmApi = new GMApi(
      this.systemConfig,
      permission,
      this.group,
      this.sender,
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
    this.mq.subscribe<TEnableScript>("enableScript", async (data) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      const script = await this.scriptDAO.getAndCode(data.uuid);
      if (!script) {
        this.logger.error("script enable failed, script not found", {
          uuid: data.uuid,
        });
        return;
      }
      // 如果是普通脚本, 在service worker中进行注册
      // 如果是后台脚本, 在offscreen中进行处理
      if (script.type === SCRIPT_TYPE_NORMAL) {
        // 加载页面脚本
        // 不管开没开启都要加载一次脚本信息
        await this.loadPageScript(script);
        if (!data.enable) {
          await this.unregistryPageScript(script.uuid);
        }
      }
    });

    // 监听脚本安装
    this.mq.subscribe<TInstallScript>("installScript", async (data) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      const script = await this.scriptDAO.get(data.script.uuid);
      if (!script) {
        this.logger.error("script install failed, script not found", {
          uuid: data.script.uuid,
        });
        return;
      }
      if (script.type === SCRIPT_TYPE_NORMAL) {
        await this.loadPageScript(script);
        // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
        await this.reRegisterInjectScript();
      }
    });

    // 监听脚本删除
    this.mq.subscribe<TDeleteScript>("deleteScript", async ({ uuid }) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      await this.unregistryPageScript(uuid);
      await this.deleteScriptMatch(uuid);
      // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
      await this.reRegisterInjectScript();
    });

    // 监听脚本排序
    this.mq.subscribe<TSortScript>("sortScript", async (scripts) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      const uuidSort = Object.fromEntries(scripts.map(({ uuid, sort }) => [uuid, sort]));
      this.scriptMatch.setupSorter(uuidSort);
      // 更新缓存
      const scriptMatchCache = await cacheInstance.get<{ [key: string]: TScriptMatchInfoEntry }>("scriptMatch");
      if (!scriptMatchCache) {
        console.warn("scriptMatchCache is undefined.");
        return;
      }
      const keys = Object.keys(scriptMatchCache);
      for (const uuid of keys) {
        scriptMatchCache[uuid].sort = uuidSort[uuid];
      }
      await cacheInstance.set("scriptMatch", scriptMatchCache);
    });

    // 监听offscreen环境初始化, 初始化完成后, 再将后台脚本运行起来
    this.mq.subscribe("preparationOffscreen", async () => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      await this.scriptDAO.all().then((list) => {
        list.forEach((script) => {
          if (script.type === SCRIPT_TYPE_NORMAL) {
            return;
          }
          this.mq.publish<TEnableScript>("enableScript", {
            uuid: script.uuid,
            enable: script.status === SCRIPT_STATUS_ENABLE,
          });
        });
      });
    });

    // 监听脚本值变更
    this.mq.subscribe<TScriptValueUpdate>("valueUpdate", this.valueUpdate.bind(this));

    if (chrome.extension.inIncognitoContext) {
      this.systemConfig.addListener("enable_script_incognito", async (enable) => {
        // 隐身窗口不对注册了的脚本进行实际操作
        this.isLoadScripts = enable && (await this.systemConfig.getEnableScriptNormal());
      });
      this.systemConfig.addListener("enable_script", async (enable) => {
        // 隐身窗口不对注册了的脚本进行实际操作
        // 当主窗口的enable改为false时，isLoadScripts也会更改为false
        this.isLoadScripts = enable && (await this.systemConfig.getEnableScriptIncognite());
      });
    } else {
      this.systemConfig.addListener("enable_script", async (enable) => {
        this.isLoadScripts = enable;
        await (enable ? this.registerUserscripts() : this.unregisterUserscripts());
      });
    }

    this.systemConfig.addListener("blacklist", async (blacklist: string) => {
      this.blacklist = obtainBlackList(blacklist);
      if (this.boolUserScriptsAvailable && this.isLoadScripts) {
        // 重新注册用户脚本
        await this.registerUserscripts();
      } else {
        await this.unregisterUserscripts();
      }
      this.loadBlacklist();
      this.logger.info("blacklist updated", {
        blacklist,
      });
    });

    const onUserScriptAPIGrantAdded = async () => {
      this.boolUserScriptsAvailable = true;
      // 注册脚本
      if (this.isLoadScripts) {
        await this.registerUserscripts();
      }
    };

    const onUserScriptAPIGrantRemoved = async () => {
      this.boolUserScriptsAvailable = false;
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
      const [boolUserScriptsAvailable, isLoadScripts, strBlacklist] = await Promise.all([
        isUserScriptsAvailable(),
        this.systemConfig.getEnableScript(),
        this.systemConfig.getBlacklist(),
      ]);

      // 保存初始值
      this.boolUserScriptsAvailable = boolUserScriptsAvailable;
      this.isLoadScripts = isLoadScripts;
      this.blacklist = obtainBlackList(strBlacklist);

      // 检查是否开启了开发者模式
      if (!this.boolUserScriptsAvailable) {
        // 未开启加上警告引导
        this.showNoDeveloperModeWarning();
      }

      // 初始化：加载黑名单
      this.loadBlacklist();
      // 初始化：userAgentData

      await Promise.all([
        // 初始化：userAgentData
        this.initUserAgentData(),
        // 如果初始化时开启了启用脚本，则注册脚本
        boolUserScriptsAvailable && this.isLoadScripts && this.registerUserscripts(),
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
    await Promise.allSettled([chrome.userScripts.unregister(), this.deleteMessageFlag()]);
  }

  getAndGenMessageFlag() {
    return cacheInstance.getOrSet<string>("scriptInjectMessageFlag", () => randomMessageFlag());
  }

  deleteMessageFlag() {
    return cacheInstance.del("scriptInjectMessageFlag");
  }

  getMessageFlag() {
    return cacheInstance.get<string>("scriptInjectMessageFlag");
  }

  async getParticularScriptList() {
    const list = await this.scriptDAO.all();
    // 按照脚本顺序位置排序
    list.sort((a, b) => a.sort - b.sort);
    const registerScripts = await Promise.all(
      list.map((script) => {
        if (script.type !== SCRIPT_TYPE_NORMAL) {
          return undefined;
        }
        return this.getAndSetUserScriptRegister(script).then((res) => {
          if (!res) {
            return undefined;
          }
          const { registerScript } = res!;
          // 如果没开启, 则不注册
          if (script.status !== SCRIPT_STATUS_ENABLE) {
            return undefined;
          }
          // 过滤掉matches为空的脚本
          if (!registerScript.matches || registerScript.matches.length === 0) {
            this.logger.error("registerScript matches is empty", {
              script: script.name,
              uuid: script.uuid,
            });
            return undefined;
          }
          return registerScript;
        });
      })
    ).then(async (res) => {
      // 过滤掉undefined和未开启的
      return res.filter((item) => item) as chrome.userScripts.RegisteredUserScript[];
    });

    const batchData: { [key: string]: boolean } = {};
    for (const script of registerScripts) {
      batchData[`${CACHE_KEY_REGISTRY_SCRIPT}${script.id}`] = true;
    }
    cacheInstance.batchSet(batchData);

    return registerScripts;
  }

  async getGeneralScriptList() {
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

    const messageFlag = await this.getAndGenMessageFlag();
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

    const list: chrome.userScripts.RegisteredUserScript[] = [];

    // content.js
    list[0] = {
      id: "scriptcat-content",
      js: [{ file: "src/content.js" }],
      matches: ["<all_urls>"],
      allFrames: true,
      runAt: "document_start",
      world: "USER_SCRIPT",
      excludeMatches,
      excludeGlobs,
    };

    // inject.js
    const injectJs = await this.injectJsCodePromise;
    if (injectJs) {
      const script = this.compileInjectUserScript(injectJs, messageFlag, {
        excludeMatches,
        excludeGlobs,
      });
      list.push(script);
    }

    return list;
  }

  async registerUserscripts() {
    // 若 UserScript API 不可使用 或 ScriptCat设定为不启用脚本 则退出
    if (!this.boolUserScriptsAvailable || !this.isLoadScripts) return;
    this.preFetch();
    const loadingScriptMatchInfo = this.loadScriptMatchInfo();
    // 先取消当前注册 （如有）。
    await this.unregisterUserscripts();
    // 使注册时重新注入 chrome.runtime
    chrome.userScripts.resetWorldConfiguration();

    // unregisterUserscripts 已处理。按道理不会有messageFlag。
    // messageFlag是用来判断是否已经注册过了
    if (await this.getMessageFlag()) {
      // 异常情况
      console.error("messageFlag exists");
      await loadingScriptMatchInfo;
      return;
    }

    const [particularScriptList, generalScriptList] = await Promise.all([
      // registerScripts
      this.getParticularScriptList(),
      // content.js, inject.js
      this.getGeneralScriptList(),
    ]);

    const list = [...particularScriptList, ...generalScriptList];

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

    await this.loadScriptMatchInfo();
  }

  // 给指定tab发送消息
  sendMessageToTab(to: ExtMessageSender, action: string, data: any) {
    if (to.tabId === -1) {
      // 如果是-1, 代表给offscreen发送消息
      return sendMessage(this.sender, "offscreen/runtime/" + action, data);
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
      return sendMessage(this.sender, "offscreen/runtime/emitEvent", req);
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

  async getPageScriptMatchingResultByUrl(url: string, includeNonEffective: boolean = false) {
    await this.loadScriptMatchInfo();
    // 返回当前页面匹配的uuids
    // 如果有使用自定义排除，原本脚本定义的会返回 uuid{Ori}
    // 因此基于自定义排除页面被排除的情况下，结果只包含 uuid{Ori} 而不包含 uuid
    const matchedUuids = this.scriptMatch.urlMatch(url!);
    const ret = new Map<string, { uuid: string; effective: boolean; matchInfo?: TScriptMatchInfoEntry }>();
    const scriptMatchCache = this.scriptMatchCache;
    for (const e of matchedUuids) {
      const uuid = e.endsWith(ORIGINAL_URLMATCH_SUFFIX) ? e.slice(0, -ORIGINAL_URLMATCH_SUFFIX.length) : e;
      if (!includeNonEffective && uuid !== e) continue;
      const o = ret.get(uuid) || { uuid, effective: false };
      // 只包含 uuid{Ori} 而不包含 uuid 的情况，effective = false
      if (e === uuid) {
        o.effective = true;
      }
      // 把匹配脚本的资料从 cache 取出来
      if (scriptMatchCache) {
        o.matchInfo = scriptMatchCache.get(uuid);
      }
      ret.set(uuid, o);
    }
    // ret 只包含 uuid 为键的 matchingResult
    return ret;
  }

  async pageLoad(_: any, sender: GetSender) {
    if (typeof this.initReady !== "boolean") await this.initReady;

    if (!this.isLoadScripts) {
      return { flag: "", scripts: [] };
    }
    const chromeSender = sender.getSender() as MessageSender;

    // 判断是否黑名单（针对网址，与个别脚本设定无关）
    if (this.isUrlBlacklist(chromeSender.url!)) {
      // 如果在黑名单中, 则不加载脚本
      return { flag: "", scripts: [] };
    }

    const [scriptFlag] = await Promise.all([this.getMessageFlag(), this.loadScriptMatchInfo()]); // loadScriptMatchInfo 不产生结果

    // 匹配当前页面的脚本（只包含有效脚本。自定义排除了的不包含）
    const matchingResult = await this.getPageScriptMatchingResultByUrl(chromeSender.url!);

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
        // 判断插件运行环境
        const contextType = chrome.extension.inIncognitoContext ? "incognito-tabs" : "normal-tabs";
        if (!scriptRes.metadata["run-in"].includes(contextType)) {
          continue;
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
          }
        }),
      ])
    );

    // 更新资源使用了file协议的脚本
    const needUpdateRegisteredUserScripts = enableScript.filter((script) => {
      let uriList: string[] = [];
      // @require
      if (Array.isArray(script.metadata.require)) {
        uriList = uriList.concat(script.metadata.require);
      }
      // @resource
      if (Array.isArray(script.metadata.resource)) {
        uriList = uriList.concat(
          script.metadata.resource
            .map((resourceInfo) => {
              const split = resourceInfo.trim().split(/\s+/);
              if (split.length >= 2) {
                const resourceUri = split[1];
                return resourceUri;
              }
            })
            .filter((it) => it !== undefined)
        );
      }
      return uriList.some((uri) => {
        return uri.startsWith("file://");
      });
    });
    if (needUpdateRegisteredUserScripts.length) {
      // this.logger.info("update registered userscripts", {
      //   needReloadScript: needUpdateRegisteredUserScripts,
      // });
      let scriptRegisterInfoList = await chrome.userScripts.getScripts({
        ids: needUpdateRegisteredUserScripts.map((script) => script.uuid),
      });
      scriptRegisterInfoList = (
        await Promise.all(
          scriptRegisterInfoList.map(async (scriptRegisterInfo) => {
            const scriptRes = needUpdateRegisteredUserScripts.find((script) => (script.uuid = scriptRegisterInfo.id));
            if (scriptRes) {
              const originScriptCode = scriptRegisterInfo.js[0]["code"];
              let scriptResCode = scriptRes.code;
              if (scriptResCode === "") {
                scriptResCode = (await this.scriptDAO.scriptCodeDAO.get(scriptRes.uuid))!.code;
              }
              const scriptCode = compileScriptCode(scriptRes, scriptResCode);
              const scriptInjectCode = compileInjectScript(scriptRes, scriptCode, true);
              // 若代码一致，则不更新
              if (originScriptCode === scriptInjectCode) {
                return;
              }
              scriptRegisterInfo.js = [
                {
                  code: scriptInjectCode,
                },
              ];
              return scriptRegisterInfo;
            }
          })
        )
      ).filter((it) => it !== undefined);
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
      tabId: chromeSender.tab?.id,
      frameId: chromeSender.frameId,
      scripts: enableScript,
    });

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
    if (typeof this.initReady !== "boolean") await this.initReady;
    return await stopScript(this.sender, uuid);
  }

  // 运行脚本
  async runScript(uuid: string) {
    if (typeof this.initReady !== "boolean") await this.initReady;
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return;
    }
    const res = await this.script.buildScriptRunResource(script);
    return await runScript(this.sender, res);
  }

  compileInjectUserScript(injectJs: string, messageFlag: string, o: Record<string, any>) {
    // 替换ScriptFlag
    const earlyScriptFlag: string[] = [];
    // 遍历early-start的脚本
    this.scriptMatchCache?.forEach((script) => {
      if (isEarlyStartScript(script)) {
        earlyScriptFlag.push(script.flag);
      }
    });
    this.script.getAllScripts();

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
    return script;
  }

  // 重新注册inject.js，主要是为了更新early-start的脚本flag
  async reRegisterInjectScript() {
    // 若 UserScript API 不可使用 或 ScriptCat设定为不启用脚本 则退出
    if (!this.boolUserScriptsAvailable || !this.isLoadScripts) return;

    const [messageFlag, scripts, injectJs] = await Promise.all([
      this.getMessageFlag(),
      chrome.userScripts.getScripts({ ids: ["scriptcat-inject"] }),
      this.injectJsCodePromise,
    ]);

    if (!messageFlag || !scripts || !injectJs) {
      return;
    }
    const script = this.compileInjectUserScript(injectJs, messageFlag, scripts[0]);
    try {
      await chrome.userScripts.update([script]);
    } catch (e: any) {
      this.logger.error("register inject.js error", Logger.E(e));
    }
  }

  // 一般情况下请不要直接访问 loadingScript 此变数 （私有变数）
  loadingScript: Promise<void> | null = null;

  // 加载脚本匹配信息，由于service_worker的机制，如果由不活动状态恢复过来时，会优先触发事件
  // 可能当时会没有脚本匹配信息，所以使用脚本信息时，尽量使用此方法获取
  async loadScriptMatchInfo() {
    if (this.scriptMatchCache) {
      return;
    }
    if (!this.loadingScript) {
      // 如果没有缓存, 则创建一个新的缓存
      const scriptMatchCache = new Map<string, TScriptMatchInfoEntry>();
      const loadingScript = cacheInstance
        .get<{ [key: string]: TScriptMatchInfoEntry }>("scriptMatch")
        .then((data) => {
          if (data) {
            const arr = Object.entries(data).sort(([, a], [, b]) => a.sort! - b.sort!);
            for (const [, matchInfoEntry] of arr) {
              this.addScriptMatchEntry(scriptMatchCache, matchInfoEntry);
            }
          }
        })
        .then(() => {
          if (loadingScript !== this.loadingScript) {
            console.error("invalid loadScriptMatchInfo() calling");
            return;
          }
          this.scriptMatchCache = scriptMatchCache;
          this.loadingScript = null;
        });
      this.loadingScript = loadingScript;
    }
    await this.loadingScript;
  }

  // 保存脚本匹配信息
  async saveScriptMatchInfo() {
    if (!this.scriptMatchCache) {
      return;
    }
    return await cacheInstance.set("scriptMatch", Object.fromEntries(this.scriptMatchCache));
  }

  async addScriptMatch(matchInfoEntry: TScriptMatchInfoEntry) {
    if (!this.scriptMatchCache) {
      await this.loadScriptMatchInfo();
    }
    const scriptMatchCache = this.scriptMatchCache!;
    this.addScriptMatchEntry(scriptMatchCache, matchInfoEntry);
    await this.saveScriptMatchInfo();
  }

  addScriptMatchEntry(scriptMatchCache: Map<string, TScriptMatchInfoEntry>, matchInfoEntry: TScriptMatchInfoEntry) {
    // 优化性能，将不需要的信息去掉
    // 而且可能会超过缓存的存储限制
    matchInfoEntry = {
      ...matchInfoEntry,
      ...{
        code: "",
        value: {},
        resource: {},
      },
    };
    const uuid = matchInfoEntry.uuid;
    scriptMatchCache.set(uuid, matchInfoEntry);
    const uuidOri = `${matchInfoEntry.uuid}${ORIGINAL_URLMATCH_SUFFIX}`;
    // 清理一下老数据
    this.scriptMatch.clearRules(uuid);
    this.scriptMatch.clearRules(uuidOri);
    // 添加新的数据
    this.scriptMatch.addRules(uuid, matchInfoEntry.scriptUrlPatterns);
    if (matchInfoEntry.originalUrlPatterns !== matchInfoEntry.scriptUrlPatterns) {
      this.scriptMatch.addRules(uuidOri, matchInfoEntry.originalUrlPatterns);
    }
  }

  async updateScriptStatus(uuid: string, status: SCRIPT_STATUS) {
    if (!this.scriptMatchCache) {
      await this.loadScriptMatchInfo();
    }
    const script = this.scriptMatchCache!.get(uuid);
    if (script) {
      script.status = status;
      this.saveScriptMatchInfo();
    }
  }

  async deleteScriptMatch(uuid: string) {
    if (!this.scriptMatchCache) {
      await this.loadScriptMatchInfo();
    }
    this.scriptMatchCache!.delete(uuid);
    this.scriptMatch.clearRules(uuid);
    this.scriptMatch.clearRules(`${uuid}${ORIGINAL_URLMATCH_SUFFIX}`);
    this.saveScriptMatchInfo();
  }

  parseScriptLoadInfo(script: ScriptRunResource): ScriptLoadInfo {
    const metadataStr = getMetadataStr(script.code) || "";
    const userConfigStr = getUserConfigStr(script.code) || "";
    return {
      ...script,
      metadataStr,
      userConfigStr,
    };
  }

  // 构建userScript注册信息
  async getAndSetUserScriptRegister(script: Script) {
    const preDocumentStartScript = isEarlyStartScript(script);
    let scriptFlag: string | undefined;
    if (preDocumentStartScript) {
      //preDocumentStart脚本使用uuid作为flag
      scriptFlag = script.uuid;
    }
    const scriptRes = await this.script.buildScriptRunResource(script, scriptFlag);
    const { metadata, originalMetadata } = scriptRes;
    const metaMatch = metadata.match;
    const metaInclude = metadata.include;
    const metaExclude = metadata.exclude;
    if ((metaMatch?.length ?? 0) + (metaInclude?.length ?? 0) === 0) {
      return undefined;
    }

    // 黑名单排除
    const strBlacklist = (await this.systemConfig.getBlacklist()) as string | undefined;
    const blacklist = obtainBlackList(strBlacklist);

    const scriptUrlPatterns = extractUrlPatterns([
      ...(metaMatch || []).map((e) => `@match ${e}`),
      ...(metaInclude || []).map((e) => `@include ${e}`),
      ...(metaExclude || []).map((e) => `@exclude ${e}`),
      ...(blacklist || []).map((e) => `@exclude ${e}`),
    ]);

    // 如果使用了自定义排除，无法在脚本原有的网域看到匹配情况
    // 所有统一把原本的pattern都解析一下

    const originalUrlPatterns: URLRuleEntry[] | null =
      script.selfMetadata?.match || script.selfMetadata?.include || script.selfMetadata?.exclude
        ? extractUrlPatterns([
            ...(originalMetadata.match || []).map((e) => `@match ${e}`),
            ...(originalMetadata.include || []).map((e) => `@include ${e}`),
            ...(originalMetadata.exclude || []).map((e) => `@exclude ${e}`),
            ...(blacklist || []).map((e) => `@exclude ${e}`),
          ])
        : scriptUrlPatterns;

    if (preDocumentStartScript) {
      scriptRes.code = compilePreInjectScript(this.parseScriptLoadInfo(scriptRes), scriptRes.code);
    } else {
      scriptRes.code = compileInjectScript(scriptRes, scriptRes.code);
    }

    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    const excludeMatches = toUniquePatternStrings(
      scriptUrlPatterns.filter((e) => e.ruleType === RuleType.MATCH_EXCLUDE)
    );
    const excludeGlobs = toUniquePatternStrings(scriptUrlPatterns.filter((e) => e.ruleType === RuleType.GLOB_EXCLUDE));

    const registerScript: chrome.userScripts.RegisteredUserScript = {
      id: scriptRes.uuid,
      js: [{ code: scriptRes.code }],
      matches: matches, // primary
      includeGlobs: includeGlobs, // includeGlobs applied after matches
      excludeMatches: excludeMatches,
      excludeGlobs: excludeGlobs,
      allFrames: !scriptRes.metadata["noframes"],
      world: "MAIN",
    };

    if (scriptRes.metadata["run-at"]) {
      registerScript.runAt = getRunAt(scriptRes.metadata["run-at"]);
    }

    const scriptMatchInfo = Object.assign(
      {
        scriptUrlPatterns: scriptUrlPatterns,
        originalUrlPatterns: originalUrlPatterns,
      },
      scriptRes
    ) as TScriptMatchInfoEntry;

    // 将脚本match信息放入缓存中
    this.addScriptMatch(scriptMatchInfo);

    return {
      registerScript,
    };
  }

  // 加载页面脚本, 会把脚本信息放入缓存中
  // 如果脚本开启, 则注册脚本
  async loadPageScript(script: Script) {
    const resp = await this.getAndSetUserScriptRegister(script);
    const { name, uuid } = script;
    if (!resp) {
      this.logger.error("getAndSetUserScriptRegister error", {
        script: name,
        uuid,
      });
      return;
    }
    const { registerScript } = resp;

    // 如果脚本开启, 则注册脚本
    if (this.boolUserScriptsAvailable && this.isLoadScripts && script.status === SCRIPT_STATUS_ENABLE) {
      const res = await chrome.userScripts.getScripts({ ids: [uuid] });
      const logger = LoggerCore.logger({
        name,
        registerMatch: {
          matches: registerScript.matches,
          excludeMatches: registerScript.excludeMatches,
        },
      });
      if (res.length > 0) {
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
      await cacheInstance.set(`${CACHE_KEY_REGISTRY_SCRIPT}${uuid}`, true);
    }
  }

  async unregistryPageScript(uuid: string) {
    const cacheKey = `${CACHE_KEY_REGISTRY_SCRIPT}${uuid}`;
    if (!this.boolUserScriptsAvailable || !this.isLoadScripts || !(await cacheInstance.get(cacheKey))) {
      return;
    }
    // 删除缓存
    await cacheInstance.del(cacheKey);
    // 修改脚本状态为disable，浏览器取消注册该脚本
    await Promise.all([
      this.updateScriptStatus(uuid, SCRIPT_STATUS_DISABLE),
      chrome.userScripts.unregister({ ids: [uuid] }),
    ]);
  }
}
