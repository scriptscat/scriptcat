import type { Message } from "@Packages/message/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest } from "../service_worker/types";
import ExecScript from "./exec_script";
import type { GMInfoEnv, ScriptFunc, ValueUpdateSendData } from "./types";
import { addStyleSheet, definePropertyListener } from "./utils";
import type { ScriptLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import { DefinedFlags } from "../service_worker/runtime.consts";
import { isUrlExcluded } from "@App/pkg/utils/match";

export type ExecScriptEntry = {
  scriptLoadInfo: TScriptInfo;
  scriptFlag: string;
  envInfo: any;
  scriptFunc: any;
};

export let initEnvInfo: GMInfoEnv;

try {
  initEnvInfo = {
    userAgentData: UserAgentData, // 从全局变量获取
    sandboxMode: "raw", // 预留字段，当前固定为 raw
    isIncognito: false, // inject 环境下无法判断，固定为 false
  };
} catch {
  // 如果 UserAgentData 不存在，可能是在非inject/content环境下运行
  initEnvInfo = {
    userAgentData: {},
    sandboxMode: "raw",
    isIncognito: false,
  };
}

// 脚本执行器
export class ScriptExecutor {
  earlyScriptFlag: Set<string> = new Set();
  execMap: Map<string, ExecScript> = new Map();

  constructor(private msg: Message) {}

  emitEvent(data: EmitEventRequest) {
    // 转发给脚本
    const exec = this.execMap.get(data.uuid);
    if (exec) {
      exec.emitEvent(data.event, data.eventId, data.data);
    }
  }

  valueUpdate(sendData: ValueUpdateSendData) {
    const { data, storageName } = sendData;
    for (const [uuid, list] of Object.entries(data)) {
      for (const val of this.execMap.values()) {
        if (val.scriptRes.uuid === uuid || getStorageName(val.scriptRes) === storageName) {
          val.valueUpdate(storageName, uuid, list);
        }
      }
    }
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
        for (const val of this.execMap.values()) {
          if (val.scriptRes.flag === flag) {
            // 处理早期脚本的沙盒环境
            val.updateEarlyScriptGMInfo(envInfo);
            return;
          }
        }
      }
      definePropertyListener(window, flag, (val: ScriptFunc) => {
        loadExec(script, val);
      });
    });
  }

  checkEarlyStartScript(env: "content" | "inject", messageFlag: string, envInfo: GMInfoEnv) {
    const isContent = env === "content";
    const eventNamePrefix = `evt${messageFlag}${isContent ? DefinedFlags.contentFlag : DefinedFlags.injectFlag}`;
    const scriptLoadCompleteEvtName = `${eventNamePrefix}${DefinedFlags.scriptLoadComplete}`;
    const envLoadCompleteEvtName = `${eventNamePrefix}${DefinedFlags.envLoadComplete}`;
    // 监听 脚本加载
    // 适用于此「通知环境加载完成」代码执行后的脚本加载
    performance.addEventListener(scriptLoadCompleteEvtName, (ev) => {
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
          if (isUrlExcluded(window.location.href, detail.scriptInfo.scriptUrlPatterns)) {
            // 「多余的匹配」-> 略过注入
            return;
          }
        }
        this.execEarlyScript(scriptFlag, detail.scriptInfo, envInfo);
      }
    });
    // 通知 环境 加载完成
    // 适用于此「通知环境加载完成」代码执行前的脚本加载
    const ev = new CustomEvent(envLoadCompleteEvtName);
    performance.dispatchEvent(ev);
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
    const { scriptLoadInfo, scriptFunc, envInfo } = scriptEntry;

    const exec = new ExecScript(scriptLoadInfo, "content", this.msg, scriptFunc, envInfo);
    this.execMap.set(scriptLoadInfo.uuid, exec);
    const metadata = scriptLoadInfo.metadata || {};
    const resource = scriptLoadInfo.resource;
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
      this.waitBody(() => {
        exec.exec();
      });
    } else {
      try {
        exec.exec();
      } catch {
        // 屏蔽错误，防止脚本报错导致后续脚本无法执行
      }
    }
  }

  // 参考了tm的实现
  waitBody(callback: () => void) {
    if (document.body) {
      callback();
      return;
    }
    const listen = () => {
      document.removeEventListener("load", listen, false);
      document.removeEventListener("DOMNodeInserted", listen, false);
      document.removeEventListener("DOMContentLoaded", listen, false);
      this.waitBody(callback);
    };
    document.addEventListener("load", listen, false);
    document.addEventListener("DOMNodeInserted", listen, false);
    document.addEventListener("DOMContentLoaded", listen, false);
  }
}
