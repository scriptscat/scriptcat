import { Message, Server } from "@Packages/message/server";
import { ValueUpdateData } from "./exec_script.types";
import { ExecScript } from "./exec_script";
import { ScriptFunc } from "./types";
import { addStyle } from "./basics";
import { getStorageName } from "@App/pkg/utils/utils2";
import { EmitEventRequest, ScriptLoadInfo } from "../service_worker/runtime.types";
import { ExternalWhitelist } from "@App/app/const";
import { sendMessage } from "@Packages/message/client";

export class InjectRuntime {
  execList: ExecScript[] = [];

  constructor(
    private server: Server,
    private msg: Message,
    private scripts: ScriptLoadInfo[]
  ) {}

  start() {
    this.scripts.forEach((script) => {
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

  externalMessage() {
    // 对外接口白名单
    let msg = this.msg;
    for (let i = 0; i < ExternalWhitelist.length; i += 1) {
      if (window.location.host.endsWith(ExternalWhitelist[i])) {
        // 注入
        (<{ external: any }>(<unknown>window)).external = window.external || {};
        (<
          {
            external: {
              Scriptcat: {
                isInstalled: (name: string, namespace: string, callback: any) => void;
              };
            };
          }
        >(<unknown>window)).external.Scriptcat = {
          async isInstalled(name: string, namespace: string, callback: any) {
            const resp = await sendMessage(msg, "content/script/isInstalled", {
              name,
              namespace,
            });
            callback(resp);
          },
        };
        (<{ external: { Tampermonkey: any } }>(<unknown>window)).external.Tampermonkey = (<
          { external: { Scriptcat: any } }
        >(<unknown>window)).external.Scriptcat;
        break;
      }
    }
  }

  execScript(script: ScriptLoadInfo, scriptFunc: ScriptFunc) {
    // @ts-ignore
    delete window[script.flag];
    const exec = new ExecScript(script, "content", this.msg, scriptFunc);
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

export function generateRunTime(server: Server, msg: Message, scripts: ScriptLoadInfo[]){
  return new InjectRuntime(server, msg, scripts);
}
