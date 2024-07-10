// 脚本运行时,主要负责脚本的加载和匹配
// 油猴脚本将监听页面的创建,将代码注入到页面中
import MessageSandbox from "@App/app/message/sandbox";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import {
  Script,
  SCRIPT_RUN_STATUS,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
  ScriptRunResouce,
  SCRIPT_RUN_STATUS_RUNNING,
  Metadata,
} from "@App/app/repo/scripts";
import ResourceManager from "@App/app/service/resource/manager";
import ValueManager from "@App/app/service/value/manager";
import { dealScript, randomString } from "@App/pkg/utils/utils";
import { UrlInclude, UrlMatch } from "@App/pkg/utils/match";
import {
  MessageHander,
  MessageSender,
  TargetTag,
} from "@App/app/message/message";
import ScriptManager from "@App/app/service/script/manager";
import { Channel } from "@App/app/message/channel";
import IoC from "@App/app/ioc";
import Manager from "@App/app/service/manager";
import Hook from "@App/app/service/hook";
import { i18nName } from "@App/locales/locales";
import { compileInjectScript, compileScriptCode } from "../content/utils";
import GMApi, { Request } from "./gm_api";
import { genScriptMenu } from "./utils";

export type RuntimeEvent = "start" | "stop" | "watchRunStatus";

export type ScriptMenuItem = {
  id: number;
  name: string;
  accessKey?: string;
  sender: MessageSender;
  channelFlag: string;
};

export type ScriptMenu = {
  id: number;
  name: string;
  enable: boolean;
  updatetime: number;
  hasUserConfig: boolean;
  metadata: Metadata;
  runStatus?: SCRIPT_RUN_STATUS;
  runNum: number;
  runNumByIframe: number;
  menus?: ScriptMenuItem[];
  customExclude?: string[];
};

// 后台脚本将会将代码注入到沙盒中
@IoC.Singleton(MessageHander, ResourceManager, ValueManager)
export default class Runtime extends Manager {
  messageSandbox?: MessageSandbox;

  scriptDAO: ScriptDAO;

  resourceManager: ResourceManager;

  valueManager: ValueManager;

  logger: Logger;

  match: UrlMatch<ScriptRunResouce> = new UrlMatch();

  include: UrlInclude<ScriptRunResouce> = new UrlInclude();

  // 自定义排除
  customizeExclude: UrlMatch<ScriptRunResouce> = new UrlMatch();

  static hook = new Hook<"runStatus">();

  // 运行中和开启的后台脚本
  runBackScript: Map<number, Script> = new Map();

  constructor(
    message: MessageHander,
    resourceManager: ResourceManager,
    valueManager: ValueManager
  ) {
    super(message, "runtime");
    this.scriptDAO = new ScriptDAO();
    this.resourceManager = resourceManager;
    this.valueManager = valueManager;
    this.logger = LoggerCore.getInstance().logger({ component: "runtime" });
    ScriptManager.hook.addListener("upsert", this.scriptUpdate.bind(this));
    ScriptManager.hook.addListener("delete", this.scriptDelete.bind(this));
    ScriptManager.hook.addListener("enable", this.scriptUpdate.bind(this));
    ScriptManager.hook.addListener("disable", this.scriptUpdate.bind(this));
  }

