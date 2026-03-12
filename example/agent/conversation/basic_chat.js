// ==UserScript==
// @name         Agent 基础对话
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  CAT.agent.conversation API 基础用法：创建对话、发送消息、获取回复
// @author       ScriptCat
// @background
// @grant        CAT.agent.conversation
// @grant        GM_log
// ==/UserScript==

async function main() {
  // 创建对话，可指定 system prompt 和模型
  const conv = await CAT.agent.conversation.create({
    system: "你是一个简洁的助手，回答尽量用一句话。",
    // model: "your-model-id",  // 不指定则使用默认模型
  });
  GM_log("对话创建成功, id: " + conv.id);

  // 发送消息并等待完整回复
  const reply = await conv.chat("1+1等于几？");
  GM_log("回复: " + reply.content);
  if (reply.usage) {
    GM_log("Token 用量: 输入 " + reply.usage.inputTokens + ", 输出 " + reply.usage.outputTokens);
  }
}

return main();
