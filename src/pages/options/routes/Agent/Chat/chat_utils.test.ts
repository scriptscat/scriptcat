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
    // 存在对应的 tool 结果消息即证明工具已结束，过期的 "running" 必须被纠正为 "completed"
    expect(result[1].toolCalls?.[0].status).toBe("completed");
  });

  it("有 tool 结果消息时，过期的 running 状态视为已完成（对话结束后工具图标不应一直转圈）", () => {
    // 复现：SW 在回写状态前被终止 / abort，库里残留 status=running 但 tool 结果消息已落库
    const messages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "test", arguments: "{}", status: "running" }],
      }),
      makeMsg({ id: "t1", role: "tool", content: "done", toolCallId: "tc1" }),
    ];
    const result = mergeToolResults(messages);
    expect(result[1].toolCalls?.[0].status).toBe("completed");
  });

  it("无 tool 结果消息的 running 工具保持 running（仍在执行中，不误判为完成）", () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "test", arguments: "{}", status: "running" }],
      }),
      // 另一个工具有结果，使 toolResultMap 非空，但 tc1 自身没有结果
      makeMsg({
        id: "a2",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc2", name: "test", arguments: "{}", status: "completed" }],
      }),
      makeMsg({ id: "t2", role: "tool", content: "done", toolCallId: "tc2" }),
    ];
    const result = mergeToolResults(messages);
    expect(result[1].toolCalls?.[0].status).toBe("running");
  });

  it("有 tool 结果消息时，error 状态不被覆盖为 completed", () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "test", arguments: "{}", status: "error" }],
      }),
      makeMsg({ id: "t1", role: "tool", content: "boom", toolCallId: "tc1" }),
    ];
    const result = mergeToolResults(messages);
    expect(result[1].toolCalls?.[0].status).toBe("error");
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
  it("重新生成第一条用户消息后的 assistant 响应", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
    ];
    const groups = groupMessages(mergeToolResults(allMessages));

    const result = computeRegenerateAction(groups, 1, allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete).toContain("a1");
    expect(result!.idsToDelete).toContain("u1");
    expect(result!.remainingMessages).toEqual([]);
    expect(result!.userContent).toBe("hello");
  });

  it("重新生成中间轮的 assistant 响应", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "first" }),
      makeMsg({ id: "a1", role: "assistant", content: "reply1" }),
      makeMsg({ id: "u2", role: "user", content: "second" }),
      makeMsg({ id: "a2", role: "assistant", content: "reply2" }),
    ];
    const groups = groupMessages(mergeToolResults(allMessages));

    const result = computeRegenerateAction(groups, 3, allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete).toContain("a2");
    expect(result!.idsToDelete).toContain("u2");
    expect(result!.idsToDelete).not.toContain("u1");
    expect(result!.idsToDelete).not.toContain("a1");
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(result!.userContent).toBe("second");
  });

  it("包含 tool 消息时一并删除对应的 tool 结果，不留孤立 tool_result", () => {
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

    const result = computeRegenerateAction(groups, 1, allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete).toContain("a1");
    expect(result!.idsToDelete).toContain("a2");
    expect(result!.idsToDelete).toContain("u1");
    // tool 结果消息 t1 对应的 tool_use 在被删的 a1 中，必须一并删除，否则成为孤立 tool_result
    expect(result!.idsToDelete).toContain("t1");
    expect(result!.remainingMessages).toEqual([]);
  });

  it("【bug 回归】重新生成多轮对话的最后一轮：删除该轮的 tool 结果，避免上一轮 LLM 上下文混入孤立 tool_result", () => {
    // 复现用户报告：重新生成后下一次请求带上了无配对的 tool_result
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "first" }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "test", arguments: "{}", status: "completed" }],
      }),
      makeMsg({ id: "t1", role: "tool", content: "result1", toolCallId: "tc1" }),
      makeMsg({ id: "a2", role: "assistant", content: "reply1" }),
      makeMsg({ id: "u2", role: "user", content: "second" }),
      makeMsg({
        id: "a3",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc2", name: "test", arguments: "{}", status: "completed" }],
      }),
      makeMsg({ id: "t2", role: "tool", content: "result2", toolCallId: "tc2" }),
      makeMsg({ id: "a4", role: "assistant", content: "reply2" }),
    ];
    const groups = groupMessages(mergeToolResults(allMessages));

    // groups: [user u1, assistant(a1,a2), user u2, assistant(a3,a4)]，重新生成第二轮 assistant 组（index 3）
    const result = computeRegenerateAction(groups, 3, allMessages);
    expect(result).not.toBeNull();
    expect(result!.idsToDelete).toEqual(expect.arrayContaining(["u2", "a3", "a4", "t2"]));
    // 上一轮完整保留；第二轮的 t2（孤立 tool_result 来源）必须被删除
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1", "a1", "t1", "a2"]);
    expect(result!.remainingMessages.some((m) => m.id === "t2")).toBe(false);
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
    expect(findNextAssistantGroupIndex(groups, 2)).toBeNull();
  });

  it("用户消息重新生成：通过 findNextAssistantGroupIndex + computeRegenerateAction 联合使用", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
      makeMsg({ id: "u2", role: "user", content: "world" }),
      makeMsg({ id: "a2", role: "assistant", content: "bye" }),
    ];
    const groups = groupMessages(mergeToolResults(allMessages));

    const assistantIdx0 = findNextAssistantGroupIndex(groups, 0);
    expect(assistantIdx0).toBe(1);
    const action0 = computeRegenerateAction(groups, assistantIdx0!, allMessages);
    expect(action0).not.toBeNull();
    expect(action0!.userContent).toBe("hello");
    expect(action0!.idsToDelete).toContain("u1");
    expect(action0!.idsToDelete).toContain("a1");
    expect(action0!.remainingMessages.map((m) => m.id)).toEqual(["u2", "a2"]);

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
  it("【bug 回归】第一条用户消息重新生成：必须保留用户消息，只删除 assistant 回复", () => {
    const allMessages: ChatMessage[] = [
      makeMsg({ id: "u1", role: "user", content: "hello" }),
      makeMsg({ id: "a1", role: "assistant", content: "hi" }),
    ];

    const result = computeUserRegenerateAction("u1", allMessages);
    expect(result).not.toBeNull();

    expect(result!.idsToDelete).toEqual(["a1"]);
    expect(result!.idsToDelete).not.toContain("u1");

    expect(result!.remainingMessages).toHaveLength(1);
    expect(result!.remainingMessages[0].id).toBe("u1");
    expect(result!.remainingMessages[0].content).toBe("hello");

    expect(result!.skipUserMessage).toBe(true);
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
    expect(result!.idsToDelete).toEqual(["a1", "u2", "a2"]);
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
    expect(result!.idsToDelete).toEqual(["a2"]);
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
    expect(result!.idsToDelete).toEqual(["a1", "t1", "a2"]);
    expect(result!.remainingMessages.map((m) => m.id)).toEqual(["u1"]);
    expect(result!.skipUserMessage).toBe(true);
  });
});
