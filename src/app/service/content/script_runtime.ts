import { type Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { initEnvInfo, type ScriptExecutor } from "./script_executor";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { EmitEventRequest } from "../service_worker/types";
import type { GMInfoEnv, ValueUpdateDataEncoded } from "./types";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { onInjectPageLoaded } from "./external";

export class ScriptRuntime {
  constructor(
    private readonly scripEnvTag: ScriptEnvTag,
    private readonly server: Server,
    private readonly msg: Message,
    private readonly scriptExecutor: ScriptExecutor,
    private readonly messageFlag: string
  ) {}

  init() {
    this.server.on("runtime/emitEvent", (data: EmitEventRequest) => {
      // 转发给脚本
      this.scriptExecutor.emitEvent(data);
    });
    this.server.on("runtime/valueUpdate", (data: ValueUpdateDataEncoded) => {
      this.scriptExecutor.valueUpdate(data);
    });

    this.server.on("pageLoad", (data: { scripts: TScriptInfo[]; envInfo: GMInfoEnv }) => {
      // 监听事件
      this.startScripts(data.scripts, data.envInfo);
    });

    // 检查early-start的脚本
    this.scriptExecutor.checkEarlyStartScript(this.scripEnvTag, initEnvInfo);
  }

  startScripts(scripts: TScriptInfo[], envInfo: GMInfoEnv) {
    this.scriptExecutor.startScripts(scripts, envInfo);
  }

  externalMessage() {
    onInjectPageLoaded(this.msg);
  }
}
