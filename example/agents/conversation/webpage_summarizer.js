// ==UserScript==
// @name         Agent 网页摘要助手
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  实用示例：在网页上使用 Agent 对话来总结页面内容、回答问题
// @author       ScriptCat
// @match        *://*/*
// @grant        CAT.agent.conversation
// @grant        GM_log
// @grant        GM_registerMenuCommand
// ==/UserScript==

// 提取页面主要文本内容
function getPageContent() {
  // 优先取 article 或 main 区域
  const main = document.querySelector("article") || document.querySelector("main") || document.body;
  // 简单提取纯文本，去除脚本和样式
  const clone = main.cloneNode(true);
  clone.querySelectorAll("script, style, nav, footer, header").forEach((el) => el.remove());
  const text = clone.textContent.replace(/\s+/g, " ").trim();
  // 截断过长文本，避免超出 token 限制
  return text.slice(0, 8000);
}

// 对页面内容进行总结
async function summarizePage() {
  const pageContent = getPageContent();
  if (!pageContent || pageContent.length < 50) {
    GM_log("页面内容过少，无法总结");
    return;
  }

  GM_log("正在总结页面内容...");

  const conv = await CAT.agent.conversation.create({
    system: `你是一个网页内容分析助手。用户会给你一段网页文本，请用中文进行总结。
要求：
1. 先用一句话概括主题
2. 列出 3-5 个关键要点
3. 如果有重要的数据或结论，单独列出`,
  });

  const reply = await conv.chat("请总结以下网页内容：\n\n" + pageContent);
  GM_log("=== 页面摘要 ===\n" + reply.content);

  // 可以继续追问
  // const followUp = await conv.chat("这篇文章的主要论点有哪些？");
}

// 通过流式输出实时显示总结过程
async function summarizePageStream() {
  const pageContent = getPageContent();
  if (!pageContent || pageContent.length < 50) {
    GM_log("页面内容过少");
    return;
  }

  const conv = await CAT.agent.conversation.create({
    system: "你是网页内容分析助手，用中文总结网页内容。先概括主题，再列出关键要点。",
  });

  const stream = await conv.chatStream("总结这个网页：\n\n" + pageContent);

  let result = "";
  for await (const chunk of stream) {
    if (chunk.type === "content_delta") {
      result += chunk.content;
      // 实时输出，实际使用中可以更新到页面上的浮窗
    } else if (chunk.type === "done") {
      GM_log("=== 总结完成 ===\n" + result);
    } else if (chunk.type === "error") {
      GM_log("总结失败: " + chunk.error);
    }
  }
}

// 注册右键菜单
GM_registerMenuCommand("总结当前页面", summarizePage);
GM_registerMenuCommand("总结当前页面（流式）", summarizePageStream);
