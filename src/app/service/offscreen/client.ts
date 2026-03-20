import { type WindowMessage } from "@Packages/message/window_message";
import type { SCRIPT_RUN_STATUS, ScriptRunResource } from "@App/app/repo/scripts";
import { Client, sendMessage } from "@Packages/message/client";
import type { MessageSend } from "@Packages/message/types";
import { type VSCodeConnectParam } from "./vscode-connect";

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
