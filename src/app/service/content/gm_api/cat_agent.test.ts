import { describe, expect, it, vi } from "vitest";
import CATAgentApi, { ConversationInstance } from "./cat_agent";
import type { Conversation, StreamChunk } from "@App/app/service/agent/core/types";
import type { MessageConnect } from "@Packages/message/types";

function mockConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: "test-conv-id",
    title: "Test",
    modelId: "gpt-4",
    createtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

// 创建模拟的 MessageConnect，模拟 LLM 正常回复
function mockConnect(): MessageConnect {
  const conn: MessageConnect = {
    onMessage(cb: (msg: any) => void) {
      setTimeout(() => {
        cb({ action: "event", data: { type: "content_delta", delta: "LLM reply" } });
        cb({ action: "event", data: { type: "done", usage: { inputTokens: 10, outputTokens: 5 }, durationMs: 123 } });
      }, 10);
    },
    onDisconnect() {},
    sendMessage() {},
    disconnect() {},
  };
  return conn;
}

function mockConnectWithSequence(events: Array<{ delayMs: number; data: any }>): MessageConnect {
  return {
    onMessage(cb: (msg: any) => void) {
      for (const { delayMs, data } of events) {
        setTimeout(() => {
          cb({ action: "event", data });
        }, delayMs);
      }
    },
    onDisconnect() {},
    sendMessage() {},
    disconnect() {},
  };
}

function createInstance(
  commands?: Record<string, (args: string, conv: any) => Promise<string | void>>,
  conn: MessageConnect = mockConnect()
) {
  const gmSendMessage = vi.fn().mockResolvedValue(undefined);
  const gmConnect = vi.fn().mockResolvedValue(conn);

  const instance = new ConversationInstance(
    mockConversation(),
    gmSendMessage,
    gmConnect,
    "test-script-uuid",
    20,
    undefined, // initialTools
    commands
  );

  return { instance, gmSendMessage, gmConnect };
}

describe("ConversationInstance 命令机制", () => {
  it("内置 /new 命令清空消息历史", async () => {
    const { instance, gmSendMessage } = createInstance();

    const result = await instance.chat("/new");

    expect(result.command).toBe(true);
    expect(result.content).toBe("对话已清空");
    // 应该调用了 clearMessages
    expect(gmSendMessage).toHaveBeenCalledWith("CAT_agentConversation", [
      expect.objectContaining({ action: "clearMessages", conversationId: "test-conv-id" }),
    ]);
  });

  it("自定义命令正确拦截并返回结果", async () => {
    const { instance, gmConnect } = createInstance({
      "/search": async (args) => {
        return `搜索结果: ${args}`;
      },
    });

    const result = await instance.chat("/search hello world");

    expect(result.command).toBe(true);
    expect(result.content).toBe("搜索结果: hello world");
    // 不应建立 LLM 连接
    expect(gmConnect).not.toHaveBeenCalled();
  });

  it("未注册的 /xxx 命令正常发送给 LLM", async () => {
    const { instance, gmConnect } = createInstance();

    const result = await instance.chat("/unknown command");

    expect(result.command).toBeUndefined();
    expect(result.content).toBe("LLM reply");
    expect(result.durationMs).toBe(123);
    // 应该建立了 LLM 连接
    expect(gmConnect).toHaveBeenCalled();
  });

  it("普通消息正常发送给 LLM", async () => {
    const { instance, gmConnect } = createInstance();

    const result = await instance.chat("你好");

    expect(result.command).toBeUndefined();
    expect(result.content).toBe("LLM reply");
    expect(gmConnect).toHaveBeenCalled();
  });

  it("chatStream 命令拦截返回正确的 chunk 序列", async () => {
    const { instance, gmConnect } = createInstance({
      "/test": async () => "测试结果",
    });

    const stream = await instance.chatStream("/test");
    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("done");
    expect(chunks[0].content).toBe("测试结果");
    expect(chunks[0].command).toBe(true);
    // 不应建立 LLM 连接
    expect(gmConnect).not.toHaveBeenCalled();
  });

  it("chatStream 成功完成时透传 durationMs", async () => {
    const { instance } = createInstance();
    const stream = await instance.chatStream("你好");
    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks.find((chunk) => chunk.type === "done")?.durationMs).toBe(123);
  });

  it("脚本覆盖内置 /new 命令", async () => {
    const customNewHandler = vi.fn().mockResolvedValue("自定义清空逻辑");
    const { instance, gmSendMessage } = createInstance({
      "/new": customNewHandler,
    });

    const result = await instance.chat("/new");

    expect(result.command).toBe(true);
    expect(result.content).toBe("自定义清空逻辑");
    expect(customNewHandler).toHaveBeenCalledWith("", instance);
    // 自定义处理器不会自动调用 clearMessages
    expect(gmSendMessage).not.toHaveBeenCalled();
  });

  it("命令处理器返回 void 时 content 为空字符串", async () => {
    const { instance } = createInstance({
      "/silent": async () => {
        // 不返回值
      },
    });

    const result = await instance.chat("/silent");

    expect(result.command).toBe(true);
    expect(result.content).toBe("");
  });

  it("命令参数正确传递", async () => {
    const handler = vi.fn().mockResolvedValue("ok");
    const { instance } = createInstance({
      "/cmd": handler,
    });

    await instance.chat("/cmd  arg1 arg2  ");

    expect(handler).toHaveBeenCalledWith("arg1 arg2", instance);
  });

  it("无参数命令正确解析", async () => {
    const handler = vi.fn().mockResolvedValue("ok");
    const { instance } = createInstance({
      "/reset": handler,
    });

    await instance.chat("/reset");

    expect(handler).toHaveBeenCalledWith("", instance);
  });
});

