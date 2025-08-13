import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { createContext, createProxyContext } from "./create_context";
import type { GMInfoEnv, ScriptFunc } from "./types";
import { compileScript } from "./utils";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { ValueUpdateData } from "./types";
import { evaluateGMInfo } from "./gm_info";
import { type IGM_Base } from "./gm_api";

// 执行脚本,控制脚本执行与停止
export default class ExecScript {
  scriptRes: ScriptLoadInfo;

  scriptFunc: ScriptFunc;

  logger: Logger;

  // proxyContext: typeof globalThis;

  sandboxContext?: IGM_Base & { [key: string]: any };

  named?: { [key: string]: any };

  constructor(
    scriptRes: ScriptLoadInfo,
    envPrefix: "content" | "offscreen",
    message: Message,
    code: string | ScriptFunc,
    envInfo: GMInfoEnv,
    globalInjection?: { [key: string]: any } // 主要是全域API. @grant none 时无效
  ) {
    this.scriptRes = scriptRes;
    this.logger = LoggerCore.getInstance().logger({
      component: "exec",
      uuid: this.scriptRes.uuid,
      name: this.scriptRes.name,
    });
    const GM_info = evaluateGMInfo(envInfo, this.scriptRes);
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
      // 不改变Context情况下，以 named 传多於一个全域变量
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

  valueUpdate(data: ValueUpdateData) {
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

  // 处理GM API
  preDocumentStart(_scriptRes: ScriptLoadInfo, _envInfo: GMInfoEnv) {
    console.log("触发apiLoadResolve", this.sandboxContext);
    // 给沙盒window附加GM API
    this.execContext!["GM_getValue"] = () => {
      return "233";
    };
    // 触发apiLoadResolve
    this.sandboxContext!["apiLoadResolve"]?.();
  }

  stop() {
    this.logger.debug("script stop");
    return true;
  }
}
