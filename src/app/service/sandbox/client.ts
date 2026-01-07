import { type ScriptRunResource } from "@App/app/repo/scripts";
import { sendMessage } from "@Packages/message/client";
import { type WindowMessage } from "@Packages/message/window_message";

export function setSandboxLanguage(msg: WindowMessage, lang: string) {
  return sendMessage(msg, "sandbox/setSandboxLanguage", lang);
}

export function enableScript(msg: WindowMessage, data: ScriptRunResource) {
  return sendMessage(msg, "sandbox/enableScript", data);
}

export function disableScript(msg: WindowMessage, uuid: string) {
  return sendMessage(msg, "sandbox/disableScript", uuid);
}

export function runScript(msg: WindowMessage, data: ScriptRunResource) {
  return sendMessage(msg, "sandbox/runScript", data);
}

export function stopScript(msg: WindowMessage, uuid: string) {
  return sendMessage(msg, "sandbox/stopScript", uuid);
}