// ---- Ephemeral 会话测试 ----

function createEphemeralInstance(options?: {
  system?: string;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
}) {
  const gmSendMessage = vi.fn().mockResolvedValue(undefined);
  const gmConnect = vi.fn().mockResolvedValue(mockConnect());

  const instance = new ConversationInstance(
    mockConversation({ modelId: "test-model" }),
    gmSendMessage,
    gmConnect,
    "test-script-uuid",
    20,
    options?.tools,
    undefined, // commands
    true, // ephemeral
    options?.system
  );

  return { instance, gmSendMessage, gmConnect };
}

describe("ConversationInstance ephemeral 模式", () => {
  it("chat 时传递 ephemeral 参数给 SW", async () => {
    const { instance, gmConnect } = createEphemeralInstance({ system: "你是助手" });

    await instance.chat("你好");

    expect(gmConnect).toHaveBeenCalledTimes(1);
    const connectParams = gmConnect.mock.calls[0][1][0];
    expect(connectParams.ephemeral).toBe(true);
    expect(connectParams.system).toBe("你是助手");
    expect(connectParams.modelId).toBe("test-model");
    // messages 应包含 user message
    expect(connectParams.messages).toEqual(expect.arrayContaining([{ role: "user", content: "你好" }]));
  });

  it("chat 后 assistant 消息追加到内存历史", async () => {
    const { instance } = createEphemeralInstance();

    await instance.chat("你好");

    const messages = await instance.getMessages();
    // 应有 user + assistant
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("你好");
    // 最后一条应是 assistant
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toBe("LLM reply");
  });

  it("多轮对话正确累积消息历史", async () => {
    const { instance, gmConnect } = createEphemeralInstance();

    await instance.chat("第一条");
    await instance.chat("第二条");

    // 第二次 connect 时 messages 应包含前一轮的历史
    const secondCallParams = gmConnect.mock.calls[1][1][0];
    const msgs = secondCallParams.messages;
    // 包含：user("第一条") + assistant("LLM reply") + assistant("LLM reply")(final) + user("第二条")
    expect(msgs.length).toBeGreaterThanOrEqual(3);
    expect(msgs[0]).toEqual({ role: "user", content: "第一条" });
    // 最后一条在 messages 数组中是 user("第二条")，因为 user message 在 connect 前追加
    // assistant 回复在 processChat 之后才追加，所以第二次 connect 时的 messages 最后一条是 user
    const userMsgs = msgs.filter((m: any) => m.role === "user");
    expect(userMsgs).toHaveLength(2);
    expect(userMsgs[0].content).toBe("第一条");
    expect(userMsgs[1].content).toBe("第二条");
    // 应有第一轮的 assistant 回复
    const assistantMsgs = msgs.filter((m: any) => m.role === "assistant");
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(1);
    expect(assistantMsgs[0].content).toBe("LLM reply");
  });

  it("getMessages 返回内存历史（不调用 SW）", async () => {
    const { instance, gmSendMessage } = createEphemeralInstance();

    await instance.chat("测试");

    const messages = await instance.getMessages();
    // 不应调用 SW 的 getMessages
    expect(gmSendMessage).not.toHaveBeenCalledWith(
      "CAT_agentConversation",
      expect.arrayContaining([expect.objectContaining({ action: "getMessages" })])
    );
    // 消息应包含 conversationId 和 id
    expect(messages[0].conversationId).toBe("test-conv-id");
    expect(messages[0].id).toMatch(/^ephemeral-/);
  });

  it("clear 清空内存历史（不调用 SW）", async () => {
    const { instance, gmSendMessage } = createEphemeralInstance();

    await instance.chat("测试");
    expect((await instance.getMessages()).length).toBeGreaterThan(0);

    await instance.clear();

    const messages = await instance.getMessages();
    expect(messages).toHaveLength(0);
    // 不应调用 SW 的 clearMessages
    expect(gmSendMessage).not.toHaveBeenCalledWith(
      "CAT_agentConversation",
      expect.arrayContaining([expect.objectContaining({ action: "clearMessages" })])
    );
  });

  it("chatStream ephemeral 传递正确参数", async () => {
    const { instance, gmConnect } = createEphemeralInstance({ system: "系统提示" });

    const stream = await instance.chatStream("流式测试");
    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(gmConnect).toHaveBeenCalledTimes(1);
    const connectParams = gmConnect.mock.calls[0][1][0];
    expect(connectParams.ephemeral).toBe(true);
    expect(connectParams.system).toBe("系统提示");
    expect(connectParams.messages).toEqual(expect.arrayContaining([{ role: "user", content: "流式测试" }]));

    // 流应正常完成
    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });

  it("chatStream ephemeral 收集 assistant 消息到内存历史", async () => {
    const { instance } = createEphemeralInstance();

    const stream = await instance.chatStream("你好");
    // 消费完 stream
    for await (const _chunk of stream) {
      // drain
    }

    const messages = await instance.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe("user");
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toBe("LLM reply");
  });

  it("ephemeral 模式下 /new 命令清空内存历史", async () => {
    const { instance, gmSendMessage } = createEphemeralInstance();

    await instance.chat("消息1");
    expect((await instance.getMessages()).length).toBeGreaterThan(0);

    const result = await instance.chat("/new");
    expect(result.command).toBe(true);

    const messages = await instance.getMessages();
    expect(messages).toHaveLength(0);
    // ephemeral 的 clear 不调用 SW
    expect(gmSendMessage).not.toHaveBeenCalled();
  });

  it("ephemeral 模式带自定义工具时传递 tools", async () => {
    const handler = vi.fn().mockResolvedValue({ result: "ok" });
    const { instance, gmConnect } = createEphemeralInstance({
      tools: [
        {
          name: "my_tool",
          description: "自定义工具",
          parameters: { type: "object", properties: {} },
          handler,
        },
      ],
    });

    await instance.chat("使用工具");

    const connectParams = gmConnect.mock.calls[0][1][0];
    expect(connectParams.tools).toBeDefined();
    expect(connectParams.tools).toHaveLength(1);
    expect(connectParams.tools[0].name).toBe("my_tool");
  });
});

