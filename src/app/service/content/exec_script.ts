import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { createContext, createProxyContext, isInternalContextKey, type ScriptContext } from "./create_context";
import type { GMInfoEnv, ScriptFunc } from "./types";
import { compileScript, getEffectiveScriptGrants, isContextMenuScript } from "./utils";
import type { Message, MessageSend } from "@Packages/message/types";
import type { ValueUpdateDataEncoded } from "./types";
import { evaluateGMInfo } from "./gm_api/gm_info";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { installTrustedDataPropertiesStrict, Native, nativeCall, refreshExposedDataProperties } from "./global";

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
      message: MessageSend;
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
      this.scriptFunc = compileScript(code, true);
    } else {
      this.scriptFunc = code;
    }
    const grantSet = new Native.Set(getEffectiveScriptGrants(scriptRes.metadata));
    if (grantSet.has("none")) {
      // 不注入任何GM api
      // ScriptCat行为：GM.info 和 GM_info 同时注入
      // 在不改变 Context 的情况下，以 named 传入多个全域变量
      const GM = Native.objectCreate(null);
      GM.info = GM_info;
      this.named = { GM, GM_info };
    } else {
      // 构建脚本GM上下文
      const sandboxContext = (this.sandboxContext = createContext(
        scriptRes,
        GM_info,
        envPrefix,
        message,
        contentMsg,
        grantSet
      ));
      if (globalInjection) {
        // 可信扩展代码提供的 key 一般不会撞上内部生命周期键；一旦撞上说明调用方有 bug，
        // 应立即失败而不是静默跳过——因此只在真正冲突时才拒绝，其余按原行为直接写入。
        const keys = Native.objectKeys(globalInjection);
        for (let i = 0; i < keys.length; i += 1) {
          const key = keys[i];
          if (isInternalContextKey(key) && Native.objectHasOwn(sandboxContext, key)) {
            throw new TypeError(`globalInjection cannot overwrite internal context key: ${key}`);
          }
          sandboxContext[key] = globalInjection[key];
        }
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
    this.execContext = sandboxContext ? createProxyContext(sandboxContext) : global; // this.$ 只能执行一次
    return this.scriptFunc(fnStrIntegrity, this.execContext, this.named, this.scriptRes.name, nativeCall);
  };

  reconcileEarlyScript(envInfo: GMInfoEnv, scriptInfo?: TScriptInfo): boolean {
    const current = this.scriptRes;
    const grants = current.metadata.grant || [];
    const incomingGrants = scriptInfo?.metadata.grant || [];
    const needsBinding =
      isContextMenuScript(current.metadata) ||
      isContextMenuScript(scriptInfo?.metadata || {}) ||
      grants.some((grant) => grant !== "none") ||
      incomingGrants.some((grant) => grant !== "none");
    const hasBindingData =
      scriptInfo?.executionHandle !== undefined ||
      scriptInfo?.executionEnvTag !== undefined ||
      scriptInfo?.executionRunFlag !== undefined;
    const hasValidBinding =
      typeof scriptInfo?.executionHandle === "string" &&
      scriptInfo.executionHandle.length > 0 &&
      (scriptInfo.executionEnvTag === "it" || scriptInfo.executionEnvTag === "ct") &&
      typeof scriptInfo.executionRunFlag === "string" &&
      scriptInfo.executionRunFlag.length > 0;

    if (
      !scriptInfo ||
      scriptInfo.uuid !== current.uuid ||
      scriptInfo.flag !== current.flag ||
      typeof current.scriptRevision !== "string" ||
      scriptInfo.scriptRevision !== current.scriptRevision ||
      (hasBindingData && !hasValidBinding) ||
      (needsBinding && !hasValidBinding)
    ) {
      this.sandboxContext?.setInvalidContext();
      return false;
    }

    // current 是内部可信状态（this.scriptRes）：任何无法安全重定义的既有属性都说明契约被破坏，
    // 直接失败，绝不调用继承的 setter 或触发 "__proto__" 的原型变更语义。
    installTrustedDataPropertiesStrict(current, scriptInfo);
    const updatedGMInfo = evaluateGMInfo(envInfo, current);
    const gmInfo = this.sandboxContext ? this.execContext["GM_info"] : this.named?.GM_info;
    // gmInfo 是暴露给脚本的信息面：脚本可能已经在某个字段上安装了 non-configurable setter 来
    // "锁死"它，这是脚本对自己信息面的合法操作，不能因此阻断内部权威状态的刷新——遇到这种字段
    // 时跳过它，继续刷新其余字段，绝不调用该 setter。
    if (gmInfo) refreshExposedDataProperties(gmInfo, updatedGMInfo);

    if (this.sandboxContext) {
      if (hasValidBinding) this.sandboxContext.setExecutionRunFlag(scriptInfo.executionRunFlag!);
      this.sandboxContext.resolveLoadScript();
    }
    return true;
  }

  stop() {
    this.logger.debug("script stop");
    return true;
  }
}
