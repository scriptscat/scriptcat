import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { ChatMessage, AgentModelConfig, MessageContent } from "@App/app/service/agent/core/types";

// 通过模块级状态控制被 mock 的 hooks 返回值，从而单独验证 ChatArea 的组合渲染逻辑。
const hookState = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  isStreaming: false,
  tasks: [] as unknown[],
  askUserPending: null as unknown,
}));

const repoMock = vi.hoisted(() => ({
  saveAttachment: vi.fn().mockResolvedValue(1),
  deleteAttachment: vi.fn().mockResolvedValue(undefined),
  getAttachment: vi.fn().mockResolvedValue(null),
  getMessages: vi.fn().mockResolvedValue([]),
  saveTasks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@App/app/repo/agent_chat", () => ({ agentChatRepo: repoMock }));

vi.mock("./hooks", () => ({
  useMessages: () => ({
    messages: hookState.messages,
    setMessages: (update: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[])) => {
      hookState.messages = typeof update === "function" ? update(hookState.messages) : update;
    },
    loadMessages: vi.fn(),
  }),
  useStreamingChat: () => ({
    isStreaming: hookState.isStreaming,
    setIsStreaming: vi.fn(),
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    askUserPending: hookState.askUserPending,
    respondToAskUser: vi.fn(),
    attachToConversation: vi.fn(),
  }),
  useConversationTasks: () => ({
    tasks: hookState.tasks,
    setTasks: vi.fn(),
    handleTaskUpdate: vi.fn(),
    loadTasks: vi.fn(),
  }),
  deleteMessages: vi.fn(() => Promise.resolve()),
  clearMessages: vi.fn(() => Promise.resolve()),
}));

vi.mock("./ChatInput", () => ({
  default: ({ onSend }: { onSend: (content: MessageContent, files?: Map<string, File>) => Promise<void> }) => (
    <button
      type="button"
      data-testid="queue-file"
      onClick={() => {
        const file = new File(["image"], "queued.png", { type: "image/png" });
        void onSend(
          [
            { type: "text", text: "queued upload" },
            { type: "image", attachmentId: "queued.png", mimeType: "image/png", name: "queued.png" },
          ],
          new Map([["queued.png", file]])
        );
      }}
    >
      {"queue file"}
    </button>
  ),
}));

vi.mock("./MessageToolbar", () => ({
  default: ({ onDelete }: { onDelete: () => void }) => (
    <button type="button" data-testid="toolbar-delete-direct" onClick={onDelete}>
      {"delete round"}
    </button>
  ),
}));

import ChatArea from "./ChatArea";

const model: AgentModelConfig = {
  id: "gpt-4o",
  name: "gpt-4o",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4o",
};

const baseProps = {
  conversationId: "c1",
  models: [model],
  modelsLoaded: true,
  selectedModelId: "gpt-4o",
  onModelChange: vi.fn(),
};

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  hookState.messages = [];
  hookState.isStreaming = false;
  hookState.tasks = [];
  hookState.askUserPending = null;
});
afterEach(() => cleanup());

const msg = (over: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">): ChatMessage => ({
  id: Math.random().toString(36).slice(2),
  conversationId: "c1",
  createtime: 1,
  ...over,
});

describe("聊天主区域 ChatArea", () => {
  it("无会话时展示欢迎界面", () => {
    render(<ChatArea {...baseProps} conversationId="" />);
    expect(screen.getByTestId("welcome-screen")).toBeInTheDocument();
  });

  it("有消息时渲染用户与助手消息组", () => {
    hookState.messages = [msg({ role: "user", content: "问题" }), msg({ role: "assistant", content: "答案" })];
    render(<ChatArea {...baseProps} />);
    expect(screen.getByText("问题")).toBeInTheDocument();
    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-screen")).toBeNull();
  });

  it("模型已加载但无可用模型时展示提示", () => {
    render(<ChatArea {...baseProps} models={[]} />);
    expect(screen.getByTestId("no-model-hint")).toBeInTheDocument();
  });

  it("取消排队消息时应删除尚未被持久化消息接管的附件", async () => {
    hookState.isStreaming = true;
    render(<ChatArea {...baseProps} />);

    fireEvent.click(screen.getByTestId("queue-file"));
    await waitFor(() => expect(repoMock.saveAttachment).toHaveBeenCalledWith("queued.png", expect.any(File)));
    fireEvent.click(await screen.findByTestId("cancel-pending-message"));

    await waitFor(() => expect(repoMock.deleteAttachment).toHaveBeenCalledWith("queued.png"));
  });

  it("切换会话时应删除上个会话尚未提交的排队附件", async () => {
    hookState.isStreaming = true;
    const { rerender } = render(<ChatArea {...baseProps} />);
    fireEvent.click(screen.getByTestId("queue-file"));
    await waitFor(() => expect(repoMock.saveAttachment).toHaveBeenCalledWith("queued.png", expect.any(File)));

    rerender(<ChatArea {...baseProps} conversationId="c2" />);

    await waitFor(() => expect(repoMock.deleteAttachment).toHaveBeenCalledWith("queued.png"));
  });

  it("排队结束后的历史读取失败时应回收尚未交接的附件", async () => {
    hookState.isStreaming = true;
    repoMock.getMessages.mockRejectedValueOnce(new Error("read failed"));
    const { rerender } = render(<ChatArea {...baseProps} />);
    fireEvent.click(screen.getByTestId("queue-file"));
    await waitFor(() => expect(repoMock.saveAttachment).toHaveBeenCalledWith("queued.png", expect.any(File)));

    hookState.isStreaming = false;
    rerender(<ChatArea {...baseProps} />);

    await waitFor(() => expect(repoMock.deleteAttachment).toHaveBeenCalledWith("queued.png"));
  });

  it("删除消息轮次时应同时清空已失去历史依据的会话任务", async () => {
    hookState.messages = [msg({ role: "user", content: "问题" }), msg({ role: "assistant", content: "答案" })];
    render(<ChatArea {...baseProps} />);

    fireEvent.click(screen.getByTestId("toolbar-delete-direct"));

    await waitFor(() => expect(repoMock.saveTasks).toHaveBeenCalledWith("c1", []));
  });

  it("新的 ask_user 请求应重置上一个请求的已提交状态", () => {
    hookState.askUserPending = { id: "question-1", question: "旧问题", options: ["旧答案"] };
    const { rerender } = render(<ChatArea {...baseProps} />);

    fireEvent.click(screen.getByTestId("ask-option-旧答案"));
    expect(screen.queryByTestId("ask-input")).toBeNull();

    hookState.askUserPending = { id: "question-2", question: "新问题" };
    rerender(<ChatArea {...baseProps} />);

    expect(screen.getByText("新问题")).toBeInTheDocument();
    expect(screen.getByTestId("ask-input")).toBeInTheDocument();
  });
});
