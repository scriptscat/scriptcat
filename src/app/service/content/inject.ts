import { Message, Server } from "@Packages/message/server";
import { ExecScript, ValueUpdateData } from "./exec_script";
import { addStyle, ScriptFunc } from "./utils";
import { getStorageName } from "@App/pkg/utils/utils2";
import { EmitEventRequest, ScriptLoadInfo } from "../service_worker/runtime";

export class InjectRuntime {
  execList: ExecScript[] = [];

  constructor(
    private server: Server,
    private msg: Message,
    private scripts: ScriptLoadInfo[]
  ) {}

  start() {}

  externalMessage() {}

  execScript(script: ScriptLoadInfo, scriptFunc: ScriptFunc) {}

  // 参考了tm的实现
  waitBody(callback: () => void) {}
}

export function generateRunTime(server: Server, msg: Message, scripts: ScriptLoadInfo[]){
  return new InjectRuntime(server, msg, scripts);
}
