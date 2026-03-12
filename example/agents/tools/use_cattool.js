// ==UserScript==
// @name         CATTool 安装与使用示例
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  演示如何通过 CAT.agent.tools API 安装、管理和调用 CATTool
// @author       ScriptCat
// @background
// @grant        CAT.agent.tools
// @grant        CAT.agent.conversation
// @grant        GM_log
// ==/UserScript==

// CATTool 代码可以内联定义，也可以从远程 URL 获取
const helloToolCode = `
// ==CATTool==
// @name         hello_world
// @description  向指定的人打招呼
// @param        name string [required] 要打招呼的人名
// ==/CATTool==

return "你好，" + args.name + "！欢迎使用 ScriptCat CATTool。";
`;

const textProcessorCode = `
// ==CATTool==
// @name         text_processor
// @description  文本处理工具，支持字数统计、关键词提取、文本反转
// @param        text string [required] 要处理的文本内容
// @param        action string[count,keywords,reverse] 处理动作
// ==/CATTool==

const text = args.text;
const action = args.action || "count";

if (action === "count") {
  return { chars: text.length, words: text.split(/\\s+/).filter(Boolean).length };
}
if (action === "reverse") {
  return { result: text.split("").reverse().join("") };
}
return { error: "未知操作: " + action };
`;

// 示例 1: 安装与管理 CATTool
async function manageCATTools() {
  GM_log("=== CATTool 管理示例 ===");

  // 安装 CATTool
  await CAT.agent.tools.install(helloToolCode);
  GM_log("hello_world 工具已安装");

  await CAT.agent.tools.install(textProcessorCode);
  GM_log("text_processor 工具已安装");

  // 列出所有已安装的工具
  const tools = await CAT.agent.tools.list();
  GM_log("已安装工具数量: " + tools.length);
  for (const tool of tools) {
    GM_log(`  - ${tool.name}: ${tool.description}`);
  }

  // 直接调用工具（不通过 LLM）
  const greeting = await CAT.agent.tools.call("hello_world", { name: "ScriptCat" });
  GM_log("直接调用结果: " + JSON.stringify(greeting));

  const stats = await CAT.agent.tools.call("text_processor", {
    text: "Hello World 你好世界",
    action: "count",
  });
  GM_log("文本统计: " + JSON.stringify(stats));

  // 删除工具
  // await CAT.agent.tools.remove("hello_world");
  // GM_log("hello_world 工具已删除");
}

// 示例 2: CATTool + Agent 对话联动
// 安装 CATTool 后，Agent 在对话中会自动使用这些工具
async function chatWithCATTools() {
  GM_log("=== CATTool + Agent 对话示例 ===");

  // 确保工具已安装
  await CAT.agent.tools.install(helloToolCode);
  await CAT.agent.tools.install(textProcessorCode);

  // 创建对话 — 已安装的 CATTool 会自动注册为可用工具
  const conv = await CAT.agent.conversation.create({
    system: "你是一个助手，可以使用工具来完成任务。",
  });

  // LLM 会自动识别并调用 hello_world 工具
  const reply1 = await conv.chat("请向小明打个招呼");
  GM_log("回复1: " + reply1.content);
  if (reply1.toolCalls) {
    for (const tc of reply1.toolCalls) {
      GM_log(`  工具调用: ${tc.name}(${tc.arguments}) => ${tc.result}`);
    }
  }

  // LLM 会自动调用 text_processor 工具
  const reply2 = await conv.chat("帮我统计一下这段文字的字数：今天天气真好，适合出去走走。");
  GM_log("回复2: " + reply2.content);
}

// 运行示例
async function main() {
  await manageCATTools();
  // await chatWithCATTools();
}

return main();