// ---- tool_call_complete / new_message 事件重建测试 ----

// 模拟真实的一轮 tool call 往返：tool_call_start/delta → executeTools（脚本执行）→ toolResults →
// tool_call_complete（带执行结果）→ new_message（下一轮开始）→ 最终文本 → done
function mockConnectWithToolRound(toolId: string, toolName: string): MessageConnect {
  let onMsgCb: (msg: any) => void = () => {};
  return {
    onMessage(cb: (msg: any) => void) {
      onMsgCb = cb;
      setTimeout(() => {
        cb({
          action: "event",
          data: { type: "tool_call_start", toolCall: { id: toolId, name: toolName, arguments: "" } },
        });
        cb({ action: "event", data: { type: "tool_call_delta", id: toolId, delta: '{"a":1}' } });
        cb({ action: "executeTools", data: [{ id: toolId, name: toolName, arguments: '{"a":1}' }] });
      }, 0);
    },
    onDisconnect() {},
    sendMessage(msg: any) {
      if (msg.action === "toolResults") {
        const result = msg.data[0];
        setTimeout(() => {
          onMsgCb({
            action: "event",
            data: {
              type: "tool_call_complete",
              id: toolId,
              result: result.result,
              status: result.error ? "error" : "completed",
            },
          });
          onMsgCb({ action: "event", data: { type: "new_message" } });
          onMsgCb({ action: "event", data: { type: "content_delta", delta: "Final answer" } });
          onMsgCb({
            action: "event",
            data: { type: "done", usage: { inputTokens: 10, outputTokens: 5 }, durationMs: 50 },
          });
        }, 0);
      }
    },
    disconnect() {},
  };
}

