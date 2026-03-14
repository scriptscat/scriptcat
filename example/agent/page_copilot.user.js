// ==UserScript==
// @name         Page Copilot
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  AI 网页助手 — 右键菜单唤起，帮你看/写/做任何事
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        CAT.agent.conversation
// @grant        CAT.agent.dom
// ==/UserScript==

"use strict";

const SYSTEM_PROMPT = `你是一个网页智能助手（Page Copilot）。用户会在浏览网页时向你提出各种需求，你需要根据需求类型灵活应对：

## 能力
- **帮我看**：阅读、摘要、翻译、解释、对比页面内容
- **帮我写**：根据页面上下文写回复、评论、邮件、文案
- **帮我做**：自动化操作浏览器（填表、点击、搜索、批量操作等）

## 上下文
用户可能会提供选中的文本作为上下文，优先基于选中内容回答。
如果需要了解页面全貌，使用 browser_action 工具分析页面。
如果需要操作页面，遵循 analyze → act → analyze 循环。

## 原则
- 先理解需求，再决定是否需要调用工具
- 纯文本问答（摘要、翻译、解释）可以直接回复，不必调用工具
- 需要操作页面时才使用浏览器工具
- 回复使用中文，简洁明了`;

// ── UI ──────────────────────────────────────────

function createDialog() {
  const overlay = document.createElement("div");
  overlay.id = "page-copilot-overlay";
  overlay.innerHTML = `
    <style>
      #page-copilot-overlay {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        pointer-events: none;
      }
      #page-copilot-dialog {
        pointer-events: auto;
        background: #fff; border-radius: 12px; width: 400px;
        max-height: 70vh; display: flex; flex-direction: column;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      }
      #page-copilot-dialog .pc-header {
        padding: 16px 20px; border-bottom: 1px solid #e5e5e5;
        font-size: 16px; font-weight: 600; color: #1a1a1a;
        display: flex; justify-content: space-between; align-items: center;
      }
      #page-copilot-dialog .pc-close {
        cursor: pointer; font-size: 20px; color: #999; background: none; border: none; padding: 0 4px;
      }
      #page-copilot-dialog .pc-close:hover { color: #333; }
      #page-copilot-dialog .pc-body {
        padding: 16px 20px; flex: 1; overflow-y: auto; min-height: 100px;
      }
      #page-copilot-dialog .pc-input-area {
        padding: 12px 20px 16px; border-top: 1px solid #e5e5e5;
        display: flex; gap: 8px;
      }
      #page-copilot-dialog .pc-input {
        flex: 1; padding: 10px 14px; border: 1px solid #d9d9d9; border-radius: 8px;
        font-size: 14px; outline: none; resize: none; font-family: inherit;
        min-height: 20px; max-height: 120px;
      }
      #page-copilot-dialog .pc-input:focus { border-color: #4096ff; }
      #page-copilot-dialog .pc-send {
        padding: 10px 20px; background: #4096ff; color: #fff; border: none;
        border-radius: 8px; font-size: 14px; cursor: pointer; white-space: nowrap;
        align-self: flex-end;
      }
      #page-copilot-dialog .pc-send:hover { background: #1677ff; }
      #page-copilot-dialog .pc-send:disabled { background: #d9d9d9; cursor: not-allowed; }
      #page-copilot-dialog .pc-msg {
        margin-bottom: 12px; padding: 10px 14px; border-radius: 8px;
        font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
      }
      #page-copilot-dialog .pc-msg-user {
        background: #e6f4ff; color: #1a1a1a; margin-left: 40px;
      }
      #page-copilot-dialog .pc-msg-ai {
        background: #f5f5f5; color: #1a1a1a; margin-right: 40px;
      }
      #page-copilot-dialog .pc-msg-tool {
        background: #fff7e6; color: #874d00; margin-right: 40px;
        font-size: 12px; padding: 6px 10px;
      }
      #page-copilot-dialog .pc-context {
        background: #f0f0f0; color: #666; font-size: 12px;
        padding: 6px 10px; border-radius: 6px; margin-bottom: 12px;
        max-height: 60px; overflow: hidden;
      }
    </style>
    <div id="page-copilot-dialog">
      <div class="pc-header">
        <span>Page Copilot</span>
        <button class="pc-close">&times;</button>
      </div>
      <div class="pc-body"></div>
      <div class="pc-input-area">
        <textarea class="pc-input" placeholder="输入你的需求..." rows="1"></textarea>
        <button class="pc-send">发送</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const dialog = overlay.querySelector("#page-copilot-dialog");
  const body = dialog.querySelector(".pc-body");
  const input = dialog.querySelector(".pc-input");
  const sendBtn = dialog.querySelector(".pc-send");
  const closeBtn = dialog.querySelector(".pc-close");

  closeBtn.addEventListener("click", close);

  // 自动调整输入框高度
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  function close() {
    overlay.remove();
  }

  function addMessage(text, type = "ai") {
    const div = document.createElement("div");
    div.className = `pc-msg pc-msg-${type}`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function setLoading(loading) {
    sendBtn.disabled = loading;
    input.disabled = loading;
    sendBtn.textContent = loading ? "思考中..." : "发送";
  }

  return { overlay, body, input, sendBtn, close, addMessage, setLoading };
}

// ── 核心逻辑 ──────────────────────────────────────

let conversation = null;

async function ensureConversation() {
  if (!conversation) {
    conversation = await CAT.agent.conversation.create({
      system: SYSTEM_PROMPT,
      skills: ["browser-automation"],
      tools: [
        {
          name: "get_selection",
          description: "获取用户在页面上选中的文本",
          parameters: { type: "object", properties: {} },
          handler: async () => {
            const text = window.getSelection()?.toString()?.trim();
            return text || "当前没有选中任何文本";
          },
        },
        {
          name: "copy_to_clipboard",
          description: "将文本复制到用户的剪贴板",
          parameters: {
            type: "object",
            properties: { text: { type: "string", description: "要复制的文本" } },
            required: ["text"],
          },
          handler: async (a) => {
            GM_setClipboard(a.text);
            return "已复制到剪贴板";
          },
        },
      ],
    });
  }
  return conversation;
}

async function handleSend(ui) {
  const text = ui.input.value.trim();
  if (!text) return;

  ui.input.value = "";
  ui.input.style.height = "auto";
  ui.addMessage(text, "user");
  ui.setLoading(true);

  try {
    const conv = await ensureConversation();
    // 获取选区作为上下文
    const selection = window.getSelection()?.toString()?.trim();
    let message = text;
    if (selection) {
      message = `[用户选中的文本]\n${selection}\n\n[用户需求]\n${message}`;
    }

    const msgDiv = ui.addMessage("", "ai");
    let content = "";

    // 流式输出
    const stream = await conv.chatStream(message);
    for await (const chunk of stream) {
      if (chunk.type === "content_delta") {
        content += chunk.content;
        msgDiv.textContent = content;
        ui.body.scrollTop = ui.body.scrollHeight;
      } else if (chunk.type === "tool_call") {
        ui.addMessage(`🔧 ${chunk.toolCall.name}`, "tool");
      } else if (chunk.type === "error") {
        msgDiv.textContent = content || `错误: ${chunk.error}`;
      }
    }

    if (!content) {
      msgDiv.textContent = "(无回复)";
    }
  } catch (e) {
    ui.addMessage(`出错了: ${e.message || e}`, "ai");
  } finally {
    ui.setLoading(false);
    ui.input.focus();
  }
}

// ── 入口 ──────────────────────────────────────────

function openCopilot() {
  // 防止重复打开
  if (document.getElementById("page-copilot-overlay")) return;

  const ui = createDialog();
  ui.input.focus();

  // 如果有选中文本，显示上下文提示
  const selection = window.getSelection()?.toString()?.trim();
  if (selection) {
    const ctx = document.createElement("div");
    ctx.className = "pc-context";
    ctx.textContent = `📋 已选中: ${selection.slice(0, 200)}${selection.length > 200 ? "..." : ""}`;
    ui.body.appendChild(ctx);
  }

  // 发送
  ui.sendBtn.addEventListener("click", () => handleSend(ui));
  ui.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(ui);
    }
  });
}

// 注册右键菜单
GM_registerMenuCommand("Page Copilot - AI 助手", openCopilot);
