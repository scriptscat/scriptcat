import type { Message } from "@Packages/message/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest, ScriptLoadInfo } from "../service_worker/types";
import ExecScript from "./exec_script";
import type { GMInfoEnv, ScriptFunc, PreScriptFunc, ValueUpdateDataEncoded } from "./types";
import { addStyle, definePropertyListener } from "./utils";

export type ExecScriptEntry = {
  scriptLoadInfo: ScriptLoadInfo;
  scriptFlag: string;
  envInfo: any;
  scriptFunc: any;
};

// 脚本执行器
export class ScriptExecutor {
  earlyScriptFlag: Set<string> = new Set();
  execMap: Map<string, ExecScript> = new Map();

  envInfo: GMInfoEnv | undefined;

  constructor(private msg: Message) {}

  init(envInfo: GMInfoEnv) {
    this.envInfo = envInfo;
  }

  emitEvent(data: EmitEventRequest) {
    // 转发给脚本
    const exec = this.execMap.get(data.uuid);
    if (exec) {
      exec.emitEvent(data.event, data.eventId, data.data);
    }
  }

  valueUpdate(data: ValueUpdateDataEncoded) {
    const { uuid, storageName } = data;
    for (const val of this.execMap.values()) {
      if (val.scriptRes.uuid === uuid || getStorageName(val.scriptRes) === storageName) {
        val.valueUpdate(data);
      }
    }
  }

  start(scripts: ScriptLoadInfo[]) {
    const loadExec = (script: ScriptLoadInfo, scriptFunc: any) => {
      this.execScriptEntry({
        scriptLoadInfo: script,
        scriptFlag: script.flag,
        scriptFunc,
        envInfo: this.envInfo!,
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
            val.updateEarlyScriptGMInfo(this.envInfo!);
            break;
          }
        }
      }
      definePropertyListener(window, flag, (val: ScriptFunc) => {
        loadExec(script, val);
      });
    });
  }

  checkEarlyStartScript(env: "content" | "inject", eventFlag: string) {
    // 监听 脚本加载
    // 适用于此「通知环境加载完成」代码执行后的脚本加载
    window.addEventListener(`sc${eventFlag}`, (event) => {
      if (typeof event?.detail?.scriptFlag === "string") {
        event.preventDefault(); // dispatchEvent 会回传 false -> 分离环境也能得知环境加载代码已执行
        const scriptFlag = event.detail.scriptFlag;
        this.execEarlyScript(scriptFlag);
      }
    });
    // 通知 环境 加载完成
    // 适用于此「通知环境加载完成」代码执行前的脚本加载
    const ev = new CustomEvent(`${env === "content" ? "ct" : "fd"}ld${eventFlag}`);
    window.dispatchEvent(ev);
  }

  execEarlyScript(flag: string) {
    const scriptFunc = (window as any)[flag] as PreScriptFunc;
    this.execScriptEntry({
      scriptLoadInfo: scriptFunc.scriptInfo,
      scriptFunc: scriptFunc.func,
      scriptFlag: flag,
      envInfo: {},
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
          addStyle(res.content);
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
