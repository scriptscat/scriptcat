import type { Conversation, ChatMessage, ToolCall, SubAgentDetails } from "@App/app/service/agent/core/types";
import { getTextContent } from "@App/app/service/agent/core/content_utils";
import { mergeToolResults } from "./chat_utils";

// 格式化时间戳
function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

// 渲染工具调用为 Markdown
function renderToolCall(tc: ToolCall, indent = ""): string {
  const lines: string[] = [];
  let argsStr = "";
  try {
    const parsed = JSON.parse(tc.arguments);
    argsStr = JSON.stringify(parsed, null, 2);
  } catch {
    argsStr = tc.arguments;
  }

  lines.push(`${indent}<details>`);
  lines.push(`${indent}<summary>🔧 ${tc.name}${tc.status === "error" ? " ❌" : ""}</summary>`);
  lines.push("");
  if (argsStr) {
    lines.push(`${indent}**Arguments:**`);
    lines.push(`${indent}\`\`\`json`);
    lines.push(argsStr);
    lines.push(`${indent}\`\`\``);
  }
  if (tc.result) {
    lines.push(`${indent}**Result:**`);
    lines.push(`${indent}\`\`\``);
    lines.push(tc.result);
    lines.push(`${indent}\`\`\``);
  }
  if (tc.subAgentDetails) {
    lines.push("");
    lines.push(renderSubAgent(tc.subAgentDetails, indent));
  }
  lines.push(`${indent}</details>`);
  return lines.join("\n");
}

// 渲染子代理详情
function renderSubAgent(details: SubAgentDetails, indent = ""): string {
  const lines: string[] = [];
  lines.push(
    `${indent}**Sub-Agent:** ${details.description}${details.subAgentType ? ` (${details.subAgentType})` : ""}`
  );
  for (const msg of details.messages) {
    if (msg.thinking) {
      lines.push("");
      lines.push(`${indent}> ${msg.thinking.split("\n").join(`\n${indent}> `)}`);
    }
    if (msg.content) {
      lines.push("");
      lines.push(`${indent}${msg.content}`);
    }
    for (const tc of msg.toolCalls) {
      lines.push("");
      lines.push(renderToolCall(tc, indent));
    }
  }
  return lines.join("\n");
}

// 渲染单条消息内容为 Markdown
function renderMessageContent(msg: ChatMessage): string {
  const parts: string[] = [];

  // Thinking
  if (msg.thinking?.content) {
    parts.push("<details>");
    parts.push("<summary>💭 Thinking</summary>");
    parts.push("");
    parts.push(
      msg.thinking.content
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")
    );
    parts.push("");
    parts.push("</details>");
    parts.push("");
  }

  // 工具调用
  if (msg.toolCalls?.length) {
    for (const tc of msg.toolCalls) {
      parts.push(renderToolCall(tc));
      parts.push("");
    }
  }

  // 文本内容
  const text = getTextContent(msg.content);
  if (text) {
    parts.push(text);
  }

  // 错误信息
  if (msg.error) {
    parts.push(`\n> ⚠️ Error: ${msg.error}`);
  }

  return parts.join("\n");
}

/**
 * 将会话和消息导出为 Markdown
 */
export function exportToMarkdown(conversation: Conversation, messages: ChatMessage[]): string {
  const lines: string[] = [];

  // 标题和元信息
  lines.push(`# ${conversation.title}`);
  lines.push("");
  lines.push(`> Model: \`${conversation.modelId}\` | Created: ${formatDate(conversation.createtime)}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 合并 tool 消息到 assistant 消息（mergeToolResults 会过滤掉 system/tool 消息）
  const merged = mergeToolResults(messages);

  // 先输出 system 消息
  for (const msg of messages) {
    if (msg.role === "system") {
      lines.push("### 🔧 System");
      lines.push("");
      lines.push(getTextContent(msg.content));
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  for (const msg of merged) {
    if (msg.role === "user") {
      lines.push("### 👤 User");
    } else if (msg.role === "assistant") {
      lines.push("### 🤖 Assistant");
    }
    lines.push("");
    lines.push(renderMessageContent(msg));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 触发浏览器下载 Markdown 文件
 */
export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
