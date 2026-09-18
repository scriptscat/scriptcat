import type { Message } from "@Packages/message/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest } from "../service_worker/types";
import ExecScript from "./exec_script";
import type { GMInfoEnv, ScriptFunc, ValueUpdateDataEncoded } from "./types";
import { addStyleSheet, definePropertyListener, waitBody } from "./utils";
import type { ScriptLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import { DefinedFlags } from "../service_worker/runtime.consts";
import { pageAddEventListener, pageDispatchEvent } from "@Packages/message/common";
import { isUrlExcluded } from "@App/pkg/utils/match";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { localizeObject, Native } from "./global";

// 与编译器相同的构建级标记，用来拒绝页面伪造的脚本挂载函数。
const fnStrIntegrity = process.env.SC_RANDOM_FNKEY!;

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
  private readonly execScripts = new Native.Map<string, ExecScript>();

  constructor(
    private msg: Message,
    private contentMsg: Message, // 用于 content <-> content/inject 通讯
    private readonly envPrefix = "scripting"
  ) {}

  emitEvent(data: EmitEventRequest) {
    // 转发给脚本
    this.execScripts.get(data.uuid)?.emitEvent(data.event, data.eventId, data.data);
  }

  valueUpdate(data: ValueUpdateDataEncoded) {
    // runtime/valueUpdate
    const { uuid, storageName } = data;
    this.execScripts.forEach((exec) => {
      if (exec.scriptRes.uuid === uuid || getStorageName(exec.scriptRes) === storageName) {
        exec.valueUpdate(data);
      }
    });
  }

  startScripts(scripts: TScriptInfo[], envInfo: GMInfoEnv) {
    const pageWindow = window as unknown as Record<string, unknown>;
    const loadExec = (script: TScriptInfo, scriptFunc: any) => {
      this.execScriptEntry({
        scriptLoadInfo: script,
        scriptFlag: script.flag,
        scriptFunc,
        envInfo: envInfo,
      });
    };
    // 监听脚本加载
    for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex += 1) {
      const script = scripts[scriptIndex];
      const flag = script.flag;
      // 如果是EarlyScriptFlag，处理沙盒环境
      if (this.earlyScriptFlags.has(flag)) {
        let updated = false;
        this.execScripts.forEach((exec) => {
          if (!updated && exec.scriptRes.flag === flag) {
            // 处理早期脚本的沙盒环境
            exec.updateEarlyScriptGMInfo(envInfo, script);
            updated = true;
          }
        });
        if (updated) return;
      }
      const listenForScript = () => {
        definePropertyListener(window, flag, (val: ScriptFunc) => {
          // 只有扩展生成且不可改写的完整性标记才算有效挂载，页面自建同名函数必须忽略。
          const descriptor =
            typeof val === "function" ? Native.objectGetOwnPropertyDescriptor(val, fnStrIntegrity) : undefined;
          if (descriptor?.value !== true || descriptor.configurable || descriptor.writable) {
            const mountDescriptor = Native.objectGetOwnPropertyDescriptor(pageWindow, flag);
            if (mountDescriptor?.configurable) {
              delete pageWindow[flag];
              listenForScript();
            }
            return;
          }
          loadExec(script, val);
        });
      };
      listenForScript();
    }
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
      const scriptInfo = detail?.scriptInfo;
      if (
        typeof scriptFlag === "string" &&
        scriptInfo &&
        typeof scriptInfo === "object" &&
        scriptInfo.flag === scriptFlag
      ) {
        ev.preventDefault(); // dispatchEvent 会回传 false -> 分离环境也能得知环境加载代码已执行
        // 检查是否有 urlPattern，有则执行匹配再决定是否略过注入
        if (scriptInfo.scriptUrlPatterns) {
          // 以 REGEX 情况为例
          //   "@include /REGEX/" 的情况下，MV3 UserScripts API 基础匹配范围扩大，会比实际需要的广阔，然后在 earlyScript 把不符合 REGEX 的除去
          //   (All @include = false -> 除去)
          //   注：如果 @include 混合了 regex 跟 一般的，即使 regex 的 @include 不匹对当前网址，但匹对了一般 @include 也视为有效
          //       相反如果 @include 混合了 regex 跟 一般的，regex 的 @include 匹对了即可
          //   "@exclude /REGEX/" 的情况下，MV3 UserScripts API 基础匹配范围不会扩大，然后在 earlyScript 把符合 REGEX 的匹配除去
          //   (Any @exclude = true -> 除去)
          // 注：如果一早已被除排，根本不会被 MV3 UserScripts API 注入。所以只考虑排除「多余的匹配」。（略过注入）
          try {
            if (isUrlExcluded(window.location.href, scriptInfo.scriptUrlPatterns)) {
              // 「多余的匹配」-> 略过注入
              return;
            }
          } catch (e) {
            console.warn("Unexpected match error", e);
          }
        }
        if (!this.earlyScriptFlags.has(scriptFlag)) this.execEarlyScript(scriptFlag, scriptInfo, envInfo);
      }
    };
    pageAddEventListener(scriptLoadCompleteEvtName, scriptLoadCompleteHandler);
    // 通知 环境 加载完成
    // 适用于此「通知环境加载完成」代码执行前的脚本加载
    const ev = new CustomEvent(envLoadCompleteEvtName);
    pageDispatchEvent(ev);
  }

  execEarlyScript(flag: string, scriptInfo: TScriptInfo, envInfo: GMInfoEnv) {
    const expectedUuid = flag.startsWith("#-") ? flag.slice(2) : undefined;
    // early-start 事件来自页面，需同时确认脚本身份和未绑定状态，避免旧事件重放到新文档。
    if (
      (expectedUuid && scriptInfo.uuid !== expectedUuid) ||
      scriptInfo.executionHandle !== undefined ||
      scriptInfo.executionEnvTag !== undefined ||
      scriptInfo.executionRunFlag !== undefined
    ) {
      return;
    }
    const scriptFunc = (window as unknown as Record<string, unknown>)[flag] as ScriptFunc;
    const descriptor =
      typeof scriptFunc === "function" ? Native.objectGetOwnPropertyDescriptor(scriptFunc, fnStrIntegrity) : undefined;
    if (descriptor?.value !== true || descriptor.configurable || descriptor.writable) return;
    this.execScriptEntry({
      scriptLoadInfo: scriptInfo,
      scriptFunc: scriptFunc,
      scriptFlag: flag,
      envInfo: envInfo,
    });
    this.earlyScriptFlags.add(flag);
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
