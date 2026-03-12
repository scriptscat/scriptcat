// ==UserScript==
// @name         Agent 流式输出
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  使用 chatStream 实现流式输出，适合需要实时展示生成内容的场景
// @author       ScriptCat
// @background
// @grant        CAT.agent.conversation
// @grant        GM_log
// ==/UserScript==

async function main() {
  const conv = await CAT.agent.conversation.create({
    system: "你是一个诗人",
  });

  // chatStream 返回 AsyncIterable，可以用 for-await-of 逐块读取
  const stream = await conv.chatStream("写一首关于代码的五言绝句");

  let fullContent = "";
  for await (const chunk of stream) {
    switch (chunk.type) {
      case "content_delta":
        // 每个 delta 是一小段文本，拼接起来就是完整回复
        fullContent += chunk.content;
        // 实际使用中可以在这里实时更新 UI
        break;

      case "thinking_delta":
        // 部分模型（如 Anthropic）会输出思考过程
        GM_log("[思考] " + chunk.content);
        break;

      case "tool_call":
        // 如果配置了 tools，LLM 调用工具时会产生此事件
        GM_log("[工具调用] " + chunk.toolCall.name);
        break;

      case "done":
        GM_log("流式完成: " + fullContent);
        if (chunk.usage) {
          GM_log("Token: 输入 " + chunk.usage.inputTokens + " / 输出 " + chunk.usage.outputTokens);
        }
        break;

      case "error":
        GM_log("错误: " + chunk.error);
        break;
    }
  }
}

return main();
