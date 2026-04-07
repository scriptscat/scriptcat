import { describe, it, expect } from "vitest";
import type { Conversation, ChatMessage } from "@App/app/service/agent/core/types";
import { exportToMarkdown } from "./export_utils";

const baseConversation: Conversation = {
  id: "conv-1",
  title: "Test Conversation",
  modelId: "gpt-4o",
  createtime: 1711036800000, // 2024-03-22
  updatetime: 1711036800000,
};

function makeMsg(partial: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">): ChatMessage {
  return {
    id: "msg-" + Math.random().toString(36).slice(2, 6),
    conversationId: "conv-1",
    createtime: Date.now(),
    ...partial,
  };
}

describe("exportToMarkdown", () => {
  it("应该导出基本的用户和助手对话", () => {
    const messages: ChatMessage[] = [
      makeMsg({ role: "user", content: "你好" }),
      makeMsg({ role: "assistant", content: "你好！有什么可以帮你的？" }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("# Test Conversation");
    expect(md).toContain("`gpt-4o`");
    expect(md).toContain("### 👤 User");
    expect(md).toContain("你好");
    expect(md).toContain("### 🤖 Assistant");
    expect(md).toContain("你好！有什么可以帮你的？");
  });

  it("应该导出 thinking 块", () => {
    const messages: ChatMessage[] = [
      makeMsg({ role: "user", content: "计算 1+1" }),
      makeMsg({
        role: "assistant",
        content: "答案是 2",
        thinking: { content: "让我思考一下...\n1+1=2" },
      }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("💭 Thinking");
    expect(md).toContain("> 让我思考一下...");
    expect(md).toContain("> 1+1=2");
    expect(md).toContain("答案是 2");
  });

  it("应该导出工具调用", () => {
    const messages: ChatMessage[] = [
      makeMsg({ role: "user", content: "搜索天气" }),
      makeMsg({
        role: "assistant",
        content: "今天天气晴朗",
        toolCalls: [
          {
            id: "tc-1",
            name: "web_search",
            arguments: '{"query":"今天天气"}',
            result: "晴天 25°C",
            status: "completed",
          },
        ],
      }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("🔧 web_search");
    expect(md).toContain('"query": "今天天气"');
    expect(md).toContain("晴天 25°C");
    expect(md).toContain("今天天气晴朗");
  });

  it("应该导出错误的工具调用", () => {
    const messages: ChatMessage[] = [
      makeMsg({
        role: "assistant",
        content: "调用失败了",
        toolCalls: [
          {
            id: "tc-2",
            name: "web_fetch",
            arguments: '{"url":"https://example.com"}',
            result: "Network error",
            status: "error",
          },
        ],
      }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("🔧 web_fetch ❌");
  });

  it("应该合并 tool 角色消息到 assistant 消息", () => {
    const messages: ChatMessage[] = [
      makeMsg({ role: "user", content: "搜索" }),
      makeMsg({
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tc-1",
            name: "web_search",
            arguments: '{"query":"test"}',
            status: "running",
          },
        ],
      }),
      makeMsg({
        role: "tool",
        content: "搜索结果",
        toolCallId: "tc-1",
      }),
      makeMsg({ role: "assistant", content: "根据搜索结果..." }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("🔧 web_search");
    expect(md).toContain("搜索结果");
    expect(md).toContain("根据搜索结果...");
  });

  it("应该导出子代理详情", () => {
    const messages: ChatMessage[] = [
      makeMsg({
        role: "assistant",
        content: "已完成",
        toolCalls: [
          {
            id: "tc-1",
            name: "agent",
            arguments: '{"description":"搜索资料"}',
            result: "完成",
            status: "completed",
            subAgentDetails: {
              agentId: "sa-1",
              description: "搜索资料",
              messages: [
                {
                  content: "找到了相关资料",
                  toolCalls: [],
                },
              ],
            },
          },
        ],
      }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("Sub-Agent:");
    expect(md).toContain("搜索资料");
    expect(md).toContain("找到了相关资料");
  });

  it("应该导出 system 消息", () => {
    const messages: ChatMessage[] = [
      makeMsg({ role: "system", content: "你是一个助手" }),
      makeMsg({ role: "user", content: "你好" }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("### 🔧 System");
    expect(md).toContain("你是一个助手");
  });

  it("应该导出消息中的错误信息", () => {
    const messages: ChatMessage[] = [
      makeMsg({
        role: "assistant",
        content: "部分内容",
        error: "Rate limit exceeded",
      }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    expect(md).toContain("⚠️ Error: Rate limit exceeded");
  });

  it("应该处理 ContentBlock[] 格式的消息内容", () => {
    const messages: ChatMessage[] = [
      makeMsg({
        role: "user",
        content: [
          { type: "text", text: "看看这张图片" },
          { type: "image", attachmentId: "att-1", mimeType: "image/png", name: "screenshot.png" },
        ],
      }),
    ];
    const md = exportToMarkdown(baseConversation, messages);

    // 文本部分应该被导出
    expect(md).toContain("看看这张图片");
  });

  it("空消息列表应该仍然输出标题", () => {
    const md = exportToMarkdown(baseConversation, []);

    expect(md).toContain("# Test Conversation");
    expect(md).toContain("`gpt-4o`");
  });
});
