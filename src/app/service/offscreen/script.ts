import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { type WindowMessage } from "@Packages/message/window_message";
import { ResourceClient, ScriptClient, ValueClient } from "../service_worker/client";
import type { ScriptRunResource } from "@App/app/repo/scripts";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { disableScript, enableScript, runScript, stopScript } from "../sandbox/client";
import { type Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { TDeleteScript, TInstallScript, TEnableScript } from "../queue";

export class ScriptService {
  logger: Logger;

  scriptClient: ScriptClient = new ScriptClient(this.extMsgSender);
  resourceClient: ResourceClient = new ResourceClient(this.extMsgSender);
  valueClient: ValueClient = new ValueClient(this.extMsgSender);

  constructor(
    private group: Group,
    private extMsgSender: MessageSend,
    private windowMessage: WindowMessage,
    private messageQueue: IMessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "script" });
  }

  runScript(script: ScriptRunResource) {
    runScript(this.windowMessage, script);
  }

  stopScript(uuid: string) {
    stopScript(this.windowMessage, uuid);
  }

  async init() {
    this.messageQueue.subscribe<TEnableScript[]>("enableScripts", async (data) => {
      for (const { uuid, enable } of data) {
        const script = await this.scriptClient.info(uuid);
        if (script.type === SCRIPT_TYPE_NORMAL) {
          continue;
        }
        if (enable) {
          // 构造脚本运行资源,发送给沙盒运行
          enableScript(this.windowMessage, await this.scriptClient.getScriptRunResourceByUUID(uuid));
        } else {
          // 发送给沙盒停止
          disableScript(this.windowMessage, script.uuid);
        }
      }
    });
    this.messageQueue.subscribe<TInstallScript>("installScript", async (data) => {
      // 普通脚本不处理
      if (data.script.type === SCRIPT_TYPE_NORMAL) {
        return;
      }
      // 判断是开启还是关闭
      if (data.script.status === SCRIPT_STATUS_ENABLE) {
        // 构造脚本运行资源,发送给沙盒运行
        enableScript(this.windowMessage, await this.scriptClient.getScriptRunResourceByUUID(data.script.uuid));
      } else {
        // 发送给沙盒停止
        disableScript(this.windowMessage, data.script.uuid);
      }
    });
    this.messageQueue.subscribe<TDeleteScript[]>("deleteScripts", async (data) => {
      for (const { uuid, type } of data) {
        // 只发送后台脚本和定时脚本
        if (type === SCRIPT_TYPE_BACKGROUND || type === SCRIPT_TYPE_CRONTAB) {
          await disableScript(this.windowMessage, uuid);
        }
      }
    });

    this.group.on("runScript", this.runScript.bind(this));
    this.group.on("stopScript", this.stopScript.bind(this));
  }
}
