import { type WindowMessage } from "@Packages/message/window_message";
import type { SCRIPT_RUN_STATUS, ScriptRunResource } from "@App/app/repo/scripts";
import { Client, sendMessage } from "@Packages/message/client";
import type { MessageSend } from "@Packages/message/types";
import { type VSCodeConnectParam } from "./vscode-connect";
import { type ExternalAccessConnectParam } from "./external-access-connect";
import type { WSEnvelope } from "../service_worker/external_access/types";

export function preparationSandbox(windowMessage: WindowMessage) {
  return sendMessage(windowMessage, "offscreen/preparationSandbox");
}

// sandbox 自身对通道做的一次连通性自检结果（只有 sandbox 自己知道它何时就绪、何时做完这次自检，
// 因此由 sandbox 主动上报，而不是由父层去 ping sandbox）
export type SandboxChannelHealth = { ok: true; roundTripMs: number } | { ok: false; error: string };

export function reportSandboxChannelHealth(windowMessage: WindowMessage, health: SandboxChannelHealth) {
  return sendMessage(windowMessage, "offscreen/reportSandboxChannelHealth", health);
}

export function getExtensionEnv(windowMessage: WindowMessage) {
  return sendMessage(windowMessage, "offscreen/getExtensionEnv", { requireUAD: true });
}

export function keepAlive(windowMessage: WindowMessage, val: boolean) {
  return sendMessage(windowMessage, "offscreen/keepAlive", val);
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

// 执行 Skill Script
export function executeSkillScript(
  msgSender: MessageSend,
  params: {
    uuid: string;
    code: string;
    args: Record<string, unknown>;
    grants: string[];
    name: string;
    requires?: Array<{ url: string; content: string }>;
    configValues?: Record<string, unknown>;
  }
) {
  return sendMessage(msgSender, "offscreen/executeSkillScript", params);
}

// HTML 内容提取
export async function extractHtmlContent(msgSender: MessageSend, html: string): Promise<string | null> {
  const result = await sendMessage(msgSender, "offscreen/htmlExtractor/extractHtmlContent", html);
  return result ?? null;
}

// HTML 内容提取（带 selector 标注）
export async function extractHtmlWithSelectors(msgSender: MessageSend, html: string): Promise<string | null> {
  const result = await sendMessage(msgSender, "offscreen/htmlExtractor/extractHtmlWithSelectors", html);
  return result ?? null;
}

// Bing 搜索结果提取
export async function extractBingResults(
  msgSender: MessageSend,
  html: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const result = await sendMessage(msgSender, "offscreen/htmlExtractor/extractBingResults", html);
  return result ?? [];
}

// 百度搜索结果提取
export async function extractBaiduResults(
  msgSender: MessageSend,
  html: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const result = await sendMessage(msgSender, "offscreen/htmlExtractor/extractBaiduResults", html);
  return result ?? [];
}

// 搜索结果提取
export async function extractSearchResults(
  msgSender: MessageSend,
  html: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const result = await sendMessage(msgSender, "offscreen/htmlExtractor/extractSearchResults", html);
  return result ?? [];
}

export class VscodeConnectClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "offscreen/vscodeConnect");
  }

  connect(params: VSCodeConnectParam): Promise<void> {
    return this.do("connect", params);
  }
}

// SW → offscreen driver for the MCP WS transport. ExternalAccessController uses it to open/close the socket
// and to hand the offscreen ExternalAccessConnect outbound envelopes (bridge.response / pair.decision /
// client.revoke / bridge.shutdown) to write onto the wire.
export class ExternalAccessConnectClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "offscreen/externalAccessConnect");
  }

  connect(params: ExternalAccessConnectParam): Promise<void> {
    return this.do("connect", params);
  }

  disconnect(): Promise<void> {
    return this.do("disconnect");
  }

  send(envelope: WSEnvelope): Promise<void> {
    return this.do("send", envelope);
  }
}
