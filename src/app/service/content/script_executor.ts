import type { Message } from "@Packages/message/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest } from "../service_worker/types";
import ExecScript from "./exec_script";
import type { GMInfoEnv, ScriptFunc, ValueUpdateDataEncoded } from "./types";
import {
  addStyleSheet,
  definePropertyListener,
  getCompiledScriptMetadata,
  isEarlyStartScript,
  waitBody,
} from "./utils";
import { isUrlExcluded } from "@App/pkg/utils/match";
import { getScriptRevision, type TScriptInfo } from "@App/app/repo/scripts";
import { DefinedFlags } from "../service_worker/runtime.consts";
import { pageAddEventListener, pageDispatchEvent } from "@Packages/message/common";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { localizeObject, Native } from "./global";

export type ExecScriptEntry = {
  scriptLoadInfo: TScriptInfo;
  scriptFlag: string;
  envInfo: GMInfoEnv;
  scriptFunc: any;
};

export const initEnvInfo: GMInfoEnv = {
  /** userAgentData - 从全局变量获取 */
  userAgentData: typeof UserAgentData === "object" ? UserAgentData : {},
  /** sandboxMode - 预留字段，当前固定为 raw */
  sandboxMode: "raw",
  /** isIncognito - inject/content 环境下透過 scripting 环境判断 */
  /** 使用者可透过 「 await navigator.storage.persisted() 」来判断，但ScriptCat不会主动执行此代码来判断 */
  isIncognito: false,
} satisfies GMInfoEnv;

// 脚本执行器
export class ScriptExecutor {
  private readonly earlyScriptFlags = new Native.Set<string>();
  private readonly rejectedEarlyScriptFlags = new Native.Set<string>();
  private readonly execScripts = new Native.Map<string, ExecScript>();

  constructor(
    private msg: Message,
    private contentMsg: Message, // 用于 content <-> content/inject 通讯
    private readonly envPrefix = "scripting"
  ) {}

  emitEvent(data: EmitEventRequest) {
    // 转发给脚本
    const exec = this.execScripts.get(data.uuid);
    if (exec && (!this.earlyScriptFlags.has(exec.scriptRes.flag) || exec.scriptRes.executionHandle)) {
      exec.emitEvent(data.event, data.eventId, data.data);
    }
  }

  valueUpdate(data: ValueUpdateDataEncoded) {
    // runtime/valueUpdate
    const { uuid, storageName } = data;
    this.execScripts.forEach((exec) => {
      if (this.earlyScriptFlags.has(exec.scriptRes.flag) && !exec.scriptRes.executionHandle) return;
      if (exec.scriptRes.uuid === uuid || getStorageName(exec.scriptRes) === storageName) {
        exec.valueUpdate(data);
      }
    });
  }

