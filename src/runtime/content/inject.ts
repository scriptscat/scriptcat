import { ExternalMessage, ExternalWhitelist } from "@App/app/const";
import MessageContent from "@App/app/message/content";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import ExecScript, { ValueUpdateData } from "./exec_script";
import { addStyle, ScriptFunc } from "./utils";

// 注入脚本的沙盒环境
export default class InjectRuntime {
  scripts: ScriptRunResouce[];

  flag: string;

  message: MessageContent;

  execList: ExecScript[] = [];

  constructor(
    message: MessageContent,
    scripts: ScriptRunResouce[],
    flag: string
  ) {
    this.message = message;
    this.scripts = scripts;
    this.flag = flag;
  }

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
    // 监听值变化
    MessageContent.getInstance().setHandler(
      "valueUpdate",
      (_action, data: ValueUpdateData) => {
        this.execList.forEach((exec) => {
          exec.valueUpdate(data);
        });
      }
    );

    // 注入允许外部调用
    this.externalMessage();
  }

  execScript(script: ScriptRunResouce, scriptFunc: ScriptFunc) {
    // @ts-ignore
    delete window[script.flag];
    const exec = new ExecScript(
      script,
      MessageContent.getInstance(),
      scriptFunc
    );
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
    if (
      script.metadata["run-at"] &&
      script.metadata["run-at"][0] === "document-body"
    ) {
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

  externalMessage() {
    const { message } = this;
    // 对外接口白名单
    for (let i = 0; i < ExternalWhitelist.length; i += 1) {
      if (window.location.host.endsWith(ExternalWhitelist[i])) {
        // 注入
        (<{ external: any }>(<unknown>window)).external = window.external || {};
        (<
          {
            external: {
              Scriptcat: {
                isInstalled: (
                  name: string,
                  namespace: string,
                  callback: any
                ) => void;
              };
            };
          }
        >(<unknown>window)).external.Scriptcat = {
          async isInstalled(name: string, namespace: string, callback: any) {
            const resp = await message.syncSend(ExternalMessage, {
              action: "isInstalled",
              name,
              namespace,
            });
            callback(resp);
          },
        };
        (<{ external: { Tampermonkey: any } }>(
          (<unknown>window)
        )).external.Tampermonkey = (<{ external: { Scriptcat: any } }>(
          (<unknown>window)
        )).external.Scriptcat;
        break;
      }
    }
  }
}
