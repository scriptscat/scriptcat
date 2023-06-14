import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import {
  MessageManager,
  MessageSender,
  ProxyMessageManager,
} from "@App/app/message/message";
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

  sandboxContent?: GMApi;

  proxyMessage: ProxyMessageManager;

  // eslint-disable-next-line camelcase
  GM_info: any;

  constructor(
    scriptRes: ScriptRunResouce,
    message: MessageManager,
    scriptFunc?: ScriptFunc,
    thisContext?: { [key: string]: any }
  ) {
    this.scriptRes = scriptRes;
    this.logger = LoggerCore.getInstance().logger({
      component: "exec",
      id: this.scriptRes.id,
      name: this.scriptRes.name,
    });
    this.GM_info = GMApi.GM_info(this.scriptRes);
    this.proxyMessage = new ProxyMessageManager(message);
    if (scriptFunc) {
      this.scriptFunc = scriptFunc;
    } else {
      // 构建脚本资源
      this.scriptFunc = compileScript(this.scriptRes.code);
    }
    if (scriptRes.grantMap.none) {
      // 不注入任何GM api
      this.proxyContent = global;
    } else {
      // 构建脚本GM上下文
      this.sandboxContent = createContext(
        scriptRes,
        this.GM_info,
        this.proxyMessage
      );
      this.proxyContent = proxyContext(
        global,
        this.sandboxContent,
        thisContext
      );
    }
  }

  // 触发值更新
  valueUpdate(data: ValueUpdateData) {
    this.sandboxContent?.valueUpdate(data);
  }

  exec() {
    this.logger.debug("script start");
    return this.scriptFunc.apply(this.proxyContent, [
      this.proxyContent,
      this.GM_info,
    ]);
  }

  // TODO: 实现脚本的停止,资源释放
  stop() {
    this.logger.debug("script stop");
    this.proxyMessage.cleanChannel();
    return true;
  }
}