describe("ConversationInstance tool_call_complete / new_message 重建历史", () => {
  it("chat()：assistant toolCalls 应带执行结果与 completed 状态，最终回复不重复", async () => {
    const handler = vi.fn().mockResolvedValue("ok");
    const gmSendMessage = vi.fn().mockResolvedValue(undefined);
    const gmConnect = vi.fn().mockResolvedValue(mockConnectWithToolRound("call-1", "my_tool"));

    const instance = new ConversationInstance(
      mockConversation({ modelId: "test-model" }),
      gmSendMessage,
      gmConnect,
      "test-script-uuid",
      20,
      [{ name: "my_tool", description: "d", parameters: { type: "object", properties: {} }, handler }],
      undefined,
      true // ephemeral
    );

    const reply = await instance.chat("使用工具");
    expect(reply.content).toBe("Final answer");

    const messages = await instance.getMessages();
    const assistantWithTools = messages.find((m) => m.toolCalls && m.toolCalls.length > 0);
    expect(assistantWithTools).toBeDefined();
    expect(assistantWithTools!.toolCalls![0]).toMatchObject({ id: "call-1", result: "ok", status: "completed" });

    // 应有对应的 tool 角色消息
    const toolMsg = messages.find((m) => m.role === "tool" && m.toolCallId === "call-1");
    expect(toolMsg?.content).toBe("ok");

    // 最终 assistant 内容只应出现一次，不应重复
    const finalAssistantMsgs = messages.filter((m) => m.role === "assistant" && m.content === "Final answer");
    expect(finalAssistantMsgs).toHaveLength(1);
  });

  it("chatStream()：ephemeral 历史应包含带结果的 toolCalls 及对应 tool 消息", async () => {
    const handler = vi.fn().mockResolvedValue("ok");
    const gmSendMessage = vi.fn().mockResolvedValue(undefined);
    const gmConnect = vi.fn().mockResolvedValue(mockConnectWithToolRound("call-2", "my_tool"));

    const instance = new ConversationInstance(
      mockConversation({ modelId: "test-model" }),
      gmSendMessage,
      gmConnect,
      "test-script-uuid",
      20,
      [{ name: "my_tool", description: "d", parameters: { type: "object", properties: {} }, handler }],
      undefined,
      true // ephemeral
    );

    const stream = await instance.chatStream("使用工具");
    const chunks: any[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.some((c) => c.type === "tool_call_complete")).toBe(true);

    const messages = await instance.getMessages();
    const assistantWithTools = messages.find((m) => m.toolCalls && m.toolCalls.length > 0);
    expect(assistantWithTools).toBeDefined();
    expect(assistantWithTools!.toolCalls![0]).toMatchObject({ id: "call-2", result: "ok", status: "completed" });

    const toolMsg = messages.find((m) => m.role === "tool" && m.toolCallId === "call-2");
    expect(toolMsg?.content).toBe("ok");

    const finalAssistantMsgs = messages.filter((m) => m.role === "assistant" && m.content === "Final answer");
    expect(finalAssistantMsgs).toHaveLength(1);
  });

  it("chatStream() 提前 break：未完成的 toolCall 不应作为无结果的悬空协议状态记入历史（finding 9）", async () => {
    const gmSendMessage = vi.fn().mockResolvedValue(undefined);
    // 只发 tool_call_start，永远不发 tool_call_complete，模拟消费方在工具调用完成前就 break
    const gmConnect = vi.fn().mockResolvedValue(
      mockConnectWithEvents([
        { type: "tool_call_start", toolCall: { id: "call-early", name: "my_tool", arguments: "" } },
        { type: "tool_call_delta", id: "call-early", delta: "{}" },
      ])
    );

    const instance = new ConversationInstance(
      mockConversation({ modelId: "test-model" }),
      gmSendMessage,
      gmConnect,
      "test-script-uuid",
      20,
      [],
      undefined,
      true // ephemeral
    );

    const stream = await instance.chatStream("使用工具");
    for await (const chunk of stream) {
      if (chunk.type === "tool_call") break;
    }

    const messages = await instance.getMessages();
    const assistantWithTools = messages.find((m) => m.toolCalls && m.toolCalls.length > 0);
    expect(assistantWithTools).toBeDefined();
    // 没有收到 result 的 toolCall 必须被补成终态（而不是原样带着 status:"running"、result:undefined 记入历史）
    expect(assistantWithTools!.toolCalls![0].status).not.toBe("running");
    expect(assistantWithTools!.toolCalls![0].result).toBeDefined();

    // 必须有配对的 tool 结果消息，否则重放给 provider 时协议状态不完整
    const toolMsg = messages.find((m) => m.role === "tool" && m.toolCallId === "call-early");
    expect(toolMsg).toBeDefined();
  });
});

