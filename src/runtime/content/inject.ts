import MessageContent from "@App/app/message/content";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import ExecScript from "./exec_script";
import { ScriptFunc } from "./utils";

// 注入脚本的沙盒环境
export default class InjectRuntime {
  scripts: ScriptRunResouce[];

  flag: string;

  constructor(scripts: ScriptRunResouce[], flag: string) {
    this.scripts = scripts;
    this.flag = flag;
  }

  start() {
    this.scripts.forEach((script) => {
      // @ts-ignore
      const scriptFunc = window[script.flag];
      if (scriptFunc) {
        // @ts-ignore
        delete window[script.flag];
        const exec = new ExecScript(
          script,
          MessageContent.getInstance(),
          scriptFunc
        );
        exec.exec();
      } else {
        // 监听脚本加载,和屏蔽读取
        Object.defineProperty(window, script.flag, {
          configurable: true,
          set: (val: ScriptFunc) => {
            // @ts-ignore
            delete window[script.flag];
            const exec = new ExecScript(
              script,
              MessageContent.getInstance(),
              val
            );
            exec.exec();
          },
        });
      }
    });
  }
}