  startScripts(scripts: TScriptInfo[], envInfo: GMInfoEnv, options: { reconcileEarlyScripts?: boolean } = {}) {
    const pageWindow = window as unknown as Record<string, unknown>;
    if (options.reconcileEarlyScripts !== false) {
      this.execScripts.forEach((exec) => {
        const flag = exec.scriptRes.flag;
        if (!this.earlyScriptFlags.has(flag)) return;
        const currentScript = scripts.find((script) => script.uuid === exec.scriptRes.uuid && script.flag === flag);
        if (currentScript && exec.updateScriptInfo(envInfo, currentScript)) return;
        exec.invalidateEarlyScript();
        this.rejectedEarlyScriptFlags.add(flag);
        this.execScripts.delete(exec.scriptRes.uuid);
        this.earlyScriptFlags.delete(flag);
      });
    }
    const loadExec = (script: TScriptInfo, scriptFunc: any) => {
      if (isEarlyStartScript(script.metadata || {})) {
        this.earlyScriptFlags.add(script.flag);
      }
      this.execScriptEntry({
        scriptLoadInfo: script,
        scriptFlag: script.flag,
        scriptFunc,
        envInfo: envInfo,
      });
    };
    // Reconcile pre-injected wrappers with page-load's current revision before attaching APIs.
    // 监听脚本加载
    for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex += 1) {
      const script = scripts[scriptIndex];
      const flag = script.flag;
      if (this.earlyScriptFlags.has(flag)) continue;
      const existingExec = this.execScripts.get(script.uuid);
      if (existingExec) {
        if (existingExec.updateScriptInfo(envInfo, script)) continue;
        this.execScripts.delete(script.uuid);
      }
      const listenForScript = () => {
        definePropertyListener(window, flag, (val: ScriptFunc) => {
          const rejectMount = () => {
            const mountDescriptor = Native.objectGetOwnPropertyDescriptor(pageWindow, flag);
            if (mountDescriptor?.configurable) {
              delete pageWindow[flag];
              listenForScript();
            }
          };
          const metadataJSON = getCompiledScriptMetadata(val);
          if (metadataJSON === undefined) {
            rejectMount();
            return;
          }
          let metadata: { uuid?: unknown; flag?: unknown; scriptRevision?: unknown };
          try {
            metadata = Native.jsonParse(metadataJSON) as {
              uuid?: unknown;
              flag?: unknown;
              scriptRevision?: unknown;
            };
          } catch {
            rejectMount();
            return;
          }
          if (
            !metadata ||
            metadata.uuid !== script.uuid ||
            metadata.flag !== flag ||
            metadata.scriptRevision !== (script.scriptRevision ?? getScriptRevision(script))
          ) {
            rejectMount();
            return;
          }
          loadExec(script, val);
        });
      };
      listenForScript();
    }
  }

  checkEarlyStartScript(scriptEnvTag: ScriptEnvTag, envInfo: GMInfoEnv) {
    const eventNamePrefix = `evt${process.env.SC_RANDOM_KEY}.${scriptEnvTag}`;
    const scriptLoadCompleteEvtName = `${eventNamePrefix}${DefinedFlags.scriptLoadComplete}`;
    const envLoadCompleteEvtName = `${eventNamePrefix}${DefinedFlags.envLoadComplete}`;
    const scriptLoadCompleteHandler: EventListener = (ev: Event) => {
      let scriptFlag: unknown;
      try {
        const detail = (ev as CustomEvent).detail;
        if (!detail || typeof detail !== "object") return;
        const flagDescriptor = Native.objectGetOwnPropertyDescriptor(detail, "scriptFlag");
        if (!flagDescriptor || !("value" in flagDescriptor)) return;
        scriptFlag = flagDescriptor.value;
      } catch {
        return;
      }
      if (
        typeof scriptFlag === "string" &&
        !this.earlyScriptFlags.has(scriptFlag) &&
        !this.rejectedEarlyScriptFlags.has(scriptFlag)
      ) {
        if (this.execEarlyScript(scriptFlag, envInfo)) ev.preventDefault();
      }
    };
    pageAddEventListener(scriptLoadCompleteEvtName, scriptLoadCompleteHandler);
    pageDispatchEvent(new CustomEvent(envLoadCompleteEvtName));
  }

  execEarlyScript(flag: string, envInfo: GMInfoEnv) {
    if (this.rejectedEarlyScriptFlags.has(flag)) return;
    const mountDescriptor = Native.objectGetOwnPropertyDescriptor(window, flag);
    const scriptFunc = mountDescriptor && "value" in mountDescriptor ? mountDescriptor.value : undefined;
    const scriptInfoJSON = getCompiledScriptMetadata(scriptFunc);
    if (scriptInfoJSON === undefined) return;
    let scriptInfo: TScriptInfo;
    try {
      scriptInfo = Native.jsonParse(scriptInfoJSON) as TScriptInfo;
    } catch {
      return;
    }
    if (
      !scriptInfo ||
      scriptInfo.flag !== flag ||
      typeof scriptInfo.uuid !== "string" ||
      scriptInfo.uuid.length === 0 ||
      typeof scriptInfo.scriptRevision !== "string" ||
      scriptInfo.scriptRevision.length === 0 ||
      (flag.startsWith("#-") && scriptInfo.uuid !== flag.slice(2)) ||
      scriptInfo.executionHandle !== undefined ||
      scriptInfo.executionEnvTag !== undefined ||
      scriptInfo.executionRunFlag !== undefined
    ) {
      return;
    }
    if (scriptInfo.scriptUrlPatterns) {
      try {
        if (isUrlExcluded(window.location.href, scriptInfo.scriptUrlPatterns)) return;
      } catch (error) {
        console.warn("Unexpected match error", error);
      }
    }
    // The current revision arrives with pageLoad, so a stale early body can affect the page before reconciliation.
    this.execScriptEntry({
      scriptLoadInfo: scriptInfo,
      scriptFunc: scriptFunc as ScriptFunc,
      scriptFlag: flag,
      envInfo,
    });
    this.earlyScriptFlags.add(flag);
    return true;
  }

  execScriptEntry(scriptEntry: ExecScriptEntry) {
    const { scriptFunc } = scriptEntry;
    const envInfo = localizeObject(scriptEntry.envInfo);
    const scriptLoadInfo = localizeObject(scriptEntry.scriptLoadInfo);

    const execScript = new ExecScript(scriptLoadInfo, {
      envPrefix: this.envPrefix,
      message: this.msg,
      contentMsg: this.contentMsg,
      code: scriptFunc,
      envInfo,
    });
    this.execScripts.set(scriptLoadInfo.uuid, execScript);
    const metadata = scriptLoadInfo.metadata || {};
    const resource = scriptLoadInfo.requireCssResource ?? scriptLoadInfo.resource;
    // 注入css
    if (metadata["require-css"] && resource) {
      const requireCss = metadata["require-css"];
      for (let i = 0; i < requireCss.length; i += 1) {
        const val = requireCss[i];
        const res = resource[val];
        if (res) {
          addStyleSheet(res.content);
        }
      }
    }
    if (metadata["run-at"] && metadata["run-at"][0] === "document-body") {
      // 等待页面加载完成
      waitBody(execScript.exec);
    } else {
      try {
        execScript.exec();
      } catch {
        // 屏蔽错误，防止脚本报错导致后续脚本无法执行
      }
    }
  }
}
