import { describe, expect, it, vi } from "vitest";
import { ConversationInstance } from "./cat_agent";
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
        cb({ action: "event", data: { type: "done", usage: { inputTokens: 10, outputTokens: 5 } } });
      }, 10);
    },
    onDisconnect() {},
    sendMessage() {},
    disconnect() {},
  };
  return conn;
}

function createInstance(commands?: Record<string, (args: string, conv: any) => Promise<string | void>>) {
  const gmSendMessage = vi.fn().mockResolvedValue(undefined);
  const gmConnect = vi.fn().mockResolvedValue(mockConnect());

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
    const errorEvent = { type: "error", message: "Rate limit exceeded", errorCode: "rate_limit" };
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
    const errorEvent = { type: "error", message: "Tool timed out", errorCode: "tool_timeout" };
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
