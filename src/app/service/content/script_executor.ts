import type { Message } from "@Packages/message/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest } from "../service_worker/types";
import ExecScript from "./exec_script";
import type { GMInfoEnv, ScriptFunc, ValueSnapshot, ValueUpdateDataEncoded } from "./types";
import { addStyleSheet, definePropertyListener, waitBody } from "./utils";
import type { ScriptLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import { DefinedFlags } from "../service_worker/runtime.consts";
import { pageAddEventListener, pageDispatchEvent } from "@Packages/message/common";
import { isUrlExcluded } from "@App/pkg/utils/match";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { localizeObject } from "./global";
import { decodeRValue } from "@App/pkg/utils/message_value";

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
  /** userLanguage - 页面环境未到达前未知，由 updateEarlyScriptGMInfo 补上 */
  userLanguage: "",
} satisfies GMInfoEnv;

// 脚本执行器
export class ScriptExecutor {
  earlyScriptFlag: Set<string> = new Set();
  execScriptMap: Map<string, ExecScript> = new Map();
  // A pageLoad acknowledgement may precede the compiled userscript flag being set.
  // Retain only the initial descriptor and its latest value state, never an event log.
  private readonly pendingScripts = new Map<string, TScriptInfo>();

  constructor(
    private msg: Message,
    private contentMsg: Message // 用于 content <-> content/inject 通讯
  ) {}

  emitEvent(data: EmitEventRequest) {
    // 转发给脚本
    const exec = this.execScriptMap.get(data.uuid);
    if (exec) {
      exec.emitEvent(data.event, data.eventId, data.data);
    }
  }

