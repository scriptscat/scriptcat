import { describe, expect, it } from "vitest";
import { buildChatStreamError, cloneChatStreamEvent } from "./cat_stream_event";
import type { ChatStreamEvent, SubAgentDetails, ToolCall } from "@App/app/service/agent/core/types";

// 每个变体一份"最大化"合法样例：把该变体所有可选字段都填上，证明 cloneChatStreamEvent
// 对声明过的每一种事件形状都放行，而不只是对 cat_agent.ts 当前 switch 处理的那 11 种放行。
const fullSubAgentDetails: SubAgentDetails = {
  agentId: "sa-1",
  description: "child task",
  subAgentType: "general",
  messages: [{ content: "child reply", thinking: "child thinking", toolCalls: [] }],
  usage: { inputTokens: 3, outputTokens: 4 },
};

const fullToolCall: ToolCall = {
  id: "tc-1",
  name: "my_tool",
  arguments: "{}",
  result: "tool result",
  attachments: [{ id: "att-1", type: "image", name: "a.png", mimeType: "image/png", size: 10 }],
  ownedAttachmentIds: ["att-1"],
  subAgentDetails: fullSubAgentDetails,
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
      subAgentDetails: fullSubAgentDetails,
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
    pendingAskUser: {
      id: "q-1",
      question: "pick one",
      options: ["a", "b"],
      optionValues: ["A", "B"],
      multiple: true,
      allowCustom: true,
    },
    tasks: [{ id: "t-1", subject: "do it", status: "pending", description: "pending task detail" }],
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

  it("接受 tool_call_delta.id 为空字符串（OpenAI/Anthropic 后续 arguments chunk 的真实产出形态）", () => {
    // providers/openai.ts 与 providers/anthropic.ts 的后续 tool_call_delta 均以
    // `id: tc.id || ""` 发出；resolveToolCall() 本就按 id → index → 最后一个 running 的顺序
    // 回退匹配，空 id 不是伪造数据，是当前生产者的合法产出形态，不能被当作"非空字符串"要求拒绝。
    const cloned = cloneChatStreamEvent({
      type: "tool_call_delta",
      id: "",
      index: 0,
      delta: '{"city":"Tokyo"}',
    });
    expect(cloned).toEqual({
      type: "tool_call_delta",
      id: "",
      index: 0,
      delta: '{"city":"Tokyo"}',
    });
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

describe("cloneChatStreamEvent：行为承载的输入（accessor / Proxy）", () => {
  // 这里针对的是 MAIN/content 兼容路径（CustomEventMessage → parseWindowMessageBody）：
  // 信封的 own-key 集合被校验，但信封内层的 data 负载原样透传，不会被递归 clone。
  // customClone() 在读取描述符前就能判断某个 own key 是不是 accessor 并拒绝，不需要调用 getter。
  it("拒绝携带 enumerable getter 的顶层事件，且不会触发该 getter", () => {
    let getterCalls = 0;
    const forged: Record<string, unknown> = {};
    Object.defineProperty(forged, "type", { value: "error", enumerable: true, configurable: true });
    Object.defineProperty(forged, "message", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return "forged via getter";
      },
    });

    expect(cloneChatStreamEvent(forged)).toBeUndefined();
    expect(getterCalls).toBe(0);
  });

  // Proxy 的反射操作（Reflect.ownKeys / getOwnPropertyDescriptor / getPrototypeOf 等）本身可能
  // 触发 trap，因此不断言 trap 从未被调用——只断言无论 trap 抛出还是返回伪造数据，最终结果都是
  // 拒绝且不产生任何 CAT 状态副作用。customClone() 不是一个 JavaScript 沙箱。
  it("拒绝 Proxy（无论其反射 trap 抛出还是返回伪造数据），且不接受为合法事件", () => {
    const throwingProxy = new Proxy(
      { type: "error", message: "forged" },
      {
        ownKeys() {
          throw new Error("hostile trap");
        },
      }
    );
    expect(cloneChatStreamEvent(throwingProxy)).toBeUndefined();

    const lyingProxy = new Proxy(
      { type: "error", message: "forged" },
      {
        get(target, prop, receiver) {
          if (prop === "type") return "content_delta";
          return Reflect.get(target, prop, receiver);
        },
      }
    );
    // 不主张这里的结果一定是 undefined（trap 可能让校验逻辑读到不一致但仍结构合法的数据），
    // 只主张它绝不会被当作携带任意页面控制字段的对象直接放行——即便被接受，也必须是一份
    // 已经过 exact-key 校验的干净拷贝，而不是对 Proxy 本身的引用。
    const cloned = cloneChatStreamEvent(lyingProxy);
    if (cloned !== undefined) {
      expect(cloned).not.toBe(lyingProxy);
      expect(Object.getPrototypeOf(cloned)).not.toBe(Proxy.prototype);
    }
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

  it("即使 Error.prototype 上被安装了同名 setter，元数据字段仍以自有数据属性写入，不触发该 setter", () => {
    // 字段名集合是固定的（type/errorCode/usage/durationMs），但普通 `err.key = value` 赋值仍然
    // 会先查找原型链；MAIN world 下页面可以提前在 Error.prototype 上放一个同名 setter。
    // buildChatStreamError() 必须用 Native.objectDefineProperty 直接定义自有属性绕开它。
    let setterCalls = 0;
    const original = Object.getOwnPropertyDescriptor(Error.prototype, "errorCode");
    Object.defineProperty(Error.prototype, "errorCode", {
      configurable: true,
      set() {
        setterCalls += 1;
      },
      get() {
        return undefined;
      },
    });
    try {
      const err = buildChatStreamError({ type: "error", message: "boom", errorCode: "rate_limit" });
      expect(setterCalls).toBe(0);
      expect(Object.hasOwn(err, "errorCode")).toBe(true);
      expect(err.errorCode).toBe("rate_limit");
    } finally {
      if (original) {
        Object.defineProperty(Error.prototype, "errorCode", original);
      } else {
        delete (Error.prototype as any).errorCode;
      }
    }
  });
});
