// ==UserScript==
// @name         DOM API - 页面内容读取
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  示例：使用 CAT.agent.dom 读取页面内容，支持 summary/detail 两种模式
// @author       ScriptCat
// @match        *://*/*
// @grant        CAT.agent.dom
// @grant        GM_log
// @grant        GM_registerMenuCommand
// ==/UserScript==

// 示例 1: 概要模式 — 获取页面骨架结构
async function readPageSummary() {
  GM_log("读取页面概要...");

  const page = await CAT.agent.dom.readPage({ mode: "summary" });

  GM_log(`标题: ${page.title}`);
  GM_log(`URL: ${page.url}`);
  GM_log(`可交互元素: ${page.interactable.length} 个`);
  GM_log(`表单: ${page.forms.length} 个`);
  GM_log(`链接: ${page.links.length} 个`);

  // 输出页面分区
  if (page.sections) {
    GM_log("\n=== 页面分区 ===");
    for (const section of page.sections) {
      GM_log(`[${section.selector}] ${section.summary.slice(0, 80)}... (${section.elementCount} 个子元素)`);
    }
  }

  // 输出可交互元素
  GM_log("\n=== 可交互元素 ===");
  for (const el of page.interactable.slice(0, 10)) {
    GM_log(`<${el.tag}> ${el.text.slice(0, 50)} → ${el.selector}`);
  }
}

// 示例 2: 详细模式 — 获取页面完整文本内容
async function readPageDetail() {
  GM_log("读取页面详细内容...");

  const page = await CAT.agent.dom.readPage({
    mode: "detail",
    maxLength: 10000,
  });

  GM_log(`标题: ${page.title}`);
  if (page.truncated) {
    GM_log(`内容已截断，原始长度: ${page.totalLength}`);
  }
  GM_log("\n=== 页面内容 ===");
  GM_log(page.content);
}

// 示例 3: 指定选择器 — 只读取页面某个区域
async function readPageSelector() {
  // 只读取 main 或 article 区域的内容
  const page = await CAT.agent.dom.readPage({
    mode: "detail",
    selector: "main, article",
    maxLength: 5000,
  });

  GM_log("=== 局部内容 ===");
  GM_log(page.content || "(未找到匹配元素)");
}

// 示例 4: 只读取可视区域
async function readViewportOnly() {
  const page = await CAT.agent.dom.readPage({
    mode: "summary",
    viewportOnly: true,
  });

  GM_log("=== 当前可视区域 ===");
  GM_log(`可见交互元素: ${page.interactable.length} 个`);
  GM_log(`可见链接: ${page.links.length} 个`);
  for (const link of page.links.slice(0, 5)) {
    GM_log(`  ${link.text} → ${link.href}`);
  }
}

GM_registerMenuCommand("读取页面概要", readPageSummary);
GM_registerMenuCommand("读取页面详细内容", readPageDetail);
GM_registerMenuCommand("读取指定区域", readPageSelector);
GM_registerMenuCommand("读取可视区域", readViewportOnly);
