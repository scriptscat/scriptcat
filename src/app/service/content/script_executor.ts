import type { Message } from "@Packages/message/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest, ScriptLoadInfo } from "../service_worker/types";
import ExecScript from "./exec_script";
import type { GMInfoEnv, ScriptFunc, PreScriptFunc, ValueUpdateDataEncoded } from "./types";
import { addStyle } from "./utils";

export type ExecScriptEntry = {
  scriptLoadInfo: any;
  scriptFlag: string;
  envInfo: any;
  scriptFunc: any;
};

// 脚本执行器
export class ScriptExecutor {
  execList: ExecScript[] = [];

  envInfo: GMInfoEnv | undefined;
  earlyScriptFlag: string[] = [];

  constructor(private msg: Message) {}

  init(envInfo: GMInfoEnv) {
    this.envInfo = envInfo;
  }

  emitEvent(data: EmitEventRequest) {
    // 转发给脚本
    const exec = this.execList.find((val) => val.scriptRes.uuid === data.uuid);
    if (exec) {
      exec.emitEvent(data.event, data.eventId, data.data);
    }
  }

  valueUpdate(data: ValueUpdateDataEncoded) {
    const { uuid, storageName } = data;
    for (const val of this.execList) {
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
    scripts.forEach((script) => {
      const flag = script.flag;
      // 如果是EarlyScriptFlag，处理沙盒环境
      if (this.earlyScriptFlag.includes(flag)) {
        for (const val of this.execList) {
          if (val.scriptRes.flag === flag) {
            // 处理早期脚本的沙盒环境
            val.updateEarlyScriptGMInfo(this.envInfo!);
            break;
          }
        }
        return;
      }
      // @ts-ignore
      const scriptFunc = window[flag];
      if (scriptFunc) {
        // @ts-ignore
        window[flag] = null; // 释放物件参考
        loadExec(script, scriptFunc);
      } else {
        // 监听脚本加载,和屏蔽读取
        Object.defineProperty(window, flag, {
          configurable: true,
          set: (val: ScriptFunc) => {
            // @ts-ignore
            delete window[flag]; // 删除 property setter 避免重复呼叫
            loadExec(script, val);
          },
        });
      }
    });
  }

  checkEarlyStartScript(earlyStarFlag: string[]) {
    this.earlyScriptFlag = earlyStarFlag;
    const loadExec = (flag: string, scriptFunc: any) => {
      this.execScriptEntry({
        scriptLoadInfo: scriptFunc.scriptInfo,
        scriptFunc: scriptFunc.func,
        scriptFlag: flag,
        envInfo: {},
      });
    };
    this.earlyScriptFlag.forEach((flag) => {
      // @ts-ignore
      const scriptFunc = window[flag] as PreScriptFunc;
      if (scriptFunc) {
        // @ts-ignore
        window[flag] = null; // 释放物件参考
        loadExec(flag, scriptFunc);
      } else {
        // 监听脚本加载,和屏蔽读取
        Object.defineProperty(window, flag, {
          configurable: true,
          set: (val: PreScriptFunc) => {
            // @ts-ignore
            delete window[flag]; // 取消 property setter 避免重复呼叫
            loadExec(flag, val);
          },
        });
      }
    });
  }

  execScriptEntry(scriptEntry: ExecScriptEntry) {
    const { scriptFlag, scriptLoadInfo, scriptFunc, envInfo } = scriptEntry;

    // @ts-ignore
    delete window[scriptFlag];
    const exec = new ExecScript(scriptLoadInfo, "content", this.msg, scriptFunc, envInfo);
    this.execList.push(exec);
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
