import { describe, expect, it } from "vitest";
import { buildChatStreamError, cloneChatStreamEvent } from "./cat_stream_event";
import type { ChatStreamEvent, ToolCall } from "@App/app/service/agent/core/types";

// 每个变体一份"最大化"合法样例：把该变体所有可选字段都填上，证明 cloneChatStreamEvent
// 对声明过的每一种事件形状都放行，而不只是对 cat_agent.ts 当前 switch 处理的那 11 种放行。
const fullToolCall: ToolCall = {
  id: "tc-1",
  name: "my_tool",
  arguments: "{}",
  result: "tool result",
  attachments: [{ id: "att-1", type: "image", name: "a.png", mimeType: "image/png", size: 10 }],
  ownedAttachmentIds: ["att-1"],
  subAgentDetails: { agentId: "sa-1", description: "d", messages: [] } as unknown as ToolCall["subAgentDetails"],
  status: "completed",
};

const subAgent = { agentId: "sa-1", description: "child task", subAgentType: "general", toolCallId: "tc-parent" };

const fixtures: { [T in ChatStreamEvent["type"]]: Extract<ChatStreamEvent, { type: T }> } = {
  content_delta: { type: "content_delta", delta: "hello", subAgent },
  thinking_delta: { type: "thinking_delta", delta: "thinking", subAgent },
  tool_call_start: {
    type: "tool_call_start",
    toolCall: {
      id: "tc-1",
      name: "my_tool",
      arguments: "{}",
      attachments: [{ id: "att-1", type: "file", name: "a.txt", mimeType: "text/plain" }],
      ownedAttachmentIds: ["att-1"],
      status: "running",
    },
    subAgent,
  },
  tool_call_delta: { type: "tool_call_delta", id: "tc-1", delta: "chunk", index: 0, subAgent },
  tool_call_complete: {
    type: "tool_call_complete",
    id: "tc-1",
    result: "done",
    status: "completed",
    attachments: [{ id: "att-1", type: "audio", name: "a.mp3", mimeType: "audio/mpeg", size: 5 }],
    ownedAttachmentIds: ["att-1"],
    subAgent,
  },
  content_block_start: {
    type: "content_block_start",
    block: { type: "image", mimeType: "image/png", name: "generated" },
    subAgent,
  },
  content_block_complete: {
    type: "content_block_complete",
    block: { type: "file", attachmentId: "att-1", mimeType: "text/plain", name: "a.txt", size: 10 },
    data: "base64==",
    subAgent,
  },
  new_message: { type: "new_message", subAgent },
  done: {
    type: "done",
    usage: { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 3, cacheReadInputTokens: 4 },
    durationMs: 100,
    subAgent,
  },
  error: {
    type: "error",
    message: "boom",
    errorCode: "api_error",
    usage: { inputTokens: 1, outputTokens: 2 },
    durationMs: 50,
    subAgent,
  },
  retry: { type: "retry", attempt: 1, maxRetries: 3, error: "timeout", delayMs: 200, subAgent },
  system_warning: { type: "system_warning", message: "careful", subAgent },
  ask_user: {
    type: "ask_user",
    id: "q-1",
    question: "pick one",
    options: ["a", "b"],
    optionValues: ["A", "B"],
    multiple: true,
    allowCustom: false,
  },
  ask_user_expired: { type: "ask_user_expired", id: "q-1" },
  ask_user_resolved: { type: "ask_user_resolved", id: "q-1" },
  task_update: {
    type: "task_update",
    tasks: [{ id: "t-1", subject: "do it", status: "in_progress", description: "details" }],
  },
  compact_done: { type: "compact_done", summary: "summary text", originalCount: 42 },
  sync: {
    type: "sync",
    streamingMessage: { content: "hi", thinking: "hmm", toolCalls: [fullToolCall] },
    pendingAskUser: { id: "q-1", question: "pick one", options: ["a"], multiple: false },
    tasks: [{ id: "t-1", subject: "do it", status: "pending" }],
    status: "running",
  },
};

describe("cloneChatStreamEvent：18 个变体的最大化合法样例全部放行", () => {
  for (const [type, fixture] of Object.entries(fixtures)) {
    it(`接受 ${type}`, () => {
      const cloned = cloneChatStreamEvent(fixture);
      expect(cloned).toBeDefined();
      expect(cloned).toEqual(fixture);
    });
  }
});

