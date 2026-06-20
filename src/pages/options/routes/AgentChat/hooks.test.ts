import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Conversation, ChatMessage } from "@App/app/service/agent/core/types";

// 会话仓库整体打桩：hooks 只是 repo + 消息总线的薄封装，测试聚焦其状态迁移逻辑。
const repoMock = vi.hoisted(() => ({
  listConversations: vi.fn<() => Promise<Conversation[]>>(() => Promise.resolve([])),
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
vi.mock("@Packages/message/client", () => ({ connect: vi.fn(), sendMessage: vi.fn(() => Promise.resolve([])) }));

import { useConversations, deleteMessages, clearMessages } from "./hooks";

const conv = (id: string, title = "c"): Conversation => ({
  id,
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
    expect(repoMock.saveConversation).toHaveBeenCalledOnce();
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
    expect(repoMock.deleteConversation).toHaveBeenCalledWith("a");
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
  it("deleteMessages 过滤掉指定 id 后回写", async () => {
    const msgs: ChatMessage[] = [
      { id: "m1", conversationId: "c", role: "user", content: "a", createtime: 1 },
      { id: "m2", conversationId: "c", role: "assistant", content: "b", createtime: 2 },
      { id: "m3", conversationId: "c", role: "user", content: "c", createtime: 3 },
    ];
    repoMock.getMessages.mockResolvedValue(msgs);

    await deleteMessages("c", ["m2"]);

    const [convId, saved] = repoMock.saveMessages.mock.calls.at(-1)!;
    expect(convId).toBe("c");
    expect((saved as ChatMessage[]).map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("clearMessages 同时清空消息与任务", async () => {
    await clearMessages("c");
    expect(repoMock.saveMessages).toHaveBeenCalledWith("c", []);
    expect(repoMock.saveTasks).toHaveBeenCalledWith("c", []);
  });
});
