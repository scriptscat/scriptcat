import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Message, MessageSender } from "@App/app/message/message";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import { Value } from "@App/app/repo/value";
import GMApi from "./gm_api";
import {
  compileScript,
  createContext,
  proxyContext,
  ScriptFunc,
} from "./utils";

export type ValueUpdateData = {
  oldValue: any;
  value: Value;
  sender: MessageSender & { runFlag?: string };
};

// 执行脚本,控制脚本执行与停止
export default class ExecScript {
  scriptRes: ScriptRunResouce;

  scriptFunc: ScriptFunc;

  logger: Logger;

  proxyContent: any;

  sandboxContent: GMApi;

  constructor(
    scriptRes: ScriptRunResouce,
    message: Message,
    scriptFunc?: ScriptFunc
  ) {
    this.scriptRes = scriptRes;
    this.logger = LoggerCore.getInstance().logger({
      component: "exec",
      id: this.scriptRes.id,
      name: this.scriptRes.name,
    });
    if (scriptFunc) {
      this.scriptFunc = scriptFunc;
    } else {
      // 构建脚本资源
      this.scriptFunc = compileScript(this.scriptRes.code);
    }
    this.sandboxContent = createContext(scriptRes, message);
    // 构建脚本上下文
    this.proxyContent = proxyContext(window, this.sandboxContent);
  }

  // 触发值更新
  valueUpdate(data: ValueUpdateData) {
    this.sandboxContent.valueUpdate(data);
  }

  // 触发菜单点击
  menuClick() {}

  exec() {
    this.logger.debug("script start");
    this.scriptFunc(this.proxyContent);
    return Promise.resolve(true);
  }

  // TODO: 实现脚本的停止,资源释放
  stop() {
    this.logger.debug("script stop");
    return true;
  }
}
