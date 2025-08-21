import { type Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import ExecScript from "./exec_script";
import type { ValueUpdateData, GMInfoEnv, ScriptFunc, PreScriptFunc } from "./types";
import { addStyle } from "./utils";
import { getStorageName } from "@App/pkg/utils/utils";
import type { EmitEventRequest, ScriptLoadInfo } from "../service_worker/types";
import { ExternalWhitelist } from "@App/app/const";
import { sendMessage } from "@Packages/message/client";

export class InjectRuntime {
  execList: ExecScript[] = [];

  envInfo: GMInfoEnv | undefined;

  constructor(
    private server: Server,
    private msg: Message
  ) {}

  init(envInfo: GMInfoEnv) {
    this.envInfo = envInfo;

    this.server.on("runtime/emitEvent", (data: EmitEventRequest) => {
      // 转发给脚本
      const exec = this.execList.find((val) => val.scriptRes.uuid === data.uuid);
      if (exec) {
        exec.emitEvent(data.event, data.eventId, data.data);
      }
    });
    this.server.on("runtime/valueUpdate", (data: ValueUpdateData) => {
      this.execList
        .filter((val) => val.scriptRes.uuid === data.uuid || getStorageName(val.scriptRes) === data.storageName)
        .forEach((val) => {
          val.valueUpdate(data);
        });
    });
    // 注入允许外部调用
    this.externalMessage();
  }

  start(scripts: ScriptLoadInfo[]) {
    scripts.forEach((script) => {
      // 如果是PreInjectScriptFlag，处理沙盒环境
      if (PreInjectScriptFlag.includes(script.flag)) {
        this.execList.forEach((val) => {
          if (val.scriptRes.flag === script.flag) {
            // 处理沙盒环境
            val.preDocumentStart(this.envInfo!);
          }
        });
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

  checkPreDocumentStart() {
    PreInjectScriptFlag.forEach((flag) => {
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

  externalMessage() {
    // 对外接口白名单
    const hostname = window.location.hostname;
    if (
      ExternalWhitelist.some(
        // 如果当前页面的 hostname 是白名单的网域或其子网域
        (t) => hostname.endsWith(t) && (hostname.length === t.length || hostname.endsWith(`.${t}`))
      )
    ) {
      const msg = this.msg;
      // 注入
      const external: External = window.external || (window.external = {} as External);
      const scriptExpose: App.ExternalScriptCat = {
        isInstalled(name: string, namespace: string, callback: (res: App.IsInstalledResponse | undefined) => unknown) {
          sendMessage<App.IsInstalledResponse>(msg, "content/script/isInstalled", {
            name,
            namespace,
          }).then(callback);
        },
      };
      try {
        external.Scriptcat = scriptExpose;
      } catch {
        // 无法注入到 external，忽略
      }
      try {
        external.Tampermonkey = scriptExpose;
      } catch {
        // 无法注入到 external，忽略
      }
    }
  }

  execScript(script: ScriptLoadInfo, scriptFunc: ScriptFunc) {
    // @ts-ignore
    delete window[script.flag];
    const exec = new ExecScript(script, "content", this.msg, scriptFunc, this.envInfo!);
    this.execList.push(exec);
    // 注入css
    if (script.metadata["require-css"]) {
      script.metadata["require-css"].forEach((val) => {
        const res = script.resource[val];
        if (res) {
          addStyle(res.content);
        }
      });
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
