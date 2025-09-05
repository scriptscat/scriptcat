import type { Message } from "@Packages/message/types";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest, ScriptLoadInfo } from "../service_worker/types";
import ExecScript from "./exec_script";
import type { GMInfoEnv, ValueUpdateData, ScriptFunc, PreScriptFunc } from "./types";
import { addStyle } from "./utils";

// 脚本执行器
export class ScriptExecutor {
  execList: ExecScript[] = [];

  envInfo: GMInfoEnv | undefined;

  constructor(
    private msg: Message,
    private earlyScriptFlag: string[]
  ) {}

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

  valueUpdate(data: ValueUpdateData) {
    this.execList
      .filter((val) => val.scriptRes.uuid === data.uuid || getStorageName(val.scriptRes) === data.storageName)
      .forEach((val) => {
        val.valueUpdate(data);
      });
  }

  start(scripts: ScriptLoadInfo[]) {
    scripts.forEach((script) => {
      // 如果是EarlyScriptFlag，处理沙盒环境
      if (this.earlyScriptFlag.includes(script.flag)) {
        for (const val of this.execList) {
          if (val.scriptRes.flag === script.flag) {
            // 处理早期脚本的沙盒环境
            val.dealEarlyScript(this.envInfo!);
            break;
          }
        }
        return;
      }
      // @ts-ignore
      const scriptFunc = window[script.flag];
      if (scriptFunc) {
        this.execScript(script, scriptFunc);
      } else {
        // 监听脚本加载,和屏蔽读取
        Object.defineProperty(window, script.flag, {
          configurable: true,
          set: (val: ScriptFunc) => {
            this.execScript(script, val);
          },
        });
      }
    });
  }

  checkEarlyStartScript() {
    this.earlyScriptFlag.forEach((flag) => {
      // @ts-ignore
      const scriptFunc = window[flag] as PreScriptFunc;
      if (scriptFunc) {
        // @ts-ignore
        const exec = new ExecScript(scriptFunc.scriptInfo, "content", this.msg, scriptFunc.func, {});
        this.execList.push(exec);
        exec.exec();
      } else {
        // 监听脚本加载,和屏蔽读取
        Object.defineProperty(window, flag, {
          configurable: true,
          set: (val: PreScriptFunc) => {
            // @ts-ignore
            const exec = new ExecScript(val.scriptInfo, "content", this.msg, val.func, {});
            this.execList.push(exec);
            exec.exec();
          },
        });
      }
    });
  }

  execScript(script: ScriptLoadInfo, scriptFunc: ScriptFunc) {
    // @ts-ignore
    delete window[script.flag];
    const exec = new ExecScript(script, "content", this.msg, scriptFunc, this.envInfo!);
    this.execList.push(exec);
    // 注入css
    if (script.metadata["require-css"]) {
      for (const val of script.metadata["require-css"]) {
        const res = script.resource[val];
        if (res) {
          addStyle(res.content);
        }
      }
    }
    if (script.metadata["run-at"] && script.metadata["run-at"][0] === "document-body") {
      // 等待页面加载完成
      this.waitBody(() => {
        exec.exec();
      });
    } else {
      exec.exec();
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
