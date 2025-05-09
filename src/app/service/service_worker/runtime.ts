import { MessageQueue, Unsubscribe } from "@Packages/message/message_queue";
import { ExtMessageSender, GetSender, Group, MessageSend } from "@Packages/message/server";
import {
  Script,
  SCRIPT_STATUS,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
  ScriptRunResouce,
} from "@App/app/repo/scripts";
import { ValueService } from "./value";
import GMApi from "./gm_api";
import { subscribeScriptDelete, subscribeScriptEnable, subscribeScriptInstall } from "../queue";
import { ScriptService } from "./script";
import { runScript, stopScript } from "../offscreen/client";
import { getRunAt } from "./utils";
import { isUserScriptsAvailable, randomString } from "@App/pkg/utils/utils";
import Cache from "@App/app/cache";
import { dealPatternMatches, UrlMatch } from "@App/pkg/utils/match";
import { ExtensionContentMessageSend } from "@Packages/message/extension_message";
import { sendMessage } from "@Packages/message/client";
import { compileInjectScript } from "../content/utils";
import LoggerCore from "@App/app/logger/core";
import PermissionVerify from "./permission_verify";
import { SystemConfig } from "@App/pkg/config/config";
import { ResourceService } from "./resource";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import Logger from "@App/app/logger/logger";

// 为了优化性能，存储到缓存时删除了code、value与resource
export interface ScriptMatchInfo extends ScriptRunResouce {
  matches: string[];
  excludeMatches: string[];
  customizeExcludeMatches: string[];
}

export interface EmitEventRequest {
  uuid: string;
  event: string;
  eventId: string;
  data?: any;
}

export class RuntimeService {
  scriptMatch: UrlMatch<string> = new UrlMatch<string>();
  scriptCustomizeMatch: UrlMatch<string> = new UrlMatch<string>();
  scriptMatchCache: Map<string, ScriptMatchInfo> | null | undefined;

  logger: Logger;

  isEnableDeveloperMode = false;
  isEnableUserscribe = true;

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

  async init() {
    // 启动gm api
    const permission = new PermissionVerify(this.group.group("permission"), this.mq);
    const gmApi = new GMApi(this.systemConfig, permission, this.group, this.sender, this.mq, this.value, this);
    permission.init();
    gmApi.start();

    this.group.on("stopScript", this.stopScript.bind(this));
    this.group.on("runScript", this.runScript.bind(this));
    this.group.on("pageLoad", this.pageLoad.bind(this));

    // 检查是否开启了开发者模式
    this.isEnableDeveloperMode = isUserScriptsAvailable();
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
            url: `https://docs.scriptcat.org/docs/use/open-dev/`,
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
    subscribeScriptEnable(this.mq, async (data) => {
      const script = await this.scriptDAO.getAndCode(data.uuid);
      if (!script) {
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
    subscribeScriptInstall(this.mq, async (data) => {
      const script = await this.scriptDAO.get(data.script.uuid);
      if (!script) {
        return;
      }
      if (script.type === SCRIPT_TYPE_NORMAL) {
        await this.loadPageScript(script);
      }
    });
    // 监听脚本删除
    subscribeScriptDelete(this.mq, async ({ uuid }) => {
      await this.unregistryPageScript(uuid);
      this.deleteScriptMatch(uuid);
    });

    this.systemConfig.addListener("enable_script", (enable) => {
      this.isEnableUserscribe = enable;
      if (enable) {
        this.registerUserscripts();
      } else {
        this.unregisterUserscripts();
      }
    });
    // 检查是否开启
    this.isEnableUserscribe = await this.systemConfig.getEnableScript();
    if (this.isEnableUserscribe) {
      this.registerUserscripts();
    }
  }

  unsubscribe: Unsubscribe[] = [];

  // 取消脚本注册
  unregisterUserscripts() {
    chrome.userScripts.unregister();
    this.deleteMessageFlag();
  }

  async registerUserscripts() {
    // 监听offscreen环境初始化, 初始化完成后, 再将后台脚本运行起来
    this.mq.subscribe("preparationOffscreen", () => {
      this.scriptDAO.all().then((list) => {
        list.forEach((script) => {
          if (script.type === SCRIPT_TYPE_NORMAL) {
            return;
          }
          this.mq.publish("enableScript", { uuid: script.uuid, enable: script.status === SCRIPT_STATUS_ENABLE });
        });
      });
    });

    // 将开启的脚本发送一次enable消息
    const list = await this.scriptDAO.all();
    let messageFlag = await this.getMessageFlag();
    if (!messageFlag) {
      // 根据messageFlag来判断是否已经注册过了
      const registerScripts = await list.reduce(
        async (arr, script) => {
          const result = await arr;
          // 非普通脚本、未开启则不注册
          if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
            return result;
          }

          const res = await this.getUserScriptRegister(script);
          if (!res) {
            return result;
          }
          const { registerScript } = res!;

          // 过滤掉matches为空的脚本
          if (!registerScript.matches || registerScript.matches.length === 0) {
            this.logger.error("registerScript matches is empty", {
              script: script.name,
              uuid: script.uuid,
            });
            return result;
          }
          return [...result, registerScript];
        },
        Promise.resolve([] as chrome.userScripts.RegisteredUserScript[])
      );

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
        }
        const batchData: { [key: string]: any } = {};
        registerScripts.forEach((script) => {
          batchData["registryScript:" + script.id] = true;
        });
        Cache.getInstance().batchSet(batchData);
      }
    }

    // 读取inject.js注入页面
    this.registerInjectScript();

    this.loadScriptMatchInfo();
  }

