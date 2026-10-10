import { type ScriptRunResource } from "@App/app/repo/scripts";
import { sendMessage } from "@Packages/message/client";
import type { MessageSend } from "@Packages/message/types";

export function setSandboxLanguage(msg: MessageSend, lang: string) {
  return sendMessage(msg, "sandbox/setSandboxLanguage", lang);
}

export function enableScript(msg: MessageSend, data: ScriptRunResource) {
  return sendMessage(msg, "sandbox/enableScript", data);
}

export function disableScript(msg: MessageSend, uuid: string) {
  return sendMessage(msg, "sandbox/disableScript", uuid);
}

export function runScript(msg: MessageSend, data: ScriptRunResource) {
  return sendMessage(msg, "sandbox/runScript", data);
}

export function stopScript(msg: MessageSend, uuid: string) {
  return sendMessage(msg, "sandbox/stopScript", uuid);
}
