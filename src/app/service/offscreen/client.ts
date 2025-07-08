import { type WindowMessage } from "@Packages/message/window_message";
import type { SCRIPT_RUN_STATUS, ScriptRunResource } from "@App/app/repo/scripts";
import { Client, sendMessage } from "@Packages/message/client";
import type { MessageSend } from "@Packages/message/types";
import { type VSCodeConnect } from "./vscode-connect";

export function preparationSandbox(msg: WindowMessage) {
  return sendMessage(msg, "offscreen/preparationSandbox");
}

// 代理发送消息到ServiceWorker
export function sendMessageToServiceWorker(msg: WindowMessage, action: string, data?: any) {
  return sendMessage(msg, "offscreen/sendMessageToServiceWorker", { action, data });
}

// 代理连接ServiceWorker
export function connectServiceWorker(msg: WindowMessage) {
  return sendMessage(msg, "offscreen/connectServiceWorker");
}

export function proxyUpdateRunStatus(
  msg: WindowMessage,
  data: { uuid: string; runStatus: SCRIPT_RUN_STATUS; error?: any; nextruntime?: number }
) {
  return sendMessageToServiceWorker(msg, "script/updateRunStatus", data);
}

export function runScript(msg: MessageSend, data: ScriptRunResource) {
  return sendMessage(msg, "offscreen/script/runScript", data);
}

export function stopScript(msg: MessageSend, uuid: string) {
  return sendMessage(msg, "offscreen/script/stopScript", uuid);
}

export function createObjectURL(msg: MessageSend, data: Blob, persistence: boolean = false) {
  return sendMessage(msg, "offscreen/createObjectURL", { data, persistence });
}

export class VscodeConnectClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "offscreen/vscodeConnect");
  }

  connect(params: Parameters<VSCodeConnect["connect"]>[0]): ReturnType<VSCodeConnect["connect"]> {
    return this.do("connect", params);
  }
}