  valueUpdate(data: ValueUpdateDataEncoded): void | Promise<void> {
    const { uuid, storageName } = data;
    let handled = false;
    let failed = false;
    let firstError: unknown;
    let recoveries: Promise<void>[] | undefined;
    for (const val of this.execScriptMap.values()) {
      if (val.scriptRes.uuid !== uuid && getStorageName(val.scriptRes) !== storageName) continue;
      handled = true;
      try {
        const recovery = val.valueUpdate(data);
        if (recovery instanceof Promise) (recoveries ??= []).push(recovery);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    for (const script of this.pendingScripts.values()) {
      if (script.uuid !== uuid && getStorageName(script) !== storageName) continue;
      handled = true;
      try {
        if (data.revision !== undefined && data.epoch !== undefined) {
          const oldRevision = script.valueRevision ?? 0;
          const oldEpoch = script.valueEpoch ?? "";
          if (data.epoch === oldEpoch && data.revision <= oldRevision) continue;
          if ((oldEpoch && data.epoch !== oldEpoch) || data.revision > oldRevision + 1) {
            throw new Error("Pending GM script requires a full value snapshot");
          }
          script.valueRevision = data.revision;
          script.valueEpoch = data.epoch;
        }
        if (!data.valueUpdated) continue;
        for (const [key, encoded] of data.entries) {
          const value = decodeRValue(encoded);
          if (value === undefined) delete script.value[key];
          else script.value[key] = value;
        }
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (!handled) throw new Error("No script world recipient for GM value update");
    if (failed) {
      // A single failing script must not block peers; the frame still needs a repair snapshot.
      for (const recovery of recoveries ?? []) void recovery.catch(() => undefined);
      throw firstError;
    }
    if (recoveries) return Promise.all(recoveries).then(() => undefined);
  }

  valueSnapshot(snapshot: ValueSnapshot) {
    let handled = false;
    let failed = false;
    let firstError: unknown;
    for (const exec of this.execScriptMap.values()) {
      if (getStorageName(exec.scriptRes) !== snapshot.storageName) continue;
      handled = true;
      try {
        exec.valueSnapshot(snapshot);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    for (const script of this.pendingScripts.values()) {
      if (getStorageName(script) !== snapshot.storageName) continue;
      handled = true;
      try {
        if (script.valueEpoch === snapshot.epoch && (script.valueRevision ?? 0) > snapshot.revision) continue;
        const values = { ...snapshot.values };
        for (const [tabName, tab] of Object.entries(script.config ?? {})) {
          if (!tab || typeof tab !== "object") continue;
          for (const [key, option] of Object.entries(tab)) {
            if (!option || typeof option !== "object" || !("default" in option)) continue;
            const field = `${tabName}.${key}`;
            if (values[field] === undefined) values[field] = option.default;
          }
        }
        script.value = values;
        script.valueRevision = snapshot.revision;
        script.valueEpoch = snapshot.epoch;
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (!handled) throw new Error("No script world recipient for GM value snapshot");
    if (failed) throw firstError;
  }

  startScripts(scripts: TScriptInfo[], envInfo: GMInfoEnv) {
    const loadExec = (script: TScriptInfo, scriptFunc: any) => {
      this.execScriptEntry({
        scriptLoadInfo: script,
        scriptFlag: script.flag,
        scriptFunc,
        envInfo: envInfo,
      });
    };
    // 监听脚本加载
    scripts.forEach((script) => {
      const flag = script.flag;
      // 如果是EarlyScriptFlag，处理沙盒环境
      if (this.earlyScriptFlag.has(flag)) {
        for (const val of this.execScriptMap.values()) {
          if (val.scriptRes.flag === flag) {
            // 处理早期脚本的沙盒环境
            val.updateEarlyScriptGMInfo(envInfo);
            // Early-start code already runs; refresh its GM cache without running it again.
            val.valueSnapshot({
              storageName: getStorageName(script),
              values: script.value,
              revision: script.valueRevision ?? 0,
              epoch: script.valueEpoch ?? "",
            });
            return;
          }
        }
      }
      this.pendingScripts.set(script.uuid, script);
      definePropertyListener(window, flag, (val: ScriptFunc) => {
        loadExec(script, val);
      });
    });
  }

  checkEarlyStartScript(scriptEnvTag: ScriptEnvTag, envInfo: GMInfoEnv) {
    const eventNamePrefix = `evt${process.env.SC_RANDOM_KEY}.${scriptEnvTag}`; // 仅用于early-start初始化
    const scriptLoadCompleteEvtName = `${eventNamePrefix}${DefinedFlags.scriptLoadComplete}`;
    const envLoadCompleteEvtName = `${eventNamePrefix}${DefinedFlags.envLoadComplete}`;
    // 监听 脚本加载
    // 适用于此「通知环境加载完成」代码执行后的脚本加载
    const scriptLoadCompleteHandler: EventListener = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        scriptFlag: string;
        scriptInfo: ScriptLoadInfo;
      };
      const scriptFlag = detail?.scriptFlag;
      if (typeof scriptFlag === "string") {
        ev.preventDefault(); // dispatchEvent 会回传 false -> 分离环境也能得知环境加载代码已执行
        // 检查是否有 urlPattern，有则执行匹配再决定是否略过注入
        if (detail.scriptInfo.scriptUrlPatterns) {
          // 以 REGEX 情况为例
          //   "@include /REGEX/" 的情况下，MV3 UserScripts API 基础匹配范围扩大，会比实际需要的广阔，然后在 earlyScript 把不符合 REGEX 的除去
          //   (All @include = false -> 除去)
          //   注：如果 @include 混合了 regex 跟 一般的，即使 regex 的 @include 不匹对当前网址，但匹对了一般 @include 也视为有效
          //       相反如果 @include 混合了 regex 跟 一般的，regex 的 @include 匹对了即可
          //   "@exclude /REGEX/" 的情况下，MV3 UserScripts API 基础匹配范围不会扩大，然后在 earlyScript 把符合 REGEX 的匹配除去
          //   (Any @exclude = true -> 除去)
          // 注：如果一早已被除排，根本不会被 MV3 UserScripts API 注入。所以只考虑排除「多余的匹配」。（略过注入）
          try {
            if (isUrlExcluded(window.location.href, detail.scriptInfo.scriptUrlPatterns)) {
              // 「多余的匹配」-> 略过注入
              return;
            }
          } catch (e) {
            console.warn("Unexpected match error", e);
          }
        }
        this.execEarlyScript(scriptFlag, detail.scriptInfo, envInfo);
      }
    };
    pageAddEventListener(scriptLoadCompleteEvtName, scriptLoadCompleteHandler);
    // 通知 环境 加载完成
    // 适用于此「通知环境加载完成」代码执行前的脚本加载
    const ev = new CustomEvent(envLoadCompleteEvtName);
    pageDispatchEvent(ev);
  }

  execEarlyScript(flag: string, scriptInfo: TScriptInfo, envInfo: GMInfoEnv) {
    const scriptFunc = (window as any)[flag] as ScriptFunc;
    this.execScriptEntry({
      scriptLoadInfo: scriptInfo,
      scriptFunc: scriptFunc,
      scriptFlag: flag,
      envInfo: envInfo,
    });
    this.earlyScriptFlag.add(flag);
  }

  execScriptEntry(scriptEntry: ExecScriptEntry) {
    const { scriptFunc } = scriptEntry;
    const envInfo = localizeObject(scriptEntry.envInfo);
    const scriptLoadInfo = localizeObject(scriptEntry.scriptLoadInfo);

    const execScript = new ExecScript(scriptLoadInfo, {
      envPrefix: "scripting",
      message: this.msg,
      contentMsg: this.contentMsg,
      code: scriptFunc,
      envInfo,
    });
    this.execScriptMap.set(scriptLoadInfo.uuid, execScript);
    this.pendingScripts.delete(scriptLoadInfo.uuid);
    const metadata = scriptLoadInfo.metadata || {};
    const resource = scriptLoadInfo.requireCssResource ?? scriptLoadInfo.resource;
    // 注入css
    if (metadata["require-css"] && resource) {
      for (const val of metadata["require-css"]) {
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
