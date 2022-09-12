// 脚本运行时,主要负责脚本的加载和匹配
// 油猴脚本将监听页面的创建,将代码注入到页面中
import MessageSandbox from "@App/app/message/sandbox";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import {
  Script,
  SCRIPT_STATUS_ENABLE,
  ScriptRunResouce,
} from "@App/app/repo/scripts";
import Hook, { HookID } from "@App/app/service/hook";
import ResourceManager from "@App/app/service/resource/manager";
import ValueManager from "@App/app/service/value/manager";
import { randomString } from "@App/utils/utils";
import { compileScriptCode } from "../content/utils";

// 后台脚本将会将代码注入到沙盒中
export default class Runtime {
  connectSandbox: MessageSandbox;

  resourceManager: ResourceManager;

  valueManager: ValueManager;

  logger: Logger;

  constructor(
    connectSandbox: MessageSandbox,
    resourceManager: ResourceManager,
    valueManager: ValueManager
  ) {
    Hook.getInstance().addHook("script:upsert", this.scriptUpdate);
    Hook.getInstance().addHook("script:enable", this.enable);
    Hook.getInstance().addHook("script:disable", this.disable);
    this.connectSandbox = connectSandbox;
    this.resourceManager = resourceManager;
    this.valueManager = valueManager;
    this.logger = LoggerCore.getInstance().logger({ component: "runtime" });
  }

  // 脚本发生变动
  scriptUpdate(id: HookID, script: Script): Promise<boolean> {
    if (script.status === SCRIPT_STATUS_ENABLE) {
      return this.enable(id, script as ScriptRunResouce);
    }
    return this.disable(id, script);
  }

  // 脚本开启
  async enable(id: HookID, script: Script): Promise<boolean> {
    // 编译脚本运行资源
    const scriptRes = await this.buildScriptRunResource(script);
    if (scriptRes.metadata.background || scriptRes.metadata.crontab) {
      return this.loadBackgroundScript(scriptRes);
    }
    return this.loadPageScript(scriptRes);
  }

  // 脚本关闭
  disable(id: HookID, script: Script): Promise<boolean> {
    if (script.metadata.background || script.metadata.crontab) {
      return this.unloadBackgroundScript(script);
    }
    return this.unloadPageScript(script);
  }

  // 加载页面脚本
  loadPageScript(script: ScriptRunResouce) {
    return Promise.resolve(false);
  }

  // 卸载页面脚本
  unloadPageScript(script: Script) {
    return Promise.resolve(false);
  }

  // 加载后台脚本
  loadBackgroundScript(script: ScriptRunResouce): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.connectSandbox
        .syncSend("enable", script)
        .then((resp) => {
          resolve(resp);
        })
        .catch((err) => {
          this.logger.error("后台脚本加载失败", Logger.E(err));
          reject(err);
        });
    });
  }

  // 卸载后台脚本
  unloadBackgroundScript(script: Script): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.connectSandbox
        .syncSend("disable", script.id)
        .then((resp) => {
          resolve(resp);
        })
        .catch((err) => {
          this.logger.error("后台脚本停止失败", Logger.E(err));
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
    ret.code = compileScriptCode(ret);

    ret.grantMap = {};

    ret.metadata.grant?.forEach((val: string) => {
      ret.grantMap[val] = "ok";
    });

    return Promise.resolve(ret);
  }
}