describe("executeTools：连接 settle 后不应继续执行剩余 handler（finding 9）", () => {
  it("连接在第一个 handler 执行期间断开时，第二个 handler 不应被调用", async () => {
    let disconnectCb: ((isSelfDisconnected: boolean) => void) | undefined;

    const handlerA = vi.fn().mockImplementation(async () => {
      // 模拟 handlerA 执行期间用户点击 Stop / 脚本工具超时：连接断开
      disconnectCb?.(false);
      return "result-a";
    });
    const handlerB = vi.fn().mockResolvedValue("result-b");

    const conn: MessageConnect = {
      onMessage(cb: (msg: any) => void) {
        // 与文件中其他 mock 一致：用 setTimeout(0) 异步派发，避免手动轮询回调是否已注册
        setTimeout(() => {
          cb({
            action: "executeTools",
            requestId: "req-1",
            data: [
              { id: "call-a", name: "tool_a", arguments: "{}" },
              { id: "call-b", name: "tool_b", arguments: "{}" },
            ],
          });
        }, 0);
      },
      onDisconnect(cb: (isSelfDisconnected: boolean) => void) {
        disconnectCb = cb;
      },
      sendMessage() {},
      disconnect() {},
    };

    const gmSendMessage = vi.fn().mockResolvedValue(undefined);
    const gmConnect = vi.fn().mockResolvedValue(conn);

    const instance = new ConversationInstance(
      mockConversation({ modelId: "test-model" }),
      gmSendMessage,
      gmConnect,
      "test-script-uuid",
      20,
      [
        { name: "tool_a", description: "d", parameters: { type: "object", properties: {} }, handler: handlerA },
        { name: "tool_b", description: "d", parameters: { type: "object", properties: {} }, handler: handlerB },
      ],
      undefined,
      true // ephemeral
    );

    // chat() 因连接断开而 reject，这正是本测试要观察的效果
    await expect(instance.chat("使用工具")).rejects.toThrow();

    expect(handlerA).toHaveBeenCalledOnce();
    // handlerB 不应被调用：executeTools 在 handlerA 执行期间连接已 settle，
    // 后续 toolCall 直接补成取消结果，不再串行往下执行（见 finding 9）
    expect(handlerB).not.toHaveBeenCalled();
  });
});

