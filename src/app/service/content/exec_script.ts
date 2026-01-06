import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { createContext, createProxyContext } from "./create_context";
import type { GMInfoEnv, ScriptFunc } from "./types";
import { compileScript } from "./utils";
import type { Message } from "@Packages/message/types";
import type { ValueUpdateDataEncoded } from "./types";
import { evaluateGMInfo } from "./gm_api/gm_info";
import type { IGM_Base } from "./gm_api/gm_api";
import type { TScriptInfo } from "@App/app/repo/scripts";

// 执行脚本,控制脚本执行与停止
export default class ExecScript {
  scriptRes: TScriptInfo;

  scriptFunc: ScriptFunc;

  logger: Logger;

  // proxyContext: typeof globalThis;

  sandboxContext?: IGM_Base & { [key: string]: any };

  named?: { [key: string]: any };

  constructor(
    scriptRes: TScriptInfo,
    envPrefix: "scripting" | "offscreen",
    message: Message,
    code: string | ScriptFunc,
    envInfo: GMInfoEnv,
    globalInjection?: { [key: string]: any } // 主要是全域API. @grant none 时无效
  ) {
    this.scriptRes = scriptRes;
    this.logger = LoggerCore.getInstance().logger({
      component: "exec",
      uuid: scriptRes.uuid,
      name: scriptRes.name,
    });
    const GM_info = evaluateGMInfo(envInfo, scriptRes);
    // 构建脚本资源
    if (typeof code === "string") {
      this.scriptFunc = compileScript(code);
    } else {
      this.scriptFunc = code;
    }
    const grantSet = new Set(scriptRes.metadata.grant || []);
    if (grantSet.has("none")) {
      // 不注入任何GM api
      // ScriptCat行为：GM.info 和 GM_info 同时注入
      // 不改变Context情况下，以 named 传多于一个全域变量
      this.named = { GM: { info: GM_info }, GM_info };
    } else {
      // 构建脚本GM上下文
      this.sandboxContext = createContext(scriptRes, GM_info, envPrefix, message, grantSet);
      if (globalInjection) {
        Object.assign(this.sandboxContext, globalInjection);
      }
    }
  }

  emitEvent(event: string, eventId: string, data: any) {
    this.logger.debug("emit event", { event, eventId, data });
    this.sandboxContext?.emitEvent(event, eventId, data);
  }

  valueUpdate(data: ValueUpdateDataEncoded) {
    this.sandboxContext?.valueUpdate(data);
  }

  execContext: any;

  /**
   * @see {@link compileScriptCode}
   * @returns
   */
  exec() {
    this.logger.debug("script start");
    const sandboxContext = this.sandboxContext;
    this.execContext = sandboxContext ? createProxyContext(sandboxContext) : global; // this.$ 只能执行一次
    return this.scriptFunc.call(this.execContext, this.named, this.scriptRes.name);
  }

  // 早期启动的脚本，处理GM API
  updateEarlyScriptGMInfo(envInfo: GMInfoEnv) {
    let GM_info;
    if (this.sandboxContext) {
      // 触发loadScriptResolve
      this.sandboxContext["loadScriptResolve"]?.();
      GM_info = this.execContext["GM_info"];
    } else {
      GM_info = this.named?.GM_info;
    }
    GM_info.isIncognito = envInfo.isIncognito;
    GM_info.sandboxMode = envInfo.sandboxMode;
    GM_info.userAgentData = envInfo.userAgentData;
  }

  stop() {
    this.logger.debug("script stop");
    return true;
  }
}
