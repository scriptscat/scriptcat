import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import GMApi from "./gm_api";
import { compileScript, createContext, proxyContext, ScriptFunc } from "./utils";
import { Message } from "@Packages/message/server";
import { EmitEventRequest } from "../service_worker/runtime";

export type ValueUpdateSender = {
  runFlag: string;
  tabId?: number;
};

export type ValueUpdateData = {
  oldValue: any;
  value: any;
  key: string; // 值key
  uuid: string;
  storageName: string; // 储存name
  sender: ValueUpdateSender;
};

export class RuntimeMessage {}

// 执行脚本,控制脚本执行与停止
export default class ExecScript {
  scriptRes: ScriptRunResouce;

  scriptFunc: ScriptFunc;

  logger: Logger;

  proxyContent: any;

  sandboxContent?: GMApi;

  GM_info: any;

  constructor(
    scriptRes: ScriptRunResouce,
    envPrefix: "content" | "offscreen",
    message: Message,
    code: string | ScriptFunc,
    thisContext?: { [key: string]: any }
  ) {
    this.scriptRes = scriptRes;
    this.logger = LoggerCore.getInstance().logger({
      component: "exec",
      uuid: this.scriptRes.uuid,
      name: this.scriptRes.name,
    });
    this.GM_info = GMApi.GM_info(this.scriptRes);
    // 构建脚本资源
    if (typeof code === "string") {
      this.scriptFunc = compileScript(code);
    } else {
      this.scriptFunc = code;
    }
    const grantMap: { [key: string]: boolean } = {};
    scriptRes.metadata.grant?.forEach((key) => {
      grantMap[key] = true;
    });
    if (grantMap.none) {
      // 不注入任何GM api
      this.proxyContent = global;
    } else {
      // 构建脚本GM上下文
      this.sandboxContent = createContext(scriptRes, this.GM_info, envPrefix, message);
      this.proxyContent = proxyContext(global, this.sandboxContent, thisContext);
    }
  }

  emitEvent(event: string, eventId: string, data: any) {
    this.logger.debug("emit event", { event, eventId, data });
    this.sandboxContent?.emitEvent(event, eventId, data);
  }

  valueUpdate(data: ValueUpdateData) {
    this.sandboxContent?.valueUpdate(data);
  }

  exec() {
    this.logger.debug("script start");
    return this.scriptFunc.apply(this.proxyContent, [this.proxyContent, this.GM_info]);
  }

  stop() {
    this.logger.debug("script stop");
    return true;
  }
}