describe("executeTools：批次级取消（finding 6）", () => {
  it("收到 cancelToolBatch 后，该批次剩余的 handler 不应再执行", async () => {
    let messageCb: ((msg: any) => void) | undefined;

    const handlerA = vi.fn().mockImplementation(async () => {
      // handlerA 执行期间，SW 端脚本工具批次超时，发来该批次的作废通知
      messageCb?.({ action: "cancelToolBatch", requestId: "req-timeout" });
      return "result-a";
    });
    const handlerB = vi.fn().mockResolvedValue("result-b");

    const conn: MessageConnect = {
      onMessage(cb: (msg: any) => void) {
        messageCb = cb;
        setTimeout(() => {
          cb({
            action: "executeTools",
            requestId: "req-timeout",
            data: [
              { id: "call-a", name: "tool_a", arguments: "{}" },
              { id: "call-b", name: "tool_b", arguments: "{}" },
            ],
          });
          // SW 端已用超时错误结果推进对话，稍后正常完成
          setTimeout(() => {
            cb({ action: "event", data: { type: "done", usage: { inputTokens: 1, outputTokens: 1 } } });
          }, 5);
        }, 0);
      },
      onDisconnect() {},
      sendMessage() {},
      disconnect() {},
    };

    const gmSendMessage = vi.fn().mockResolvedValue(undefined);
    const gmConnect = vi.fn().mockResolvedValue(conn);

    const instance = new ConversationInstance(
      mockConversation({ modelId: "test-model" }),
      gmSendMessage,
      gmConnect,
      "test-script-uuid",
      20,
      [
        { name: "tool_a", description: "d", parameters: { type: "object", properties: {} }, handler: handlerA },
        { name: "tool_b", description: "d", parameters: { type: "object", properties: {} }, handler: handlerB },
      ],
      undefined,
      true // ephemeral
    );

    await instance.chat("使用工具");

    expect(handlerA).toHaveBeenCalledOnce();
    // handlerB 不应被调用：批次已被 SW 端超时作废，剩余 handler 的副作用会与下一批次交叠
    expect(handlerB).not.toHaveBeenCalled();
  });

  it("收到 cancelToolBatch 时应中止当前 handler 的批次级 AbortSignal", async () => {
    let messageCb: ((msg: any) => void) | undefined;
    let handlerSignal: AbortSignal | undefined;

    const handler = vi.fn().mockImplementation(async (_args: Record<string, unknown>, signal?: AbortSignal) => {
      handlerSignal = signal;
      messageCb?.({ action: "cancelToolBatch", requestId: "req-active" });
      return "late-result";
    });

    const conn: MessageConnect = {
      onMessage(cb: (msg: any) => void) {
        messageCb = cb;
        setTimeout(() => {
          cb({
            action: "executeTools",
            requestId: "req-active",
            data: [{ id: "call-active", name: "tool_active", arguments: "{}" }],
          });
          setTimeout(() => {
            cb({ action: "event", data: { type: "done", usage: { inputTokens: 1, outputTokens: 1 } } });
          }, 5);
        }, 0);
      },
      onDisconnect() {},
      sendMessage() {},
      disconnect() {},
    };

    const instance = new ConversationInstance(
      mockConversation({ modelId: "test-model" }),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(conn),
      "test-script-uuid",
      20,
      [
        {
          name: "tool_active",
          description: "d",
          parameters: { type: "object", properties: {} },
          handler,
        },
      ],
      undefined,
      true
    );

    await instance.chat("使用工具");

    expect(handlerSignal).toBeInstanceOf(AbortSignal);
    expect(handlerSignal?.aborted).toBe(true);
  });
});

describe("conversation.create maxIterations 归一化入口", () => {
  it("显式传入 0 时应原样送往服务端，由统一归一化逻辑钳位为 1", async () => {
    const connect = vi.fn().mockResolvedValue(mockConnect());
    const apiThis = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      connect,
      scriptRes: { uuid: "script-1" },
    };

    const instance = await CATAgentApi.prototype["CAT.agent.conversation.create"].call(apiThis, {
      ephemeral: true,
      maxIterations: 0,
    });
    await instance.chat("hello");

    expect(connect).toHaveBeenCalledWith(
      "CAT_agentConversationChat",
      expect.arrayContaining([expect.objectContaining({ maxIterations: 0 })])
    );
  });
});

// ---- errorCode 透传测试 ----

// 创建发送指定事件序列的 mock 连接
function mockConnectWithEvents(events: any[]): MessageConnect {
  return {
    onMessage(cb: (msg: any) => void) {
      let i = 0;
      const send = () => {
        if (i < events.length) {
          cb({ action: "event", data: events[i++] });
          setTimeout(send, 0);
        }
      };
      setTimeout(send, 0);
    },
    onDisconnect() {},
    sendMessage() {},
    disconnect() {},
  };
}