  start(): void {
    // 监听前端消息
    // 此处是处理执行单次脚本的消息
    this.listenEvent("start", (id) => {
      return this.scriptDAO
        .findById(id)
        .then((script) => {
          if (!script) {
            throw new Error("script not found");
          }
          // 因为如果直接引用Runtime,会导致循环依赖,暂时这样处理,后面再梳理梳理
          return this.startBackgroundScript(script);
        })
        .catch((e) => {
          this.logger.error("run error", Logger.E(e));
          throw e;
        });
    });

    this.listenEvent("stop", (id) => {
      return this.scriptDAO
        .findById(id)
        .then((script) => {
          if (!script) {
            throw new Error("script not found");
          }
          // 因为如果直接引用Runtime,会导致循环依赖,暂时这样处理
          return this.stopBackgroundScript(id);
        })
        .catch((e) => {
          this.logger.error("stop error", Logger.E(e));
          throw e;
        });
    });
    // 监听脚本运行状态
    this.listenScriptRunStatus();

    // 启动普通脚本
    this.scriptDAO.table.toArray((items) => {
      items.forEach((item) => {
        // 容错处理
        if (!item) {
          this.logger.error("script is null");
          return;
        }
        if (item.type !== SCRIPT_TYPE_NORMAL) {
          return;
        }
        // 加载所有的脚本
        if (item.status === SCRIPT_STATUS_ENABLE) {
          this.enable(item);
        } else {
          // 只处理未开启的普通页面脚本
          this.disable(item);
        }
      });
    });

    // 接受消息,注入脚本
    // 获取注入源码

    // 监听菜单创建
    const scriptMenu: Map<
      number | TargetTag,
      Map<
        number,
        {
          request: Request;
          channel: Channel;
        }[]
      >
    > = new Map();
    GMApi.hook.addListener(
      "registerMenu",
      (request: Request, channel: Channel) => {
        let senderId: number | TargetTag;
        if (!request.sender.tabId) {
          // 非页面脚本
          senderId = request.sender.targetTag;
        } else {
          senderId = request.sender.tabId;
        }
        let tabMap = scriptMenu.get(senderId);
        if (!tabMap) {
          tabMap = new Map();
          scriptMenu.set(senderId, tabMap);
        }
        let menuArr = tabMap.get(request.scriptId);
        if (!menuArr) {
          menuArr = [];
          tabMap.set(request.scriptId, menuArr);
        }
        // 查询菜单是否已经存在
        for (let i = 0; i < menuArr.length; i += 1) {
          // id 相等 跳过,选第一个,并close链接
          if (menuArr[i].request.params[0] === request.params[0]) {
            channel.disChannel();
            return;
          }
        }
        menuArr.push({ request, channel });
        // 偷懒行为, 直接重新生成菜单
        genScriptMenu(senderId, scriptMenu);
      }
    );
    GMApi.hook.addListener("unregisterMenu", (id, request: Request) => {
      let senderId: number | TargetTag;
      if (!request.sender.tabId) {
        // 非页面脚本
        senderId = request.sender.targetTag;
      } else {
        senderId = request.sender.tabId;
      }
      const tabMap = scriptMenu.get(senderId);
      if (tabMap) {
        const menuArr = tabMap.get(request.scriptId);
        if (menuArr) {
          // 从菜单数组中遍历删除
          for (let i = 0; i < menuArr.length; i += 1) {
            if (menuArr[i].request.params[0] === id) {
              menuArr.splice(i, 1);
              break;
            }
          }
          if (menuArr.length === 0) {
            tabMap.delete(request.scriptId);
          }
        }
        if (!tabMap.size) {
          scriptMenu.delete(senderId);
        }
      }
      // 偷懒行为
      genScriptMenu(senderId, scriptMenu);
    });

    // 监听页面切换加载菜单
    chrome.tabs.onActivated.addListener((activeInfo) => {
      genScriptMenu(activeInfo.tabId, scriptMenu);
    });

    Runtime.hook.addListener("runStatus", async (scriptId: number) => {
      const script = await this.scriptDAO.findById(scriptId);
      if (!script) {
        return;
      }
      if (
        script.status !== SCRIPT_STATUS_ENABLE &&
        script.runStatus !== "running"
      ) {
        // 没开启并且不是运行中的脚本,删除
        this.runBackScript.delete(scriptId);
      } else {
        // 否则进行一次更新
        this.runBackScript.set(scriptId, script);
      }
    });

    // 记录运行次数与iframe运行
    const runScript = new Map<
      number,
      Map<number, { script: Script; runNum: number; runNumByIframe: number }>
    >();
    const addRunScript = (
      tabId: number,
      script: Script,
      iframe: boolean,
      num: number = 1
    ) => {
      let scripts = runScript.get(tabId);
      if (!scripts) {
        scripts = new Map();
        runScript.set(tabId, scripts);
      }
      let scriptNum = scripts.get(script.id);
      if (!scriptNum) {
        scriptNum = { script, runNum: 0, runNumByIframe: 0 };
        scripts.set(script.id, scriptNum);
      }
      if (script.status === SCRIPT_STATUS_ENABLE) {
        scriptNum.runNum += num;
        if (iframe) {
          scriptNum.runNumByIframe += num;
        }
      }
    };
    chrome.tabs.onRemoved.addListener((tabId) => {
      runScript.delete(tabId);
    });
    // 给popup页面获取运行脚本,与菜单
    this.message.setHandler(
      "queryPageScript",
      async (action: string, { url, tabId }: any) => {
        const tabMap = scriptMenu.get(tabId);
        const run = runScript.get(tabId);
        let matchScripts = [];
        if (!run) {
          matchScripts = this.matchUrl(url).map((item) => {
            return { runNum: 0, runNumByIframe: 0, script: item };
          });
        } else {
          matchScripts = Array.from(run.values());
        }
        const allPromise: Promise<ScriptMenu>[] = matchScripts.map(
          async (item) => {
            const menus: ScriptMenuItem[] = [];
            if (tabMap) {
              tabMap.get(item.script.id)?.forEach((scriptItem) => {
                menus.push({
                  name: scriptItem.request.params[1],
                  accessKey: scriptItem.request.params[2],
                  id: scriptItem.request.params[0],
                  sender: scriptItem.request.sender,
                  channelFlag: scriptItem.channel.flag,
                });
              });
            }
            const script = await this.scriptDAO.findById(item.script.id);
            if (!script) {
              return {
                id: item.script.id,
                name: i18nName(item.script),
                enable: item.script.status === SCRIPT_STATUS_ENABLE,
                updatetime: item.script.updatetime || item.script.createtime,
                metadata: item.script.metadata,
                hasUserConfig: !!item.script.config,
                runNum: item.runNum,
                runNumByIframe: item.runNumByIframe,
                customExclude:
                  item.script.selfMetadata && item.script.selfMetadata.exclude,
                menus,
              };
            }
            return {
              id: script.id,
              name: i18nName(script),
              enable: script.status === SCRIPT_STATUS_ENABLE,
              updatetime: script.updatetime || script.createtime,
              metadata: item.script.metadata,
              hasUserConfig: !!script?.config,
              runNum: item.runNum,
              runNumByIframe: item.runNumByIframe,
              customExclude: script.selfMetadata && script.selfMetadata.exclude,
              menus,
            };
          }
        );

        const scriptList: ScriptMenu[] = await Promise.all(allPromise);

        const backScriptList: ScriptMenu[] = [];
        const sandboxMenuMap = scriptMenu.get("sandbox");
        this.runBackScript.forEach((item) => {
          const menus: ScriptMenuItem[] = [];
          if (sandboxMenuMap) {
            sandboxMenuMap?.get(item.id)?.forEach((scriptItem) => {
              menus.push({
                name: scriptItem.request.params[1],
                accessKey: scriptItem.request.params[2],
                id: scriptItem.request.params[0],
                sender: scriptItem.request.sender,
                channelFlag: scriptItem.channel.flag,
              });
            });
          }

          backScriptList.push({
            id: item.id,
            name: item.name,
            enable: item.status === SCRIPT_STATUS_ENABLE,
            updatetime: item.updatetime || item.createtime,
            metadata: item.metadata,
            runStatus: item.runStatus,
            hasUserConfig: !!item.config,
            runNum:
              item.runStatus && item.runStatus === SCRIPT_RUN_STATUS_RUNNING
                ? 1
                : 0,
            menus,
            runNumByIframe: 0,
          });
        });
        return Promise.resolve({
          scriptList,
          backScriptList,
        });
      }
    );

    // content页发送页面加载完成消息,注入脚本
    this.message.setHandler(
      "pageLoad",
      (_action: string, data: any, sender: MessageSender) => {
        return new Promise((resolve) => {
          if (!sender) {
            return;
          }
          if (!(sender.url && sender.tabId)) {
            return;
          }
          if (sender.frameId === undefined) {
            // 清理之前的数据
            runScript.delete(sender.tabId);
          }
          // 未开启
          if (localStorage.enable_script === "false") {
            return;
          }
          const exclude = this.customizeExclude.match(sender.url);
          // 自定义排除的, buildScriptRunResource时会将selfMetadata合并,所以后续不需要再处理metadata.exclude,这算是一个隐性的坑,后面看看要不要处理
          exclude.forEach((val) => {
            addRunScript(sender.tabId!, val, false, 0);
          });
          const filter: ScriptRunResouce[] = this.matchUrl(
            sender.url,
            (script) => {
              // 如果是iframe,判断是否允许在iframe里运行
              if (sender.frameId !== undefined) {
                if (script.metadata.noframes) {
                  return true;
                }
                addRunScript(sender.tabId!, script, true);
                return script.status !== SCRIPT_STATUS_ENABLE;
              }
              addRunScript(sender.tabId!, script, false);
              return script.status !== SCRIPT_STATUS_ENABLE;
            }
          );

          if (!filter.length) {
            resolve({ scripts: [] });
            return;
          }

          resolve({ scripts: filter });

          // 注入脚本
          filter.forEach((script) => {
            let runAt = "document_idle";
            if (script.metadata["run-at"]) {
              [runAt] = script.metadata["run-at"];
            }
            switch (runAt) {
              case "document-body":
              case "document-start":
                runAt = "document_start";
                break;
              case "document-end":
                runAt = "document_end";
                break;
              case "document-idle":
              default:
                runAt = "document_idle";
                break;
            }
            chrome.tabs.executeScript(sender.tabId!, {
              frameId: sender.frameId,
              code: `(function(){
                let temp = document.createElementNS("http://www.w3.org/1999/xhtml", "script");
                    temp.setAttribute('type', 'text/javascript');
                    temp.innerHTML = "${script.code}";
                    temp.className = "injected-js";
                    document.documentElement.appendChild(temp);
                    temp.remove();
                }())`,
              runAt,
            });
          });

          // 角标和脚本
          chrome.browserAction.getBadgeText(
            {
              tabId: sender.tabId,
            },
            (res: string) => {
              chrome.browserAction.setBadgeText({
                text: (filter.length + (parseInt(res, 10) || 0)).toString(),
                tabId: sender.tabId,
              });
            }
          );
          chrome.browserAction.setBadgeBackgroundColor({
            color: "#4e5969",
            tabId: sender.tabId,
          });
        });
      }
    );
  }

