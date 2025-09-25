import type { EmitEventRequest, ScriptLoadInfo, ScriptMatchInfo, TScriptMatchInfoEntry } from "./types";
import type { MessageQueue, MessageQueueGroup } from "@Packages/message/message_queue";
import type { GetSender, Group } from "@Packages/message/server";
import type { ExtMessageSender, MessageSender, MessageSend } from "@Packages/message/types";
import type { Script, SCRIPT_STATUS, ScriptDAO } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { type ValueService } from "./value";
import GMApi, { GMExternalDependencies } from "./gm_api";
import type { TDeleteScript, TEnableScript, TInstallScript, TScriptValueUpdate, TSortedScript } from "../queue";
import { type ScriptService } from "./script";
import { runScript, stopScript } from "../offscreen/client";
import { getUserScriptRegister } from "./utils";
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
import { compileInjectScript, compileScriptCode, isEarlyStartScript } from "../content/utils";
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
import { extractUrlPatterns, RuleType, type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { parseUserConfig } from "@App/pkg/utils/yaml";

const ORIGINAL_URLMATCH_SUFFIX = "{ORIGINAL}"; // 用于标记原始URLPatterns的后缀

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

  mq: MessageQueueGroup;

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private sender: MessageSend,
    mq: MessageQueue,
    private value: ValueService,
    private script: ScriptService,
    private resource: ResourceService,
    private scriptDAO: ScriptDAO,
    private localStorageDAO: LocalStorageDAO
  ) {
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
    if (!isEarlyStartScript(data.script)) {
      return;
    }
    // 如果是预加载脚本，需要更新脚本代码重新注册
    const scriptMatchInfo = await this.buildAndSetScriptMatchInfo(data.script);
    if (!scriptMatchInfo) {
      return;
    }
    await this.loadPageScript(scriptMatchInfo);
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
    this.mq.subscribe<TEnableScript[]>("enableScripts", async (data) => {
      for (const { uuid, enable } of data) {
        const script = await this.scriptDAO.get(uuid);
        if (!script) {
          this.logger.error("script enable failed, script not found", {
            uuid: uuid,
          });
          continue;
        }
        // 如果是普通脚本, 在service worker中进行注册
        // 如果是后台脚本, 在offscreen中进行处理
        if (script.type === SCRIPT_TYPE_NORMAL) {
          // 加载页面脚本
          // 不管是enable还是disable都需要调用buildAndSetScriptMatchInfo以更新缓存
          const scriptMatchInfo = await this.buildAndSetScriptMatchInfo(script);
          if (!scriptMatchInfo) {
            return;
          }
          if (enable) {
            await this.loadPageScript(scriptMatchInfo);
          } else {
            await this.unregistryPageScript(script.uuid);
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
      if (script.type === SCRIPT_TYPE_NORMAL) {
        const scriptMatchInfo = await this.buildAndSetScriptMatchInfo(script);
        if (!scriptMatchInfo) {
          return;
        }
        await this.loadPageScript(scriptMatchInfo);
        // 初始化会把所有的脚本flag注入，所以只用安装和卸载时重新注入flag
        await this.reRegisterInjectScript();
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
    this.mq.subscribe<TScriptValueUpdate>("valueUpdate", this.valueUpdate.bind(this));

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
      await this.unregisterUserscripts();
      if (this.isUserScriptsAvailable && this.isLoadScripts) {
        // 重新注册用户脚本
        await this.registerUserscripts();
      }
      this.loadBlacklist();
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
      const [isUserScriptsAvailable, isLoadScripts, strBlacklist] = await Promise.all([
        checkUserScriptsAvailable(),
        this.systemConfig.getEnableScript(),
        this.systemConfig.getBlacklist(),
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
    await Promise.allSettled([chrome.userScripts.unregister(), this.deleteMessageFlag()]);
  }

  async getAndGenMessageFlag() {
    let flag = await this.localStorageDAO.get("scriptInjectMessageFlag");
    if (!flag) {
      flag = { key: "scriptInjectMessageFlag", value: randomMessageFlag() };
      await this.localStorageDAO.save(flag);
    }
    return flag.value;
  }

  deleteMessageFlag() {
    return this.localStorageDAO.delete("scriptInjectMessageFlag");
  }

  getMessageFlag() {
    return this.localStorageDAO.get("scriptInjectMessageFlag").then((res) => res?.value);
  }

  async getParticularScriptList() {
    const list = await this.scriptDAO.all();
    // 按照脚本顺序位置排序
    list.sort((a, b) => a.sort - b.sort);
    const registerScripts = await Promise.all(
      list.map(async (script) => {
        if (script.type !== SCRIPT_TYPE_NORMAL) {
          return undefined;
        }
        const scriptMatchInfo = await this.buildAndSetScriptMatchInfo(script);
        if (!scriptMatchInfo) {
          return undefined;
        }
        // 如果没开启, 则不注册
        if (scriptMatchInfo.status !== SCRIPT_STATUS_ENABLE) {
          return undefined;
        }
        const res = await getUserScriptRegister(scriptMatchInfo);
        if (!res) {
          return undefined;
        }
        const { registerScript } = res!;
        // 过滤掉matches为空的脚本
        if (!registerScript.matches || registerScript.matches.length === 0) {
          this.logger.error("registerScript matches is empty", {
            script: script.name,
            uuid: script.uuid,
          });
          return undefined;
        }
        return registerScript;
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
      const script = this.compileInjectUserScript(injectJs, messageFlag, {
        excludeMatches,
        excludeGlobs,
      });
      retScript.push(...script);
    }

    return retScript;
  }

  // 如果是重复注册，需要先调用 unregisterUserscripts
  async registerUserscripts() {
    // 加载脚本匹配信息
    const loadingScriptMatchInfo = this.loadScriptMatchInfo();
    // 若 UserScript API 不可使用 或 ScriptCat设定为不启用脚本 则退出
    if (!this.isUserScriptsAvailable || !this.isLoadScripts) return;

    // messageFlag是用来判断是否已经注册过
    if (await this.getMessageFlag()) {
      // 异常情况
      // 检查scriptcat-content和scriptcat-inject是否存在
      const res = await chrome.userScripts.getScripts({ ids: ["scriptcat-content", "scriptcat-inject"] });
      if (res.length === 2) {
        await loadingScriptMatchInfo;
        return;
      }
      // 理论上不应该出现messageFlag存在但scriptcat-content/scriptcat-inject不存在的情况
      // 如果出现，走一次重新注册的流程
      this.logger.warn(
        "messageFlag exists but scriptcat-content/scriptcat-inject not exists, re-register userscripts."
      );
    }
    // 删除旧注册
    await this.unregisterUserscripts();
    // 使注册时重新注入 chrome.runtime
    try {
      await chrome.userScripts.resetWorldConfiguration();
    } catch (e: any) {
      console.error("chrome.userScripts.resetWorldConfiguration() failed.", e);
    }

    const particularScriptList = await this.getParticularScriptList();
    // getContentAndInjectScript依赖loadScriptMatchInfo
    // 需要等getParticularScriptList完成后再执行
    const generalScriptList = await this.getContentAndInjectScript();

    const list: chrome.userScripts.RegisteredUserScript[] = [...particularScriptList, ...generalScriptList];

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
    return await stopScript(this.sender, uuid);
  }

  // 运行脚本
  async runScript(uuid: string) {
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

    const [messageFlag, scripts, injectJs] = await Promise.all([
      this.getMessageFlag(),
      chrome.userScripts.getScripts({ ids: ["scriptcat-inject"] }),
      this.getInjectJsCode(),
    ]);

    if (!messageFlag || !scripts || !injectJs) {
      return;
    }
    const script = this.compileInjectUserScript(injectJs, messageFlag, scripts[0]);
    try {
      await chrome.userScripts.update(script);
    } catch (e: any) {
      this.logger.error("register inject.js error", Logger.E(e));
    }
  }

  // 一般情况下请不要直接访问 loadingScript 此变数 （私有变数）
  loadingScript: Promise<void> | null = null;

  // 加载脚本匹配信息，由于service_worker的机制，如果由不活动状态恢复过来时，会优先触发事件
  // 可能当时会没有脚本匹配信息，所以使用脚本信息时，尽量先使用此方法加载脚本匹配信息
  async loadScriptMatchInfo() {
    if (this.scriptMatchCache) {
      return;
    }
    if (!this.loadingScript) {
      // 如果没有缓存, 则创建一个新的缓存
      const scriptMatchCache = new Map<string, TScriptMatchInfoEntry>();
      const loadingScript = cacheInstance
        .get<{ [key: string]: TScriptMatchInfoEntry }>("scriptMatch")
        .then(async (data) => {
          if (data) {
            const arr = Object.entries(data).sort(([, a], [, b]) => a.sort! - b.sort!);
            for (const [, matchInfoEntry] of arr) {
              this.addScriptMatchEntry(scriptMatchCache, matchInfoEntry);
            }
          } else {
            // 如果没有缓存数据，则从数据库加载，解决浏览器重新启动后缓存丢失的问题
            const scripts = (await this.scriptDAO.all()).sort((a, b) => a.sort - b.sort);
            Promise.all(
              scripts.map(async (script) => {
                if (script.type !== SCRIPT_TYPE_NORMAL) {
                  return;
                }
                const scriptMatchInfoEntry = await this.buildScriptMatchInfo(script);
                if (scriptMatchInfoEntry) {
                  this.addScriptMatchEntry(scriptMatchCache, scriptMatchInfoEntry as TScriptMatchInfoEntry);
                }
              })
            );
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
    this.addScriptMatchEntry(this.scriptMatchCache!, matchInfoEntry);
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
      await this.saveScriptMatchInfo();
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

  // 构建脚本匹配信息并存入缓存
  async buildScriptMatchInfo(script: Script): Promise<ScriptMatchInfo | undefined> {
    const scriptRes = await this.script.buildScriptRunResource(script, script.uuid);
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

    const scriptMatchInfo = Object.assign(
      {
        scriptUrlPatterns: scriptUrlPatterns,
        originalUrlPatterns: originalUrlPatterns,
      },
      scriptRes
    );

    return scriptMatchInfo;
  }

  async buildAndSetScriptMatchInfo(script: Script) {
    const scriptMatchInfo = await this.buildScriptMatchInfo(script);
    if (!scriptMatchInfo) {
      return undefined;
    }
    // 把脚本信息放入缓存中
    await this.addScriptMatch(scriptMatchInfo as TScriptMatchInfoEntry);
    return scriptMatchInfo;
  }

  // 加载页面脚本, 会把脚本信息放入缓存中
  // 如果脚本开启, 则注册脚本
  async loadPageScript(scriptMatchInfo: ScriptMatchInfo) {
    // 如果脚本开启, 则注册脚本
    if (!this.isUserScriptsAvailable || !this.isLoadScripts || scriptMatchInfo.status !== SCRIPT_STATUS_ENABLE) {
      return;
    }
    const resp = await getUserScriptRegister(scriptMatchInfo);
    const { name, uuid } = scriptMatchInfo;
    if (!resp) {
      this.logger.error("getAndSetUserScriptRegister error", {
        script: name,
        uuid,
      });
      return;
    }
    const { registerScript } = resp;
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

  async unregistryPageScript(uuid: string) {
    const cacheKey = `${CACHE_KEY_REGISTRY_SCRIPT}${uuid}`;
    if (!this.isUserScriptsAvailable || !this.isLoadScripts || !(await cacheInstance.get(cacheKey))) {
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
