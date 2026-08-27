import { describe, expect, it } from "vitest";
import { toLLMMessages } from "./persisted_messages";
import type { ChatMessage } from "./types";

describe("持久化工具协议恢复", () => {
  it("应为缺失结果补错并丢弃孤立、重复和未知工具结果", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant",
        conversationId: "conv",
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call-1", name: "one", arguments: "{}" },
          { id: "call-2", name: "two", arguments: "{}" },
        ],
        createtime: 1,
      },
      { id: "result-1", conversationId: "conv", role: "tool", content: "first", toolCallId: "call-1", createtime: 2 },
      {
        id: "duplicate",
        conversationId: "conv",
        role: "tool",
        content: "duplicate",
        toolCallId: "call-1",
        createtime: 3,
      },
      { id: "unknown", conversationId: "conv", role: "tool", content: "unknown", toolCallId: "other", createtime: 4 },
      { id: "orphan", conversationId: "conv", role: "tool", content: "orphan", toolCallId: "orphan", createtime: 5 },
      { id: "user", conversationId: "conv", role: "user", content: "next", createtime: 6 },
    ];

    const normalized = toLLMMessages(messages);

    expect(normalized.map((message) => [message.role, message.toolCallId])).toEqual([
      ["assistant", undefined],
      ["tool", "call-1"],
      ["tool", "call-2"],
      ["user", undefined],
    ]);
    expect(normalized[1].content).toBe("first");
    expect(normalized[2].content).toContain("recovery");
  });
});
