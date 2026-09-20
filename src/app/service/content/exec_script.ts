import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { createContext, createProxyContext, type ScriptContext } from "./create_context";
import type { GMInfoEnv, ScriptFunc } from "./types";
import { compileScript, isContextMenuScript } from "./utils";
import type { Message } from "@Packages/message/types";
import type { ValueUpdateDataEncoded } from "./types";
import { evaluateGMInfo } from "./gm_api/gm_info";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { Native } from "./global";
import { getScriptRevision } from "@App/app/repo/scripts";

// 编译函数只在收到本次构建的密钥时执行，避免页面直接复用包装器。
const fnStrIntegrity = process.env.SC_RANDOM_FNKEY!;

// 执行脚本,控制脚本执行与停止
export default class ExecScript {
  scriptRes: TScriptInfo;

  scriptFunc: ScriptFunc;

  logger: Logger;

  // proxyContext: typeof globalThis;

  sandboxContext?: ScriptContext;

  named?: { [key: string]: any };

  constructor(
    scriptRes: TScriptInfo,
    options: {
      envPrefix: string;
      message: Message;
      contentMsg: Message;
      code: string | ScriptFunc;
      envInfo: GMInfoEnv;
      globalInjection?: { [key: string]: any }; // 主要是全域API. @grant none 时无效
    }
  ) {
    const { envPrefix, message, contentMsg, code, envInfo, globalInjection } = options;
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
    const grantSet = new Native.Set(scriptRes.metadata.grant || []);
    if (isContextMenuScript(scriptRes.metadata)) {
      grantSet.add("GM_registerMenuCommand");
      grantSet.delete("none");
    }
    if (grantSet.has("none")) {
      // 不注入任何GM api
      // ScriptCat行为：GM.info 和 GM_info 同时注入
      // 在不改变 Context 的情况下，以 named 传入多个全域变量
      const GM = Native.objectCreate(null);
      GM.info = GM_info;
      this.named = { GM, GM_info };
    } else {
      // 构建脚本GM上下文
      this.sandboxContext = createContext(scriptRes, GM_info, envPrefix, message, contentMsg, grantSet);
      if (globalInjection) {
        Native.objectAssign(this.sandboxContext, globalInjection);
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
  public readonly exec = () => {
    this.logger.debug("script start");
    const sandboxContext = this.sandboxContext;
    if (this.scriptRes.executionHandle) sandboxContext?.resolveLoadScript();
    this.execContext = sandboxContext ? createProxyContext(sandboxContext) : global; // this.$ 只能执行一次
    return this.scriptFunc(fnStrIntegrity, this.execContext, this.named, this.scriptRes.name);
  };

  updateScriptInfo(envInfo: GMInfoEnv, scriptInfo: TScriptInfo): boolean {
    if (
      scriptInfo.uuid !== this.scriptRes.uuid ||
      scriptInfo.flag !== this.scriptRes.flag ||
      (scriptInfo.scriptRevision ?? getScriptRevision(scriptInfo)) !==
        (this.scriptRes.scriptRevision ?? getScriptRevision(this.scriptRes))
    ) {
      this.invalidateEarlyScript();
      return false;
    }
    const grants = scriptInfo.metadata.grant || [];
    if (grants.some((grant) => grant !== "none") && !scriptInfo.executionHandle) {
      this.invalidateEarlyScript();
      return false;
    }

    this.scriptRes.value = scriptInfo.value;
    this.scriptRes.config = scriptInfo.config;
    this.scriptRes.userConfig = scriptInfo.userConfig;
    this.scriptRes.userConfigStr = scriptInfo.userConfigStr;
    this.scriptRes.metadata = scriptInfo.metadata;
    this.scriptRes.resource = scriptInfo.resource;
    this.scriptRes.requireCssResource = scriptInfo.requireCssResource;
    this.scriptRes.executionHandle = scriptInfo.executionHandle;
    this.scriptRes.executionEnvTag = scriptInfo.executionEnvTag;
    this.scriptRes.executionRunFlag = scriptInfo.executionRunFlag;
    if (this.sandboxContext && scriptInfo.executionRunFlag) {
      this.sandboxContext.setExecutionRunFlag(scriptInfo.executionRunFlag);
    }
    const GMInfo = this.sandboxContext?.GM_info ?? this.named?.GM_info;
    GMInfo.userConfig = scriptInfo.userConfig;
    GMInfo.userConfigStr = scriptInfo.userConfigStr;
    GMInfo.isIncognito = envInfo.isIncognito;
    GMInfo.sandboxMode = envInfo.sandboxMode;
    GMInfo.userAgentData = envInfo.userAgentData;
    this.sandboxContext?.resolveLoadScript();
    return true;
  }

  invalidateEarlyScript() {
    this.sandboxContext?.setInvalidContext();
  }

  stop() {
    this.logger.debug("script stop");
    return true;
  }
}
