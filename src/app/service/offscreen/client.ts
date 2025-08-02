import { type WindowMessenger } from "@Packages/message/window_message";
import type { SCRIPT_RUN_STATUS, ScriptRunResource } from "@App/app/repo/scripts";
import { Client, actionDataSend } from "@Packages/message/client";
import type { IMRequester } from "@Packages/message/types";
import { type VSCodeConnect } from "./vscode-connect";

export function preparationSandbox(msg: WindowMessenger) {
  return actionDataSend(msg, "offscreen/preparationSandbox");
}

// 代理发送消息到ServiceWorker
export function sendMessageToServiceWorker(msg: WindowMessenger, action: string, data?: any) {
  return actionDataSend(msg, "offscreen/sendMessageToServiceWorker", { action, data });
}

// 代理连接ServiceWorker
export function connectServiceWorker(msg: WindowMessenger) {
  return actionDataSend(msg, "offscreen/connectServiceWorker");
}

export function proxyUpdateRunStatus(
  msg: WindowMessenger,
  data: { uuid: string; runStatus: SCRIPT_RUN_STATUS; error?: any; nextruntime?: number }
) {
  return sendMessageToServiceWorker(msg, "script/updateRunStatus", data);
}

export function runScript(msg: IMRequester, data: ScriptRunResource) {
  return actionDataSend(msg, "offscreen/script/runScript", data);
}

export function stopScript(msg: IMRequester, uuid: string) {
  return actionDataSend(msg, "offscreen/script/stopScript", uuid);
}

export function createObjectURL(msg: IMRequester, data: Blob, persistence: boolean = false) {
  return actionDataSend(msg, "offscreen/createObjectURL", { data, persistence });
}

export class VscodeConnectClient extends Client {
  constructor(msg: IMRequester) {
    super(msg, "offscreen/vscodeConnect");
  }

  connect(params: Parameters<VSCodeConnect["connect"]>[0]): ReturnType<VSCodeConnect["connect"]> {
    return this.do("connect", params);
  }
}
