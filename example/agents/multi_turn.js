// ==UserScript==
// @name         Agent 多轮对话
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  多轮对话示例：连续发送多条消息，自动携带上下文；查看对话历史；恢复已有对话
// @author       ScriptCat
// @background
// @grant        CAT.agent.conversation
// @grant        GM_log
// ==/UserScript==

// 多轮对话：连续提问，LLM 会记住上下文
async function multiTurn() {
  const conv = await CAT.agent.conversation.create({
    system: "你是一个数学老师",
  });

  const reply1 = await conv.chat("什么是斐波那契数列？");
  GM_log("第一轮: " + reply1.content);

  // 第二轮自动携带上下文，LLM 知道在讨论斐波那契
  const reply2 = await conv.chat("它的前10个数是什么？");
  GM_log("第二轮: " + reply2.content);

  // 查看完整对话历史
  const messages = await conv.getMessages();
  GM_log("对话共 " + messages.length + " 条消息");
  for (const msg of messages) {
    GM_log(`  [${msg.role}] ${msg.content.slice(0, 50)}...`);
  }
}

// 恢复对话：通过固定 id 在多次脚本执行间保持同一个对话
async function resumeConversation() {
  // 第一次运行时创建对话
  let conv = await CAT.agent.conversation.get("my-persistent-chat");
  if (!conv) {
    conv = await CAT.agent.conversation.create({
      id: "my-persistent-chat",
      system: "你是助手，请记住用户告诉你的信息。",
    });
    await conv.chat("记住：我喜欢蓝色");
    GM_log("首次对话完成，已告知偏好");
  }

  // 后续运行时恢复对话，LLM 能回忆之前的内容
  const reply = await conv.chat("我喜欢什么颜色？");
  GM_log("恢复对话回复: " + reply.content);
}

return multiTurn();
// return resumeConversation();
