import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { ChatMessage, AgentModelConfig } from "@App/app/service/agent/core/types";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

// 通过模块级状态控制被 mock 的 hooks 返回值，从而单独验证 ChatArea 的组合渲染逻辑。
const hookState = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  isStreaming: false,
  tasks: [] as unknown[],
  askUserPending: null as unknown,
}));

vi.mock("./hooks", () => ({
  useMessages: () => ({ messages: hookState.messages, setMessages: vi.fn(), loadMessages: vi.fn() }),
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
  hookState.messages = [];
  hookState.isStreaming = false;
  hookState.tasks = [];
  hookState.askUserPending = null;
  navigate.mockClear();
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

  it("有可用模型时不展示未配置模型的引导与提示条", () => {
    render(<ChatArea {...baseProps} />);
    expect(screen.getByTestId("welcome-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("no-model-guide")).toBeNull();
    expect(screen.queryByTestId("no-model-hint")).toBeNull();
  });

  describe("模型已加载但无可用模型", () => {
    const noModelProps = { ...baseProps, models: [] };

    it("用引导态替换欢迎界面", () => {
      render(<ChatArea {...noModelProps} />);
      expect(screen.getByTestId("no-model-guide")).toBeInTheDocument();
      expect(screen.queryByTestId("welcome-screen")).toBeNull();
    });

    it("引导态主按钮跳转到模型服务页", () => {
      render(<ChatArea {...noModelProps} />);
      fireEvent.click(screen.getByTestId("no-model-guide-action"));
      expect(navigate).toHaveBeenCalledWith("/agent/provider");
    });

    it("输入区上方的提示条可点击跳转到模型服务页", () => {
      render(<ChatArea {...noModelProps} />);
      expect(screen.getByTestId("no-model-hint")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("no-model-configure"));
      expect(navigate).toHaveBeenCalledWith("/agent/provider");
    });
  });
});
