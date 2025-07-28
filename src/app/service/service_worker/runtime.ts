import type { EmitEventRequest, ScriptLoadInfo, ScriptMatchInfo } from "./types";
import type { MessageQueue, Unsubscribe } from "@Packages/message/message_queue";
import type { GetSender, Group } from "@Packages/message/server";
import type { ExtMessageSender, MessageSender, MessageSend } from "@Packages/message/types";
import type { Script, SCRIPT_STATUS, ScriptDAO } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { type ValueService } from "./value";
import GMApi, { GMExternalDependencies } from "./gm_api";
import type { TDeleteScript, TEnableScript, TInstallScript, TSortScript } from "../queue";
import { type ScriptService } from "./script";
import { runScript, stopScript } from "../offscreen/client";
import { getRunAt } from "./utils";
import { isUserScriptsAvailable, randomMessageFlag } from "@App/pkg/utils/utils";
import Cache from "@App/app/cache";
import { dealPatternMatches, UrlMatch } from "@App/pkg/utils/match";
import { ExtensionContentMessageSend } from "@Packages/message/extension_message";
import { sendMessage } from "@Packages/message/client";
import { compileInjectScript, compileScriptCode } from "../content/utils";
import LoggerCore from "@App/app/logger/core";
import PermissionVerify from "./permission_verify";
import { type SystemConfig } from "@App/pkg/config/config";
import { type ResourceService } from "./resource";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import Logger from "@App/app/logger/logger";
import { getMetadataStr, getUserConfigStr } from "@App/pkg/utils/utils";
import type { GMInfoEnv } from "../content/types";
import { localePath } from "@App/locales/locales";
import { CACHE_KEY_REGISTRY_SCRIPT } from "@App/app/cache_key";

export class RuntimeService {
  scriptMatch: UrlMatch<string> = new UrlMatch<string>();
  scriptCustomizeMatch: UrlMatch<string> = new UrlMatch<string>();
  blackMatch: UrlMatch<boolean> = new UrlMatch<boolean>();
  scriptMatchCache: Map<string, ScriptMatchInfo> | null | undefined;

  logger: Logger;

  isEnableDeveloperMode = false;
  isEnableUserscribe = true;
  userAgentData: typeof GM_info.userAgentData = {};

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

    // 检查是否开启了开发者模式
    this.isEnableDeveloperMode = await isUserScriptsAvailable();
    if (!this.isEnableDeveloperMode) {
      // 未开启加上警告引导
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
            url: `https://docs.scriptcat.org${localePath}/docs/use/open-dev/`,
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
    }

    // 监听脚本开启
    this.mq.subscribe<TEnableScript>("enableScript", async (data) => {
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
      const script = await this.scriptDAO.get(data.script.uuid);
      if (!script) {
        this.logger.error("script install failed, script not found", {
          uuid: data.script.uuid,
        });
        return;
      }
      if (script.type === SCRIPT_TYPE_NORMAL) {
        await this.loadPageScript(script);
      }
    });
    // 监听脚本删除
    this.mq.subscribe<TDeleteScript>("deleteScript", async ({ uuid }) => {
      await this.unregistryPageScript(uuid);
      this.deleteScriptMatch(uuid);
    });
    // 监听脚本排序
    this.mq.subscribe<TSortScript>("sortScript", async (scripts) => {
      const uuidSort = Object.fromEntries(scripts.map(({ uuid, sort }) => [uuid, sort]));
      this.scriptMatch.sort((a, b) => uuidSort[a] - uuidSort[b]);
      // 更新缓存
      const scriptMatchCache: { [key: string]: ScriptMatchInfo } = await Cache.getInstance().get("scriptMatch");
      Object.keys(scriptMatchCache).forEach((uuid) => {
        scriptMatchCache[uuid].sort = uuidSort[uuid];
      });
      Cache.getInstance().set("scriptMatch", scriptMatchCache);
    });

