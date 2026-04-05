import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@App/app/service/agent/core/types";
import {
  mergeToolResults,
  groupMessages,
  computeRegenerateAction,
  computeEditAction,
  computeUserRegenerateAction,
  findNextAssistantGroupIndex,
} from "./chat_utils";

// 辅助函数：创建测试消息
function makeMsg(overrides: Partial<ChatMessage> & { id: string; role: ChatMessage["role"] }): ChatMessage {
  return {
    conversationId: "conv1",
    content: "",
    createtime: Date.now(),
    ...overrides,
  };
}

describe("mergeToolResults", () => {
  it("过滤掉 tool 和 system 消息，只保留 user 和 assistant", () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
      makeMsg({ id: "t1", role: "tool", content: "result", toolCallId: "tc1" }),
      makeMsg({ id: "s1", role: "system", content: "system prompt" }),
    ];
    const result = mergeToolResults(messages);
    expect(result.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("将 tool 结果合并到 assistant 的 toolCalls 中", () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "test", arguments: "{}", status: "running" }],
      }),
      makeMsg({ id: "t1", role: "tool", content: "tool output", toolCallId: "tc1" }),
    ];
    const result = mergeToolResults(messages);
    expect(result).toHaveLength(2);
    expect(result[1].toolCalls?.[0].result).toBe("tool output");
    expect(result[1].toolCalls?.[0].status).toBe("running");
  });
});

describe("groupMessages", () => {
  it("用户和 assistant 消息交替分组", () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "q1" }),
      makeMsg({ id: "a1", role: "assistant", content: "r1" }),
      makeMsg({ id: "u2", role: "user", content: "q2" }),
      makeMsg({ id: "a2", role: "assistant", content: "r2" }),
    ];
    const groups = groupMessages(messages);
    expect(groups).toHaveLength(4);
    expect(groups[0]).toEqual({ type: "user", message: messages[0] });
    expect(groups[1]).toEqual({ type: "assistant", messages: [messages[1]] });
    expect(groups[2]).toEqual({ type: "user", message: messages[2] });
    expect(groups[3]).toEqual({ type: "assistant", messages: [messages[3]] });
  });

  it("连续的 assistant 消息合并为一组", () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "q1" }),
      makeMsg({ id: "a1", role: "assistant", content: "r1" }),
      makeMsg({ id: "a2", role: "assistant", content: "r2" }),
    ];
    const groups = groupMessages(messages);
    expect(groups).toHaveLength(2);
    expect(groups[1]).toEqual({ type: "assistant", messages: [messages[1], messages[2]] });
  });

  it("空消息列表返回空分组", () => {
    expect(groupMessages([])).toEqual([]);
  });
});

describe("computeRegenerateAction", () => {
  // 典型场景：[user, assistant] — 重新生成第一条
  it("重新生成第一条用户消息后的 assistant 响应", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
    ];
    const groups = groupMessages(mergeToolResults(allMessages));
    // groups: [user(u1), assistant(a1)]

    const result = computeRegenerateAction(groups, 1, allMessages);
    expect(result).not.toBeNull();
    // 应删除 assistant 消息 + 用户消息（handleSend 会重新创建）
    expect(result!.idsToDelete).toContain("a1");
    expect(result!.idsToDelete).toContain("u1");
    // 剩余消息应为空
    expect(result!.remainingMessages).toEqual([]);
    // 用户内容保留用于重新发送
    expect(result!.userContent).toBe("hello");
  });

  // 多轮对话：[u1, a1, u2, a2] — 重新生成第二轮的 assistant
  it("重新生成中间轮的 assistant 响应", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "first" }),
      makeMsg({ id: "a1", role: "assistant", content: "reply1" }),
      makeMsg({ id: "u2", role: "user", content: "second" }),
      makeMsg({ id: "a2", role: "assistant", content: "reply2" }),
    ];
    const groups = groupMessages(mergeToolResults(allMessages));
    // groups: [user(u1), assistant(a1), user(u2), assistant(a2)]

    const result = computeRegenerateAction(groups, 3, allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete).toContain("a2");
    expect(result!.idsToDelete).toContain("u2");
    expect(result!.idsToDelete).not.toContain("u1");
    expect(result!.idsToDelete).not.toContain("a1");
    // 保留第一轮
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(result!.userContent).toBe("second");
  });

  // 包含 tool 消息：[u1, a1(toolCall), tool, a2]
  it("包含 tool 消息时正确处理", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "test", arguments: "{}", status: "completed" }],
      }),
      makeMsg({ id: "t1", role: "tool", content: "result", toolCallId: "tc1" }),
      makeMsg({ id: "a2", role: "assistant", content: "final" }),
    ];
    const merged = mergeToolResults(allMessages);
    const groups = groupMessages(merged);
    // merged 过滤了 tool 消息：[u1, a1, a2]
    // groups: [user(u1), assistant(a1, a2)]

    const result = computeRegenerateAction(groups, 1, allMessages);
    expect(result).not.toBeNull();
    // 应删除 merged 中的 assistant 消息 ID + 用户消息 ID
    expect(result!.idsToDelete).toContain("a1");
    expect(result!.idsToDelete).toContain("a2");
    expect(result!.idsToDelete).toContain("u1");
    // 注意：tool 消息不在 groups 里，所以不在 idsToDelete 中
    // 但 remainingMessages 基于 allMessages 过滤，tool 消息也会被保留
    // 这是一个已知行为——deleteMessages 只删指定 ID
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["t1"]);
  });

  it("没有用户消息时返回 null", () => {
    const allMessages: ChatMessage[] = [makeMsg({ id: "a1", role: "assistant", content: "hi" })];
    const groups = groupMessages(allMessages);
    const result = computeRegenerateAction(groups, 0, allMessages);
    expect(result).toBeNull();
  });

  it("传入非 assistant 组索引时返回 null", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
    ];
    const groups = groupMessages(allMessages);
    const result = computeRegenerateAction(groups, 0, allMessages);
    expect(result).toBeNull();
  });
});

