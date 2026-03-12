import { describe, expect, it, vi } from "vitest";
import { ConversationInstance } from "./cat_agent";
import type { Conversation, StreamChunk } from "@App/app/service/agent/types";
import type { MessageConnect } from "@Packages/message/types";

function mockConversation(): Conversation {
  return {
    id: "test-conv-id",
    title: "Test",
    modelId: "gpt-4",
    createtime: Date.now(),
    updatetime: Date.now(),
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
