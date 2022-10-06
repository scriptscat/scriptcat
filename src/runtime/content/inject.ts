import MessageContent from "@App/app/message/content";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import ExecScript, { ValueUpdateData } from "./exec_script";
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
    const execList = <ExecScript[]>[];
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
        execList.push(exec);
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
            execList.push(exec);
            exec.exec();
          },
        });
      }
    });
    // 监听值变化
    MessageContent.getInstance().setHandler(
      "valueUpdate",
      (_action, data: ValueUpdateData) => {
        execList.forEach((exec) => {
          exec.valueUpdate(data);
        });
      }
    );
  }
}