describe("computeEditAction", () => {
  it("编辑第一条用户消息：删除所有消息", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
    ];
    const result = computeEditAction("u1", allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete.map((id) => id)).toEqual(["u1", "a1"]);
    expect(result!.remainingMessages).toEqual([]);
  });

  it("编辑中间用户消息：保留之前的消息", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "first" }),
      makeMsg({ id: "a1", role: "assistant", content: "reply1" }),
      makeMsg({ id: "u2", role: "user", content: "second" }),
      makeMsg({ id: "a2", role: "assistant", content: "reply2" }),
    ];
    const result = computeEditAction("u2", allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete).toEqual(["u2", "a2"]);
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("消息不存在时返回 null", () => {
    const result = computeEditAction("nonexistent", []);
    expect(result).toBeNull();
  });
});

describe("findNextAssistantGroupIndex", () => {
  it("用户消息后面有 assistant 组时返回其索引", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
    ];
    const groups = groupMessages(allMessages);
    expect(findNextAssistantGroupIndex(groups, 0)).toBe(1);
  });

  it("用户消息后面没有 assistant 组时返回 null", () => {
    const allMessages: ChatMessage[] = [makeMsg({ id: "u1", role: "user", content: "hello" })];
    const groups = groupMessages(allMessages);
    expect(findNextAssistantGroupIndex(groups, 0)).toBeNull();
  });

  it("用户消息是最后一个 group 时返回 null", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "first" }),
      makeMsg({ id: "a1", role: "assistant", content: "reply" }),
      makeMsg({ id: "u2", role: "user", content: "second" }),
    ];
    const groups = groupMessages(allMessages);
    // groups: [user(u1), assistant(a1), user(u2)]
    expect(findNextAssistantGroupIndex(groups, 2)).toBeNull();
  });

  // 关键场景：用户消息重新生成走的逻辑
  it("用户消息重新生成：通过 findNextAssistantGroupIndex + computeRegenerateAction 联合使用", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
      makeMsg({ id: "u2", role: "user", content: "world" }),
      makeMsg({ id: "a2", role: "assistant", content: "bye" }),
    ];
    const groups = groupMessages(mergeToolResults(allMessages));

    // 第一条用户消息的重新生成
    const assistantIdx0 = findNextAssistantGroupIndex(groups, 0);
    expect(assistantIdx0).toBe(1);
    const action0 = computeRegenerateAction(groups, assistantIdx0!, allMessages);
    expect(action0).not.toBeNull();
    expect(action0!.userContent).toBe("hello");
    // 重新生成第一条：删除 u1 + a1，remainingMessages 不包含它们
    // handleSend 会用 userContent 重新创建 user + assistant
    expect(action0!.idsToDelete).toContain("u1");
    expect(action0!.idsToDelete).toContain("a1");
    // 注意：第二轮消息仍然保留在 remainingMessages 中
    expect(action0!.remainingMessages.map((m) => m.id)).toEqual(["u2", "a2"]);

    // 第二条用户消息的重新生成
    const assistantIdx2 = findNextAssistantGroupIndex(groups, 2);
    expect(assistantIdx2).toBe(3);
    const action2 = computeRegenerateAction(groups, assistantIdx2!, allMessages);
    expect(action2).not.toBeNull();
    expect(action2!.userContent).toBe("world");
    expect(action2!.idsToDelete).toContain("u2");
    expect(action2!.idsToDelete).toContain("a2");
    expect(action2!.remainingMessages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });
});

