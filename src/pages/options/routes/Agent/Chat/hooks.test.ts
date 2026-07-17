import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Conversation, ChatMessage } from "@App/app/service/agent/core/types";

// 会话仓库整体打桩：hooks 只是 repo + 消息总线的薄封装，测试聚焦其状态迁移逻辑。
const repoMock = vi.hoisted(() => ({
  listConversations: vi.fn<() => Promise<Conversation[]>>(() => Promise.resolve([])),
  createConversation: vi.fn<(c: Conversation) => Promise<Conversation>>((conversation) =>
    Promise.resolve({ ...conversation, generation: "gen-new", revision: 1 })
  ),
  saveConversation: vi.fn<(c: Conversation) => Promise<void>>(() => Promise.resolve()),
  deleteConversation: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  getMessages: vi.fn<(id: string) => Promise<ChatMessage[]>>(() => Promise.resolve([])),
  saveMessages: vi.fn<(id: string, m: ChatMessage[]) => Promise<void>>(() => Promise.resolve()),
  saveTasks: vi.fn<(id: string, t: unknown[]) => Promise<void>>(() => Promise.resolve()),
  getTasks: vi.fn<(id: string) => Promise<unknown[]>>(() => Promise.resolve([])),
}));

vi.mock("@App/app/repo/agent_chat", () => ({ agentChatRepo: repoMock }));
vi.mock("@App/app/repo/skill_repo", () => ({
  SkillRepo: class {
    listSkills() {
      return Promise.resolve([]);
    }
  },
}));
vi.mock("@App/pages/store/global", () => ({ message: {} }));

// 可控 mock 连接：测试直接驱动 onMessage 回调，模拟"stop 之后终态事件才到达"的真实时序
function createMockConn() {
  let messageHandler: ((msg: any) => void) | null = null;
  let disconnectHandler: (() => void) | null = null;
  return {
    conn: {
      sendMessage: vi.fn(),
      onMessage: (cb: (msg: any) => void) => {
        messageHandler = cb;
      },
      onDisconnect: (cb: () => void) => {
        disconnectHandler = cb;
      },
      disconnect: vi.fn(),
    },
    emit: (data: any) => messageHandler?.({ data }),
    fireDisconnect: () => disconnectHandler?.(),
  };
}

const mockConnect = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
vi.mock("@Packages/message/client", () => ({
  connect: mockConnect,
  sendMessage: mockSendMessage,
}));

import { useConversations, deleteMessages, clearMessages, useStreamingChat } from "./hooks";

describe("useStreamingChat：stop 后仍需放行终态事件（finding 6）", () => {
  it("应把本次 UI 新上传附件的所有权发送给 Service Worker", async () => {
    const { conn } = createMockConn();
    mockConnect.mockResolvedValue(conn);
    const { result } = renderHook(() => useStreamingChat());

    await act(async () => {
      await result.current.sendMessage("conv-1", "hi", vi.fn(), vi.fn(), undefined, undefined, undefined, {
        ownedAttachmentIds: ["upload.png"],
      });
    });

    expect(mockConnect).toHaveBeenCalledWith({}, "serviceWorker/agent/conversationChat", {
      conversationId: "conv-1",
      message: "hi",
      modelId: undefined,
      skipSaveUserMessage: undefined,
      enableTools: undefined,
      ownedAttachmentIds: ["upload.png"],
    });
  });

  it("stopGeneration 之后到达的终态事件仍应触发 onDone 并断开连接，而不是被 abortedRef 吞掉", async () => {
    const { conn, emit } = createMockConn();
    mockConnect.mockResolvedValue(conn);

    const { result } = renderHook(() => useStreamingChat());
    const onEvent = vi.fn();
    const onDone = vi.fn();

    await act(async () => {
      await result.current.sendMessage("conv-1", "hi", onEvent, onDone);
    });

    // 用户点击 Stop：只发 stop 消息、置 abortedRef，不立即断开
    act(() => {
      result.current.stopGeneration();
    });
    expect(conn.sendMessage).toHaveBeenCalledWith({ action: "stop" });
    expect(conn.disconnect).not.toHaveBeenCalled();

    // Stop 之后、真正终态事件到达之前的流式增量应被抑制
    act(() => {
      emit({ type: "content_delta", delta: "不应该被处理" });
    });
    expect(onEvent).not.toHaveBeenCalledWith({ type: "content_delta", delta: "不应该被处理" });

    // 真正的终态事件（携带取消原因/usage）到达：必须放行、断开连接、触发 onDone
    act(() => {
      emit({ type: "error", errorCode: "cancelled", message: "Conversation cancelled", usage: { inputTokens: 1 } });
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "error", errorCode: "cancelled" }));
    expect(conn.disconnect).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });
});