  setMessageSandbox(messageSandbox: MessageSandbox) {
    this.messageSandbox = messageSandbox;
  }

  // 启动沙盒相关脚本
  startSandbox(messageSandbox: MessageSandbox) {
    this.messageSandbox = messageSandbox;
    this.scriptDAO.table.toArray((items) => {
      items.forEach((item) => {
        // 容错处理
        if (!item) {
          this.logger.error("script is null");
          return;
        }
        if (item.type === SCRIPT_TYPE_NORMAL) {
          return;
        }
        // 加载所有的脚本
        if (item.status === SCRIPT_STATUS_ENABLE) {
          this.enable(item);
          this.runBackScript.set(item.id, item);
        }
      });
    });
  }

  listenScriptRunStatus() {
    // 监听沙盒发送的脚本运行状态消息
    this.message.setHandler(
      "scriptRunStatus",
      (action, [scriptId, runStatus, error, nextruntime]: any) => {
        this.scriptDAO.update(scriptId, {
          runStatus,
          lastruntime: new Date().getTime(),
          nextruntime,
          error,
        });
        Runtime.hook.trigger("runStatus", scriptId, runStatus);
      }
    );
    // 处理前台发送的脚本运行状态监听请求
    this.message.setHandlerWithChannel("watchRunStatus", (channel) => {
      const hook = (scriptId: number, status: SCRIPT_RUN_STATUS) => {
        channel.send([scriptId, status]);
      };
      Runtime.hook.addListener("runStatus", hook);
      channel.setDisChannelHandler(() => {
        Runtime.hook.removeListener("runStatus", hook);
      });
    });
  }