describe("computeUserRegenerateAction — 用户消息重新生成（bug 修复验证）", () => {
  // 这是用户报告的 bug 场景：点击第一条用户消息的重新生成，会话被清空
  it("【bug 回归】第一条用户消息重新生成：必须保留用户消息，只删除 assistant 回复", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
    ];

    const result = computeUserRegenerateAction("u1", allMessages);
    expect(result).not.toBeNull();

    // 关键断言 1: 只删除 assistant 回复，不删除用户消息
    expect(result!.idsToDelete).toEqual(["a1"]);
    expect(result!.idsToDelete).not.toContain("u1");

    // 关键断言 2: remainingMessages 必须包含用户消息
    expect(result!.remainingMessages).toHaveLength(1);
    expect(result!.remainingMessages[0].id).toBe("u1");
    expect(result!.remainingMessages[0].content).toBe("hello");

    // 关键断言 3: skipUserMessage 必须为 true，防止 startStreaming 重复创建用户消息
    expect(result!.skipUserMessage).toBe(true);

    // 关键断言 4: userContent 正确传递
    expect(result!.userContent).toBe("hello");
  });

  it("多轮对话中重新生成第一条用户消息：只删除紧跟的 assistant 回复", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "first" }),
      makeMsg({ id: "a1", role: "assistant", content: "reply1" }),
      makeMsg({ id: "u2", role: "user", content: "second" }),
      makeMsg({ id: "a2", role: "assistant", content: "reply2" }),
    ];

    const result = computeUserRegenerateAction("u1", allMessages);
    expect(result).not.toBeNull();

    // 删除用户消息之后的所有消息（a1, u2, a2）
    expect(result!.idsToDelete).toEqual(["a1", "u2", "a2"]);

    // 只保留第一条用户消息
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1"]);
    expect(result!.skipUserMessage).toBe(true);
    expect(result!.userContent).toBe("first");
  });

  it("重新生成中间用户消息：保留之前的消息和当前用户消息", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "first" }),
      makeMsg({ id: "a1", role: "assistant", content: "reply1" }),
      makeMsg({ id: "u2", role: "user", content: "second" }),
      makeMsg({ id: "a2", role: "assistant", content: "reply2" }),
    ];

    const result = computeUserRegenerateAction("u2", allMessages);
    expect(result).not.toBeNull();

    // 只删除 u2 之后的回复
    expect(result!.idsToDelete).toEqual(["a2"]);

    // 保留 u1, a1, u2
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
    expect(result!.skipUserMessage).toBe(true);
    expect(result!.userContent).toBe("second");
  });

  it("用户消息后面没有回复时：idsToDelete 为空", () => {
    const allMessages: ChatMessage[] = [makeMsg({ id: "u1", role: "user", content: "hello" })];

    const result = computeUserRegenerateAction("u1", allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete).toEqual([]);
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1"]);
    expect(result!.userContent).toBe("hello");
  });

  it("消息不存在时返回 null", () => {
    const result = computeUserRegenerateAction("nonexistent", [makeMsg({ id: "u1", role: "user", content: "hello" })]);
    expect(result).toBeNull();
  });

  it("包含 tool 消息时也只删除用户消息之后的部分", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "test", arguments: "{}", status: "completed" }],
      }),
      makeMsg({ id: "t1", role: "tool", content: "result", toolCallId: "tc1" }),
      makeMsg({ id: "a2", role: "assistant", content: "final" }),
    ];

    const result = computeUserRegenerateAction("u1", allMessages);
    expect(result).not.toBeNull();

    // 删除 u1 之后的所有消息（a1, t1, a2）
    expect(result!.idsToDelete).toEqual(["a1", "t1", "a2"]);

    // 只保留 u1
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1"]);
    expect(result!.skipUserMessage).toBe(true);
  });
});