describe("errorCode 透传：chat()", () => {
  it("error event 带 errorCode 时，reject 的 Error 应有对应 errorCode", async () => {
    const errorEvent = {
      type: "error",
      message: "Rate limit exceeded",
      errorCode: "rate_limit",
      usage: { inputTokens: 12, outputTokens: 3 },
      durationMs: 321,
    };
    const gmConnect = vi.fn().mockResolvedValue(mockConnectWithEvents([errorEvent]));

    const instance = new ConversationInstance(
      mockConversation(),
      vi.fn().mockResolvedValue(undefined),
      gmConnect,
      "uuid",
      20
    );

    const err = await instance.chat("你好").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Rate limit exceeded");
    expect((err as any).errorCode).toBe("rate_limit");
    expect((err as any).usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect((err as any).durationMs).toBe(321);
  });

  it("error event 无 errorCode 时，errorCode 应为 undefined", async () => {
    const errorEvent = { type: "error", message: "Unknown error" };
    const gmConnect = vi.fn().mockResolvedValue(mockConnectWithEvents([errorEvent]));

    const instance = new ConversationInstance(
      mockConversation(),
      vi.fn().mockResolvedValue(undefined),
      gmConnect,
      "uuid",
      20
    );

    const err = await instance.chat("你好").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as any).errorCode).toBeUndefined();
  });

  it("各种 errorCode 值均能正确透传", async () => {
    const codes = ["rate_limit", "auth", "tool_timeout", "max_iterations", "api_error"];

    for (const code of codes) {
      const gmConnect = vi
        .fn()
        .mockResolvedValue(mockConnectWithEvents([{ type: "error", message: "error", errorCode: code }]));

      const instance = new ConversationInstance(
        mockConversation(),
        vi.fn().mockResolvedValue(undefined),
        gmConnect,
        "uuid",
        20
      );

      const err = await instance.chat("test").catch((e) => e);
      expect((err as any).errorCode).toBe(code);
    }
  });
});

describe("errorCode 透传：chatStream()", () => {
  // processStream 在收到 error 事件后：将 error chunk 推入队列并设置 done=true。
  // 迭代器先 yield error chunk（done: false），然后返回 { done: true }（正常结束）。
  // 因此不会 throw，只需检查 chunk 中的 errorCode 即可。

  it("error event 带 errorCode 时，error chunk 应有对应 errorCode", async () => {
    const errorEvent = {
      type: "error",
      message: "Tool timed out",
      errorCode: "tool_timeout",
      usage: { inputTokens: 12, outputTokens: 3 },
      durationMs: 321,
    };
    const gmConnect = vi.fn().mockResolvedValue(mockConnectWithEvents([errorEvent]));

    const instance = new ConversationInstance(
      mockConversation(),
      vi.fn().mockResolvedValue(undefined),
      gmConnect,
      "uuid",
      20
    );

    const stream = await instance.chatStream("你好");
    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const errorChunk = chunks.find((c) => c.type === "error");
    expect(errorChunk).toBeDefined();
    expect(errorChunk!.error).toBe("Tool timed out");
    expect((errorChunk as any).errorCode).toBe("tool_timeout");
    expect((errorChunk as any).usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect((errorChunk as any).durationMs).toBe(321);
  });

  it("error event 无 errorCode 时，chunk.errorCode 应为 undefined", async () => {
    const errorEvent = { type: "error", message: "Some error" };
    const gmConnect = vi.fn().mockResolvedValue(mockConnectWithEvents([errorEvent]));

    const instance = new ConversationInstance(
      mockConversation(),
      vi.fn().mockResolvedValue(undefined),
      gmConnect,
      "uuid",
      20
    );

    const stream = await instance.chatStream("你好");
    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const errorChunk = chunks.find((c) => c.type === "error");
    expect(errorChunk).toBeDefined();
    expect((errorChunk as any).errorCode).toBeUndefined();
  });

  it("各种 errorCode 均能正确在 chunk 中透传", async () => {
    const codes = ["rate_limit", "auth", "tool_timeout", "max_iterations", "api_error"];

    for (const code of codes) {
      const gmConnect = vi
        .fn()
        .mockResolvedValue(mockConnectWithEvents([{ type: "error", message: "err", errorCode: code }]));

      const instance = new ConversationInstance(
        mockConversation(),
        vi.fn().mockResolvedValue(undefined),
        gmConnect,
        "uuid",
        20
      );

      const stream = await instance.chatStream("test");
      const chunks: StreamChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const errorChunk = chunks.find((c) => c.type === "error");
      expect((errorChunk as any).errorCode).toBe(code);
    }
  });
});

describe("ConversationInstance 子代理事件隔离", () => {
  it("chat() 应忽略 subAgent 终态事件并等待父会话结束", async () => {
    const subAgent = { agentId: "sa-1", description: "child task", subAgentType: "general" };
    const conn = mockConnectWithSequence([
      { delayMs: 0, data: { type: "content_delta", delta: "child text", subAgent } },
      {
        delayMs: 1,
        data: {
          type: "error",
          message: "child failed",
          errorCode: "api_error",
          subAgent,
        },
      },
      { delayMs: 2, data: { type: "content_delta", delta: "parent text" } },
      {
        delayMs: 3,
        data: { type: "done", usage: { inputTokens: 11, outputTokens: 4 }, durationMs: 91 },
      },
    ]);
    const { instance } = createInstance(undefined, conn);

    await expect(instance.chat("hello")).resolves.toMatchObject({
      content: "parent text",
      durationMs: 91,
    });
  });

  it("chatStream() 应忽略 subAgent 终态事件并继续输出父会话内容", async () => {
    const subAgent = { agentId: "sa-2", description: "child task", subAgentType: "general" };
    const conn = mockConnectWithSequence([
      { delayMs: 0, data: { type: "content_delta", delta: "child text", subAgent } },
      {
        delayMs: 1,
        data: {
          type: "done",
          usage: { inputTokens: 7, outputTokens: 2 },
          durationMs: 33,
          subAgent,
        },
      },
      { delayMs: 2, data: { type: "content_delta", delta: "parent text" } },
      {
        delayMs: 3,
        data: { type: "done", usage: { inputTokens: 11, outputTokens: 4 }, durationMs: 91 },
      },
    ]);
    const { instance } = createInstance(undefined, conn);

    const chunks: StreamChunk[] = [];
    const stream = await instance.chatStream("hello");
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: "content_delta", content: "parent text" },
      { type: "done", usage: { inputTokens: 11, outputTokens: 4 }, durationMs: 91 },
    ]);
  });
});

