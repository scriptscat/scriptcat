import { type WindowMessage } from "@Packages/message/window_message";
import type { SCRIPT_RUN_STATUS, ScriptRunResource } from "@App/app/repo/scripts";
import { Client, sendMessage } from "@Packages/message/client";
import type { MessageSend } from "@Packages/message/types";
import { type VSCodeConnect } from "./vscode-connect";

export function preparationSandbox(windowMessage: WindowMessage) {
  return sendMessage(windowMessage, "offscreen/preparationSandbox");
}

// 代理发送消息到ServiceWorker
export function sendMessageToServiceWorker(windowMessage: WindowMessage, action: string, data?: any) {
  return sendMessage(windowMessage, "offscreen/sendMessageToServiceWorker", { action, data });
}

// 代理连接ServiceWorker
export function connectServiceWorker(windowMessage: WindowMessage) {
  return sendMessage(windowMessage, "offscreen/connectServiceWorker");
}

export function proxyUpdateRunStatus(
  windowMessage: WindowMessage,
  data: { uuid: string; runStatus: SCRIPT_RUN_STATUS; error?: any; nextruntime?: number }
) {
  return sendMessageToServiceWorker(windowMessage, "script/updateRunStatus", data);
}

export function runScript(msgSender: MessageSend, data: ScriptRunResource) {
  return sendMessage(msgSender, "offscreen/script/runScript", data);
}

export function stopScript(msgSender: MessageSend, uuid: string) {
  return sendMessage(msgSender, "offscreen/script/stopScript", uuid);
}

export function createObjectURL(msgSender: MessageSend, params: { blob: Blob; persistence: boolean }) {
  return sendMessage(msgSender, "offscreen/createObjectURL", params);
}

export class VscodeConnectClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "offscreen/vscodeConnect");
  }

  connect(params: Parameters<VSCodeConnect["connect"]>[0]): ReturnType<VSCodeConnect["connect"]> {
    return this.do("connect", params);
  }
}