    // 监听offscreen环境初始化, 初始化完成后, 再将后台脚本运行起来
    this.mq.subscribe("preparationOffscreen", () => {
      this.scriptDAO.all().then((list) => {
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

    this.systemConfig.addListener(
      "enable_script" + (chrome.extension.inIncognitoContext ? "_incognito" : ""),
      async (enable) => {
        this.isEnableUserscribe = await this.systemConfig.getEnableScript();
        if (chrome.extension.inIncognitoContext) {
          // 隐身窗口不对注册了的脚本进行实际操作
          return;
        }
        if (enable) {
          this.registerUserscripts();
        } else {
          this.unregisterUserscripts();
        }
      }
    );
    // 检查是否开启
    this.isEnableUserscribe = await this.systemConfig.getEnableScript();
    if (this.isEnableUserscribe) {
      this.registerUserscripts();
    }
    this.systemConfig.addListener("blacklist", async (blacklist: string) => {
      // 重新注册用户脚本
      await this.unregisterUserscripts();
      this.registerUserscripts();
      this.loadBlacklist(blacklist);
      this.logger.info("blacklist updated", {
        blacklist,
      });
    });
    // 加载黑名单
    this.loadBlacklist(await this.systemConfig.getBlacklist());
    // 初始化一下userAgentData
    this.initUserAgentData();
  }

  private loadBlacklist(blacklist: string) {
    // 设置黑名单match
    const list = blacklist
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item);
    const result = dealPatternMatches(list, {
      exclude: true,
    });
    this.blackMatch.forEach((uuid) => {
      this.blackMatch.del(uuid);
    });
    result.result.forEach((match) => {
      this.blackMatch.add(match, true);
    });
  }

  unsubscribe: Unsubscribe[] = [];

  // 取消脚本注册
  async unregisterUserscripts() {
    await chrome.userScripts.unregister();
    return this.deleteMessageFlag();
  }

  async registerUserscripts() {
    // 将开启的脚本发送一次enable消息
    const list = await this.scriptDAO.all();
    // 按照脚本顺序位置排序
    list.sort((a, b) => a.sort - b.sort);
    const messageFlag = await this.getMessageFlag();
    if (!messageFlag) {
      // 根据messageFlag来判断是否已经注册过了
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
            // 设置黑名单
            return registerScript;
          });
        })
      ).then(async (res) => {
        // 过滤掉undefined和未开启的
        return res.filter((item) => item) as chrome.userScripts.RegisteredUserScript[];
      });

      // 如果脚本开启, 则注册脚本
      if (this.isEnableDeveloperMode && this.isEnableUserscribe) {
        // 批量注册
        // 先删除所有脚本
        await chrome.userScripts.unregister();
        // 注册脚本
        try {
          await chrome.userScripts.register(registerScripts);
        } catch (e: any) {
          this.logger.error("registerScript error", Logger.E(e));
          // 批量注册失败则退回单个注册
          registerScripts.forEach(async (script) => {
            try {
              await chrome.userScripts.register([script]);
            } catch (e: any) {
              this.logger.error(
                "registerScript single error",
                { id: script.id, matches: script.matches, excludeMatches: script.excludeMatches },
                Logger.E(e)
              );
            }
          });
        }
        const batchData: { [key: string]: any } = {};
        registerScripts.forEach((script) => {
          batchData[`${CACHE_KEY_REGISTRY_SCRIPT}${script.id}`] = true;
        });
        Cache.getInstance().batchSet(batchData);
      }
    }

    // 读取inject.js注入页面
    this.registerInjectScript();

    this.loadScriptMatchInfo();
  }

  getAndGenMessageFlag() {
    return Cache.getInstance().getOrSet("scriptInjectMessageFlag", () => randomMessageFlag());
  }

  deleteMessageFlag() {
    return Cache.getInstance().del("scriptInjectMessageFlag");
  }

  getMessageFlag() {
    return Cache.getInstance().get("scriptInjectMessageFlag");
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

  async getPageScriptUuidByUrl(url: string, includeCustomize?: boolean) {
    const match = await this.loadScriptMatchInfo();
    // 匹配当前页面的脚本
    const matchScriptUuid = match.match(url!);
    // 包含自定义排除的脚本
    if (includeCustomize) {
      const excludeScriptUuid = this.scriptCustomizeMatch.match(url!);
      const match = new Set<string>();
      excludeScriptUuid.forEach((uuid) => {
        match.add(uuid);
      });
      matchScriptUuid.forEach((uuid) => {
        match.add(uuid);
      });
      // 转化为数组
      return Array.from(match);
    }
    return matchScriptUuid;
  }

  async getPageScriptByUrl(url: string, includeCustomize?: boolean) {
    const matchScriptUuid = await this.getPageScriptUuidByUrl(url, includeCustomize);
    return matchScriptUuid.map((uuid) => {
      return Object.assign({}, this.scriptMatchCache?.get(uuid));
    });
  }

  async pageLoad(_: any, sender: GetSender) {
    if (!this.isEnableUserscribe) {
      return { flag: "", scripts: [] };
    }
    // 判断是否黑名单
    const isBlack = this.blackMatch.match(sender.getSender().url!);
    if (isBlack.length > 0) {
      // 如果在黑名单中, 则不加载脚本
      return { flag: "", scripts: [] };
    }

    const [scriptFlag] = await Promise.all([this.getMessageFlag(), this.loadScriptMatchInfo()]); // 只执行 loadScriptMatchInfo 但不获取结果
    const chromeSender = sender.getSender() as MessageSender;

    // 匹配当前页面的脚本
    const matchScriptUuid = await this.getPageScriptUuidByUrl(chromeSender.url!);

    const enableScript = matchScriptUuid.reduce((arr, uuid) => {
      const scriptRes = Object.assign({}, this.scriptMatchCache?.get(uuid));
      // 判断脚本是否开启
      if (scriptRes.status === SCRIPT_STATUS_DISABLE) {
        return arr;
      }
      // 判断注入页面类型
      if (scriptRes.metadata["run-in"]) {
        // 判断插件运行环境
        const contextType = chrome.extension.inIncognitoContext ? "incognito-tabs" : "normal-tabs";
        if (!scriptRes.metadata["run-in"].includes(contextType)) {
          return arr;
        }
      }
      // 如果是iframe,判断是否允许在iframe里运行
      if (chromeSender.frameId) {
        if (scriptRes.metadata.noframes) {
          return arr;
        }
      }
      arr.push(scriptRes as ScriptLoadInfo);
      return arr;
    }, [] as ScriptLoadInfo[]);

    await Promise.all([
      // 加载value
      ...enableScript.map(async (script) => {
        const value = await this.value.getScriptValue(script!);
        script.value = value;
      }),
      // 加载resource
      ...enableScript.map(async (script) => {
        const resource = await this.resource.getScriptResources(script, false);
        script.resource = resource;
      }),
      // 加载code相关的信息
      ...enableScript.map(async (script) => {
        const code = await this.scriptDAO.scriptCodeDAO.get(script.uuid);
        if (code) {
          const metadataStr = getMetadataStr(code.code) || "";
          const userConfigStr = getUserConfigStr(code.code) || "";
          script.metadataStr = metadataStr;
          script.userConfigStr = userConfigStr;
        }
      }),
    ]);

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
  stopScript(uuid: string) {
    return stopScript(this.sender, uuid);
  }

  // 运行脚本
  async runScript(uuid: string) {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return;
    }
    const res = await this.script.buildScriptRunResource(script);
    return runScript(this.sender, res);
  }

  // 注册inject.js
  async registerInjectScript() {
    // 如果没设置过, 则更新messageFlag
    let messageFlag = await this.getMessageFlag();
    if (!messageFlag) {
      // 黑名单排除
      const blacklist = await this.systemConfig.getBlacklist();
      const excludeMatches = [];
      if (blacklist) {
        const list = blacklist
          .split("\n")
          .map((item) => item.trim())
          .filter((item) => item);
        const result = dealPatternMatches(list, {
          exclude: true,
        });
        excludeMatches.push(...result.patternResult);
      }

      messageFlag = await this.getAndGenMessageFlag();
      const injectJs = await fetch("/src/inject.js").then((res) => res.text());
      // 替换ScriptFlag
      const code = `(function (MessageFlag) {\n${injectJs}\n})('${messageFlag}')`;
      chrome.userScripts.configureWorld({
        csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
        messaging: true,
      });
      const scripts: chrome.userScripts.RegisteredUserScript[] = [
        {
          id: "scriptcat-inject",
          js: [{ code }],
          matches: ["<all_urls>"],
          allFrames: true,
          world: "MAIN",
          runAt: "document_start",
          excludeMatches,
        },
        // 注册content
        {
          id: "scriptcat-content",
          js: [{ file: "src/content.js" }],
          matches: ["<all_urls>"],
          allFrames: true,
          runAt: "document_start",
          world: "USER_SCRIPT",
          excludeMatches,
        },
      ];
      try {
        // 如果使用getScripts来判断, 会出现找不到的问题
        // 另外如果使用
        await chrome.userScripts.register(scripts);
      } catch (e: any) {
        this.logger.error("register inject.js error", Logger.E(e));
        if (e.message?.includes("Duplicate script ID")) {
          // 如果是重复注册, 则更新
          try {
            await chrome.userScripts.update(scripts);
          } catch (e) {
            this.logger.error("update inject.js error", Logger.E(e));
          }
        }
      }
    }
  }

  loadingScript: Promise<void> | null | undefined;

  // 加载脚本匹配信息，由于service_worker的机制，如果由不活动状态恢复过来时，会优先触发事件
  // 可能当时会没有脚本匹配信息，所以使用脚本信息时，尽量使用此方法获取
  async loadScriptMatchInfo() {
    if (this.scriptMatchCache) {
      return this.scriptMatch;
    }
    if (this.loadingScript) {
      await this.loadingScript;
    } else {
      // 如果没有缓存, 则创建一个新的缓存
      const cache = new Map<string, ScriptMatchInfo>();
      this.loadingScript = Cache.getInstance()
        .get("scriptMatch")
        .then((data: { [key: string]: ScriptMatchInfo }) => {
          if (data) {
            Object.entries(data)
              .sort(([, a], [, b]) => a.sort - b.sort)
              .forEach(([key]) => {
                const item = data[key];
                cache.set(item.uuid, item);
                this.syncAddScriptMatch(item);
              });
          }
        });
      await this.loadingScript;
      this.loadingScript = null;
      this.scriptMatchCache = cache;
    }
    return this.scriptMatch;
  }

  // 保存脚本匹配信息
  async saveScriptMatchInfo() {
    if (!this.scriptMatchCache) {
      return;
    }
    const scriptMatch = {} as { [key: string]: ScriptMatchInfo };
    this.scriptMatchCache.forEach((val, key) => {
      scriptMatch[key] = val;
      // 优化性能，将不需要的信息去掉
      // 而且可能会超过缓存的存储限制
      scriptMatch[key].code = "";
      scriptMatch[key].value = {};
      scriptMatch[key].resource = {};
    });
    return await Cache.getInstance().set("scriptMatch", scriptMatch);
  }

  async addScriptMatch(item: ScriptMatchInfo) {
    if (!this.scriptMatchCache) {
      await this.loadScriptMatchInfo();
    }
    this.scriptMatchCache!.set(item.uuid, item);
    this.syncAddScriptMatch(item);
    this.saveScriptMatchInfo();
  }

  syncAddScriptMatch(item: ScriptMatchInfo) {
    // 清理一下老数据
    this.scriptMatch.del(item.uuid);
    this.scriptCustomizeMatch.del(item.uuid);
    // 添加新的数据
    item.matches.forEach((match) => {
      this.scriptMatch.add(match, item.uuid);
    });
    item.excludeMatches.forEach((match) => {
      this.scriptMatch.exclude(match, item.uuid);
    });
    item.customizeExcludeMatches.forEach((match) => {
      this.scriptCustomizeMatch.add(match, item.uuid);
    });
  }

  async updateScriptStatus(uuid: string, status: SCRIPT_STATUS) {
    if (!this.scriptMatchCache) {
      await this.loadScriptMatchInfo();
    }
    const script = await this.scriptMatchCache!.get(uuid);
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
    this.scriptMatch.del(uuid);
    this.scriptCustomizeMatch.del(uuid);
    this.saveScriptMatchInfo();
  }

  // 构建userScript注册信息
  async getAndSetUserScriptRegister(script: Script) {
    const scriptRes = await this.script.buildScriptRunResource(script);
    const matches = scriptRes.metadata["match"] || [];
    matches.push(...(scriptRes.metadata["include"] || []));
    if (!matches.length) {
      return undefined;
    }

    scriptRes.code = compileInjectScript(scriptRes, scriptRes.code);

    const patternMatches = dealPatternMatches(matches);
    const scriptMatchInfo: ScriptMatchInfo = Object.assign(
      { matches: patternMatches.result, excludeMatches: [], customizeExcludeMatches: [] },
      scriptRes
    );

    const registerScript: chrome.userScripts.RegisteredUserScript = {
      id: scriptRes.uuid,
      js: [{ code: scriptRes.code }],
      matches: patternMatches.patternResult,
      allFrames: !scriptRes.metadata["noframes"],
      world: "MAIN",
      excludeMatches: [],
    };

    // 排除由loadPage时决定, 不使用userScript的excludeMatches处理
    if (script.metadata["exclude"]) {
      const excludeMatches = script.metadata["exclude"];
      const result = dealPatternMatches(excludeMatches, {
        exclude: true,
      });

      // registerScript.excludeMatches = result.patternResult;
      scriptMatchInfo.excludeMatches = result.result;
    }
    // 自定义排除
    if (script.selfMetadata && script.selfMetadata.exclude) {
      const excludeMatches = script.selfMetadata.exclude;
      const result = dealPatternMatches(excludeMatches, {
        exclude: true,
      });

      // registerScript.excludeMatches.push(...result.patternResult);
      scriptMatchInfo.customizeExcludeMatches = result.result;
    }

    // 黑名单排除
    const blacklist = await this.systemConfig.getBlacklist();
    if (blacklist) {
      const list = blacklist
        .split("\n")
        .map((item) => item.trim())
        .filter((item) => item);
      const result = dealPatternMatches(list, {
        exclude: true,
      });
      // scriptMatchInfo.excludeMatches.push(...result.result);
      registerScript.excludeMatches!.push(...result.patternResult);
    }

    // 将脚本match信息放入缓存中
    this.addScriptMatch(scriptMatchInfo);

    if (scriptRes.metadata["run-at"]) {
      registerScript.runAt = getRunAt(scriptRes.metadata["run-at"]);
    }

    return {
      scriptMatchInfo,
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
    if (this.isEnableDeveloperMode && this.isEnableUserscribe && script.status === SCRIPT_STATUS_ENABLE) {
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
      await Cache.getInstance().set(`${CACHE_KEY_REGISTRY_SCRIPT}${uuid}`, true);
    }
  }

  async unregistryPageScript(uuid: string) {
    if (
      !this.isEnableDeveloperMode ||
      !this.isEnableUserscribe ||
      !(await Cache.getInstance().get(`${CACHE_KEY_REGISTRY_SCRIPT}${uuid}`))
    ) {
      return;
    }
    // 删除缓存
    Cache.getInstance().del(`${CACHE_KEY_REGISTRY_SCRIPT}${uuid}`);
    // 修改脚本状态为disable
    this.updateScriptStatus(uuid, SCRIPT_STATUS_DISABLE);
    chrome.userScripts.unregister({ ids: [uuid] });
  }
}