describe("ConversationInstance tool_call_complete 结果净化", () => {
  it("chat() 返回的 toolCalls 不应携带事件专属字段，且无 status 时默认 completed", async () => {
    const conn = mockConnectWithSequence([
      {
        delayMs: 0,
        data: { type: "tool_call_start", toolCall: { id: "tc-1", name: "my_tool", arguments: "" } },
      },
      { delayMs: 1, data: { type: "tool_call_complete", id: "tc-1", result: "done" } },
      { delayMs: 2, data: { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, durationMs: 12 } },
    ]);
    const { instance } = createInstance(undefined, conn);

    const reply = await instance.chat("hello");
    expect(reply.toolCalls).toHaveLength(1);
    expect(reply.toolCalls?.[0]).toMatchObject({
      id: "tc-1",
      name: "my_tool",
      arguments: "",
      result: "done",
      status: "completed",
    });
    expect(reply.toolCalls?.[0]).not.toHaveProperty("type");
    expect(reply.toolCalls?.[0]).not.toHaveProperty("subAgent");
  });

  it("chatStream() 返回的 tool_call_complete chunk 应只保留工具调用字段", async () => {
    const conn = mockConnectWithSequence([
      {
        delayMs: 0,
        data: { type: "tool_call_start", toolCall: { id: "tc-2", name: "my_tool", arguments: "" } },
      },
      { delayMs: 1, data: { type: "tool_call_complete", id: "tc-2", result: "done" } },
      { delayMs: 2, data: { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, durationMs: 12 } },
    ]);
    const { instance } = createInstance(undefined, conn);

    const chunks: StreamChunk[] = [];
    const stream = await instance.chatStream("hello");
    for await (const chunk of stream) chunks.push(chunk);

    const completionChunk = chunks.find((chunk) => chunk.type === "tool_call_complete");
    expect(completionChunk).toBeDefined();
    expect(completionChunk?.toolCall).toMatchObject({
      id: "tc-2",
      name: "my_tool",
      arguments: "",
      result: "done",
      status: "completed",
    });
    expect(completionChunk?.toolCall).not.toHaveProperty("type");
    expect(completionChunk?.toolCall).not.toHaveProperty("subAgent");
  });
});