const conv = (id: string, title = "c"): Conversation => ({
  id,
  generation: `gen-${id}`,
  revision: 1,
  title,
  modelId: "gpt-4o",
  createtime: 1,
  updatetime: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.listConversations.mockResolvedValue([]);
});

describe("会话管理 Hook useConversations", () => {
  it("挂载时若存在会话且 URL 无 id，自动选中第一个", async () => {
    repoMock.listConversations.mockResolvedValue([conv("a"), conv("b")]);
    const { result } = renderHook(() => useConversations(), { wrapper: MemoryRouter });
    await waitFor(() => expect(result.current.activeId).toBe("a"));
    expect(result.current.conversations).toHaveLength(2);
  });

  it("创建会话后写入仓库并选中新会话", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper: MemoryRouter });
    await waitFor(() => expect(repoMock.listConversations).toHaveBeenCalled());
    repoMock.listConversations.mockResolvedValue([conv("new-1", "New Chat")]);
    let created: { conv: Conversation } | undefined;
    await act(async () => {
      created = await result.current.createConversation("gpt-4o");
    });
    expect(repoMock.createConversation).toHaveBeenCalledOnce();
    expect(created!.conv.modelId).toBe("gpt-4o");
    expect(created!.conv.title).toBe("New Chat");
    await waitFor(() => expect(result.current.activeId).toBe(created!.conv.id));
  });

  it("删除当前会话后改选剩余列表首项", async () => {
    repoMock.listConversations.mockResolvedValue([conv("a"), conv("b")]);
    const { result } = renderHook(() => useConversations(), { wrapper: MemoryRouter });
    await waitFor(() => expect(result.current.activeId).toBe("a"));

    repoMock.listConversations.mockResolvedValue([conv("b")]);
    await act(async () => {
      await result.current.deleteConversation("a");
    });
    expect(mockSendMessage).toHaveBeenCalledWith({}, "serviceWorker/agent/conversation", {
      action: "delete",
      conversationId: "a",
      generation: "gen-a",
    });
    await waitFor(() => expect(result.current.activeId).toBe("b"));
  });

  it("重命名会话写回新标题", async () => {
    repoMock.listConversations.mockResolvedValue([conv("a", "old")]);
    const { result } = renderHook(() => useConversations(), { wrapper: MemoryRouter });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    await act(async () => {
      await result.current.renameConversation("a", "new-title");
    });
    const saved = repoMock.saveConversation.mock.calls.at(-1)![0] as Conversation;
    expect(saved.title).toBe("new-title");
  });
});

describe("消息持久化操作", () => {
  it("deleteMessages 应通过 Service Worker 串行删除指定消息", async () => {
    await deleteMessages("c", ["m2"]);
    expect(mockSendMessage).toHaveBeenCalledWith({}, "serviceWorker/agent/conversation", {
      action: "deleteMessages",
      conversationId: "c",
      messageIds: ["m2"],
    });
  });

  it("deleteMessages 在重新生成时应保留即将转移所有权的附件", async () => {
    await deleteMessages("c", ["m2"], ["keep.png"]);
    expect(mockSendMessage).toHaveBeenCalledWith({}, "serviceWorker/agent/conversation", {
      action: "deleteMessages",
      conversationId: "c",
      messageIds: ["m2"],
      preserveAttachmentIds: ["keep.png"],
    });
  });

  it("clearMessages 应通过 Service Worker 串行清空消息与任务", async () => {
    await clearMessages("c");
    expect(mockSendMessage).toHaveBeenCalledWith({}, "serviceWorker/agent/conversation", {
      action: "clearMessages",
      conversationId: "c",
    });
  });
});