  // 脚本发生变动
  async scriptUpdate(script: Script): Promise<boolean> {
    // 脚本更新先更新资源
    await this.resourceManager.checkScriptResource(script);
    if (script.status === SCRIPT_STATUS_ENABLE) {
      return this.enable(script as ScriptRunResouce);
    }
    return this.disable(script);
  }

  matchUrl(url: string, filterFunc?: (script: Script) => boolean) {
    const scripts = this.match.match(url);
    // 再include中匹配
    scripts.push(...this.include.match(url));
    const filter: { [key: string]: ScriptRunResouce } = {};
    // 去重
    scripts.forEach((script) => {
      if (filterFunc && filterFunc(script)) {
        return;
      }
      filter[script.id] = script;
    });
    // 转换成数组
    return Object.keys(filter).map((key) => filter[key]);
  }

  // 脚本删除
  async scriptDelete(script: Script): Promise<boolean> {
    // 清理匹配资源
    if (script.type === SCRIPT_TYPE_NORMAL) {
      this.match.del(<ScriptRunResouce>script);
      this.include.del(<ScriptRunResouce>script);
    } else {
      this.unloadBackgroundScript(script);
    }
    return Promise.resolve(true);
  }

  // 脚本开启
  async enable(script: Script): Promise<boolean> {
    // 编译脚本运行资源
    const scriptRes = await this.buildScriptRunResource(script);
    if (script.type !== SCRIPT_TYPE_NORMAL) {
      return this.loadBackgroundScript(scriptRes);
    }
    return this.loadPageScript(scriptRes);
  }

