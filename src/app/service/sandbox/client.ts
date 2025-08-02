import { type ScriptRunResource } from "@App/app/repo/scripts";
import { actionDataSend } from "@Packages/message/client";
import { type WindowMessenger } from "@Packages/message/window_message";

export function enableScript(msg: WindowMessenger, data: ScriptRunResource) {
  return actionDataSend(msg, "sandbox/enableScript", data);
}

export function disableScript(msg: WindowMessenger, uuid: string) {
  return actionDataSend(msg, "sandbox/disableScript", uuid);
}

export function runScript(msg: WindowMessenger, data: ScriptRunResource) {
  return actionDataSend(msg, "sandbox/runScript", data);
}

export function stopScript(msg: WindowMessenger, uuid: string) {
  return actionDataSend(msg, "sandbox/stopScript", uuid);
}
