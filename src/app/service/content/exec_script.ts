import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { createContext } from "./create_context";
import type { GMInfoEnv, ScriptFunc } from "./types";
import { compileScript, proxyContext } from "./utils";
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

  proxyContent: typeof globalThis;

  sandboxContent?: IGM_Base;

  GM_info: any;

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
    this.GM_info = evaluateGMInfo(envInfo, this.scriptRes);
    // 构建脚本资源
    if (typeof code === "string") {
      this.scriptFunc = compileScript(code);
    } else {
      this.scriptFunc = code;
    }
    const grantSet = new Set(scriptRes.metadata.grant || []);
    if (grantSet.has("none")) {
      // 不注入任何GM api
      this.proxyContent = global;
    } else {
      // 构建脚本GM上下文
      this.sandboxContent = createContext(scriptRes, this.GM_info, envPrefix, message, grantSet);
      if (globalInjection) {
        Object.assign(this.sandboxContent, globalInjection);
      }
      this.proxyContent = proxyContext(global, this.sandboxContent);
    }
  }

  emitEvent(event: string, eventId: string, data: any) {
    this.logger.debug("emit event", { event, eventId, data });
    this.sandboxContent?.emitEvent(event, eventId, data);
  }

  valueUpdate(data: ValueUpdateData) {
    this.sandboxContent?.valueUpdate(data);
  }

  /**
   * @see {@link compileScriptCode}
   * @returns
   */
  exec() {
    this.logger.debug("script start");
    const context = this.proxyContent;
    return this.scriptFunc.call(null, context, this.scriptRes.name);
  }

  stop() {
    this.logger.debug("script stop");
    return true;
  }
}
