import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { MessageQueue } from "@Packages/message/message_queue";
import { WindowMessage } from "@Packages/message/window_message";
import { ResourceClient, ScriptClient, ValueClient } from "../service_worker/client";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL, ScriptRunResouce } from "@App/app/repo/scripts";
import { disableScript, enableScript, runScript, stopScript } from "../sandbox/client";
import { Group, MessageSend } from "@Packages/message/server";
import { subscribeScriptDelete, subscribeScriptEnable, subscribeScriptInstall } from "../queue";

export class ScriptService {
  logger: Logger;

  scriptClient: ScriptClient = new ScriptClient(this.extensionMessage);
  resourceClient: ResourceClient = new ResourceClient(this.extensionMessage);
  valueClient: ValueClient = new ValueClient(this.extensionMessage);

  constructor(
    private group: Group,
    private extensionMessage: MessageSend,
    private windowMessage: WindowMessage,
    private messageQueue: MessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "script" });
  }

  runScript(script: ScriptRunResouce) {
    runScript(this.windowMessage, script);
  }

  stopScript(uuid: string) {
    stopScript(this.windowMessage, uuid);
  }

  async init() {
    subscribeScriptEnable(this.messageQueue, async (data) => {
      const script = await this.scriptClient.info(data.uuid);
      if (script.type === SCRIPT_TYPE_NORMAL) {
        return;
      }
      if (data.enable) {
        // 构造脚本运行资源,发送给沙盒运行
        enableScript(this.windowMessage, await this.scriptClient.getScriptRunResource(script));
      } else {
        // 发送给沙盒停止
        disableScript(this.windowMessage, script.uuid);
      }
    });
    subscribeScriptInstall(this.messageQueue, async (data) => {
      // 判断是开启还是关闭
      if (data.script.status === SCRIPT_STATUS_ENABLE) {
        // 构造脚本运行资源,发送给沙盒运行
        enableScript(this.windowMessage, await this.scriptClient.getScriptRunResource(data.script));
      } else {
        // 发送给沙盒停止
        disableScript(this.windowMessage, data.script.uuid);
      }
    });
    subscribeScriptDelete(this.messageQueue, async (data) => {
      disableScript(this.windowMessage, data.uuid);
    });

    this.group.on("runScript", this.runScript.bind(this));
    this.group.on("stopScript", this.stopScript.bind(this));
  }
}
