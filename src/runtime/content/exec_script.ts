import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import { compileScript, ScriptFunc } from "./utils";

// 执行脚本,控制脚本执行与停止
export default class ExecScript {
  scriptRes: ScriptRunResouce;

  scriptFunc: ScriptFunc;

  logger: Logger;

  constructor(script: ScriptRunResouce) {
    this.scriptRes = script;
    this.logger = LoggerCore.getInstance().logger({
      component: "exec",
      id: this.scriptRes.id,
      name: this.scriptRes.name,
    });
    // 构建脚本资源
    this.scriptFunc = compileScript(this.scriptRes.code);
    // 构建脚本上下文
  }

  exec() {
    this.logger.info("script start");
    this.scriptFunc(window);
    return Promise.resolve(true);
  }

  // TODO: 实现脚本的停止
  stop() {
    this.logger.info("script stop");
    return true;
  }
}