  // 脚本关闭
  disable(script: Script): Promise<boolean> {
    if (script.type !== SCRIPT_TYPE_NORMAL) {
      return this.unloadBackgroundScript(script);
    }
    return this.unloadPageScript(script);
  }

  // 加载页面脚本
  loadPageScript(script: ScriptRunResouce) {
    // 重构code
    const logger = this.logger.with({
      scriptId: script.id,
      name: script.name,
    });
    script.code = dealScript(compileInjectScript(script));

    this.match.del(<ScriptRunResouce>script);
    this.include.del(<ScriptRunResouce>script);
    if (script.metadata.match) {
      script.metadata.match.forEach((url) => {
        try {
          this.match.add(url, script);
        } catch (e) {
          logger.error("url load error", Logger.E(e));
        }
      });
    }
    if (script.metadata.include) {
      script.metadata.include.forEach((url) => {
        try {
          this.include.add(url, script);
        } catch (e) {
          logger.error("url load error", Logger.E(e));
        }
      });
    }
    if (script.metadata.exclude) {
      script.metadata.exclude.forEach((url) => {
        try {
          this.include.exclude(url, script);
          this.match.exclude(url, script);
        } catch (e) {
          logger.error("url load error", Logger.E(e));
        }
      });
    }
    if (script.selfMetadata && script.selfMetadata.exclude) {
      script.selfMetadata.exclude.forEach((url) => {
        try {
          this.customizeExclude.add(url, script);
        } catch (e) {
          logger.error("url load error", Logger.E(e));
        }
      });
    }
    return Promise.resolve(true);
  }

  // 卸载页面脚本
  unloadPageScript(script: Script) {
    return this.loadPageScript(<ScriptRunResouce>script);
  }

  // 加载并启动后台脚本
  loadBackgroundScript(script: ScriptRunResouce): Promise<boolean> {
    this.runBackScript.set(script.id, script);
    return new Promise((resolve, reject) => {
      // 清除重试数据
      script.nextruntime = 0;
      this.messageSandbox
        ?.syncSend("enable", script)
        .then(() => {
          resolve(true);
        })
        .catch((err) => {
          this.logger.error("backscript load error", Logger.E(err));
          reject(err);
        });
    });
  }

  // 卸载并停止后台脚本
  unloadBackgroundScript(script: Script): Promise<boolean> {
    this.runBackScript.delete(script.id);
    return new Promise((resolve, reject) => {
      this.messageSandbox
        ?.syncSend("disable", script.id)
        .then(() => {
          resolve(true);
        })
        .catch((err) => {
          this.logger.error("backscript stop error", Logger.E(err));
          reject(err);
        });
    });
  }

  async startBackgroundScript(script: Script) {
    const scriptRes = await this.buildScriptRunResource(script);
    this.messageSandbox?.syncSend("start", scriptRes);
    return Promise.resolve(true);
  }

  stopBackgroundScript(scriptId: number) {
    return new Promise((resolve, reject) => {
      this.messageSandbox
        ?.syncSend("stop", scriptId)
        .then((resp) => {
          resolve(resp);
        })
        .catch((err) => {
          this.logger.error("backscript stop error", Logger.E(err));
          reject(err);
        });
    });
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

    ret.value = await this.valueManager.getScriptValues(ret);

    ret.resource = await this.resourceManager.getScriptResources(ret);

    ret.flag = randomString(16);
    ret.sourceCode = ret.code;
    ret.code = compileScriptCode(ret);

    ret.grantMap = {};

    ret.metadata.grant?.forEach((val: string) => {
      ret.grantMap[val] = "ok";
    });

    return Promise.resolve(ret);
  }
}