  messageFlag() {
    return Cache.getInstance().getOrSet("scriptInjectMessageFlag", () => {
      return Promise.resolve(randomString(16));
    });
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
    const [scriptFlag] = await Promise.all([this.messageFlag(), this.loadScriptMatchInfo()]);
    const chromeSender = sender.getSender() as chrome.runtime.MessageSender;

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
      // 获取value
      arr.push(scriptRes);
      return arr;
    }, [] as ScriptMatchInfo[]);

    await Promise.all([
      // 加载value
      ...enableScript.map(async (script) => {
        const value = await this.value.getScriptValue(script!);
        script.value = value;
      }),
      // 加载resource
      ...enableScript.map(async (script) => {
        const resource = await this.resource.getScriptResources(script);
        script.resource = resource;
      }),
    ]);

    this.mq.emit("pageLoad", {
      tabId: chromeSender.tab?.id,
      frameId: chromeSender.frameId,
      scripts: enableScript,
    });

    return Promise.resolve({ flag: scriptFlag, scripts: enableScript });
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
      messageFlag = await this.messageFlag();
      const injectJs = await fetch("inject.js").then((res) => res.text());
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
        },
        // 注册content
        {
          id: "scriptcat-content",
          js: [{ file: "src/content.js" }],
          matches: ["<all_urls>"],
          allFrames: true,
          runAt: "document_start",
          world: "USER_SCRIPT",
        },
      ];
      try {
        // 如果使用getScripts来判断, 会出现找不到的问题
        // 另外如果使用
        await chrome.userScripts.register(scripts);
      } catch (e: any) {
        this.logger.error("register inject.js error", Logger.E(e));
        if (e.message?.indexOf("Duplicate script ID") !== -1) {
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
            Object.keys(data).forEach((key) => {
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
  async getUserScriptRegister(script: Script) {
    const scriptRes = await this.script.buildScriptRunResource(script);
    const matches = scriptRes.metadata["match"];
    if (!matches) {
      return undefined;
    }

    scriptRes.code = compileInjectScript(scriptRes);

    matches.push(...(scriptRes.metadata["include"] || []));
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

      if (!registerScript.excludeMatches) {
        registerScript.excludeMatches = [];
      }
      // registerScript.excludeMatches.push(...result.patternResult);
      scriptMatchInfo.customizeExcludeMatches = result.result;
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
    const resp = await this.getUserScriptRegister(script);
    if (!resp) {
      return;
    }
    const { registerScript } = resp;

    // 如果脚本开启, 则注册脚本
    if (this.isEnableDeveloperMode && this.isEnableUserscribe && script.status === SCRIPT_STATUS_ENABLE) {
      const res = await chrome.userScripts.getScripts({ ids: [script.uuid] });
      const logger = LoggerCore.logger({
        name: script.name,
        registerMatch: {
          matches: registerScript.matches,
          excludeMatches: registerScript.excludeMatches,
        },
      });
      if (res.length > 0) {
        await chrome.userScripts.update([registerScript], () => {
          if (chrome.runtime.lastError) {
            logger.error("update registerScript error", {
              error: chrome.runtime.lastError,
            });
          }
        });
      } else {
        await chrome.userScripts.register([registerScript], () => {
          if (chrome.runtime.lastError) {
            logger.error("registerScript error", {
              error: chrome.runtime.lastError,
            });
          }
        });
      }
      await Cache.getInstance().set("registryScript:" + script.uuid, true);
    }
  }

  async unregistryPageScript(uuid: string) {
    if (
      !this.isEnableDeveloperMode ||
      !this.isEnableUserscribe ||
      !(await Cache.getInstance().get("registryScript:" + uuid))
    ) {
      return;
    }
    // 删除缓存
    Cache.getInstance().del("registryScript:" + uuid);
    // 修改脚本状态为disable
    this.updateScriptStatus(uuid, SCRIPT_STATUS_DISABLE);
    chrome.userScripts.unregister({ ids: [uuid] });
  }
}
