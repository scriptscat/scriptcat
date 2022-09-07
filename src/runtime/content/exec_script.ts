import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Message } from "@App/app/message/message";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import {
  compileScript,
  createContext,
  proxyContext,
  ScriptFunc,
} from "./utils";

// 执行脚本,控制脚本执行与停止
export default class ExecScript {
  scriptRes: ScriptRunResouce;

  scriptFunc: ScriptFunc;

  logger: Logger;

  context: any;

  constructor(script: ScriptRunResouce, message: Message) {
    this.scriptRes = script;
    this.logger = LoggerCore.getInstance().logger({
      component: "exec",
      id: this.scriptRes.id,
      name: this.scriptRes.name,
    });
    // 构建脚本资源
    this.scriptFunc = compileScript(this.scriptRes.code);
    // 构建脚本上下文
    this.context = proxyContext(window, createContext(script, message));
  }

  exec() {
    this.logger.info("script start");
    this.scriptFunc(this.context);
    return Promise.resolve(true);
  }

  // TODO: 实现脚本的停止,资源释放
  stop() {
    this.logger.info("script stop");
    return true;
  }
}