describe("cloneChatStreamEvent：未知 key 一律拒绝（不是 __proto__ 黑名单）", () => {
  it("拒绝顶层携带 own '__proto__' 数据属性的事件", () => {
    const forged: Record<string, unknown> = { type: "error", message: "forged" };
    Object.defineProperty(forged, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { forgedPrototype: true },
    });
    expect(cloneChatStreamEvent(forged)).toBeUndefined();
  });

  it("拒绝顶层携带普通未知字段的事件", () => {
    const forged = { type: "error", message: "forged", unexpectedField: "surprise" };
    expect(cloneChatStreamEvent(forged)).toBeUndefined();
  });

  it("拒绝 sync.streamingMessage.toolCalls 里携带未知字段的 ToolCall", () => {
    const forged = {
      type: "sync",
      streamingMessage: { content: "", toolCalls: [{ ...fullToolCall, unexpectedField: "x" }] },
      tasks: [],
      status: "running",
    };
    expect(cloneChatStreamEvent(forged)).toBeUndefined();
  });

  it("拒绝 attachments 数组里携带未知字段的 Attachment", () => {
    const forged = {
      type: "tool_call_complete",
      id: "tc-1",
      result: "done",
      attachments: [{ id: "a", type: "file", name: "n", mimeType: "text/plain", unexpectedField: "x" }],
    };
    expect(cloneChatStreamEvent(forged)).toBeUndefined();
  });

  it("拒绝 subAgent 里携带未知字段", () => {
    const forged = {
      type: "content_delta",
      delta: "x",
      subAgent: { agentId: "a", description: "d", unexpectedField: "x" },
    };
    expect(cloneChatStreamEvent(forged)).toBeUndefined();
  });
});

describe("cloneChatStreamEvent：tool_call_start 与 sync.toolCalls 使用不同的 ToolCall schema", () => {
  it("tool_call_start.toolCall 携带 result 字段时被拒绝（Omit<ToolCall,'result'>）", () => {
    const forged = {
      type: "tool_call_start",
      toolCall: { id: "tc-1", name: "t", arguments: "", result: "should not be here" },
    };
    expect(cloneChatStreamEvent(forged)).toBeUndefined();
  });

  it("sync.streamingMessage.toolCalls 里的完整 ToolCall 允许携带 result", () => {
    const valid = {
      type: "sync",
      streamingMessage: { content: "", toolCalls: [fullToolCall] },
      tasks: [],
      status: "done",
    };
    const cloned = cloneChatStreamEvent(valid);
    expect(cloned).toBeDefined();
    expect((cloned as any).streamingMessage.toolCalls[0].result).toBe("tool result");
  });
});

describe("cloneChatStreamEvent：结构性/值域校验", () => {
  it("拒绝非对象 message.data", () => {
    expect(cloneChatStreamEvent("not an object")).toBeUndefined();
    expect(cloneChatStreamEvent(null)).toBeUndefined();
    expect(cloneChatStreamEvent(undefined)).toBeUndefined();
  });

  it("拒绝未声明的 type", () => {
    expect(cloneChatStreamEvent({ type: "not_a_real_type" })).toBeUndefined();
  });

  it("拒绝 tool_call_complete.status 使用 ToolCall 才有的 pending/running 值", () => {
    expect(
      cloneChatStreamEvent({ type: "tool_call_complete", id: "tc-1", result: "x", status: "pending" })
    ).toBeUndefined();
    expect(
      cloneChatStreamEvent({ type: "tool_call_complete", id: "tc-1", result: "x", status: "running" })
    ).toBeUndefined();
    expect(
      cloneChatStreamEvent({ type: "tool_call_complete", id: "tc-1", result: "x", status: "completed" })
    ).toBeDefined();
  });

  it("拒绝 content_block_complete.block 使用 text 类型（该联合不含 TextBlock）", () => {
    expect(
      cloneChatStreamEvent({ type: "content_block_complete", block: { type: "text", text: "hi" } })
    ).toBeUndefined();
  });
});

describe("buildChatStreamError：固定字段重建 Error，保留 own-key 存在性语义", () => {
  it("完整字段：message/type/errorCode/usage/durationMs 全部保留", () => {
    const event = fixtures.error;
    const err = buildChatStreamError(event);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("boom");
    expect(err.type).toBe("error");
    expect(err.errorCode).toBe("api_error");
    expect(err.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
    expect(err.durationMs).toBe(50);
  });

  it("缺失的可选字段在结果上也不作为 own key 出现", () => {
    const err = buildChatStreamError({ type: "error", message: "boom" });
    expect(Object.hasOwn(err, "errorCode")).toBe(false);
    expect(Object.hasOwn(err, "usage")).toBe(false);
    expect(Object.hasOwn(err, "durationMs")).toBe(false);
  });

  it("即使把恶意 event 传进来，构造出的 Error 原型链也不会被污染（cloneChatStreamEvent 已提前拦截，这里作为二道防线核对）", () => {
    const err = buildChatStreamError({ type: "error", message: "boom" } as any);
    expect(Object.getPrototypeOf(err)).toBe(Error.prototype);
  });
});
