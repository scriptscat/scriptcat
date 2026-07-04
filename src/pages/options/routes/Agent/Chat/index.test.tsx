import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { Conversation } from "@App/app/service/agent/core/types";

// index 是组合外壳：mock 重型子组件与数据 hooks，仅验证布局/折叠/移动端视图切换。
const state = vi.hoisted(() => ({
  isMobile: false,
  conversations: [] as Conversation[],
  activeId: "",
}));

vi.mock("./ChatArea", () => ({ default: () => <div data-testid="chat-area" /> }));
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => state.isMobile }));
vi.mock("@App/pages/store/features/script", () => ({
  agentClient: {
    listModels: vi.fn(() =>
      Promise.resolve([
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", apiBaseUrl: "", apiKey: "", model: "gpt-4o" },
      ])
    ),
    getDefaultModelId: vi.fn(() => Promise.resolve("gpt-4o")),
  },
}));
vi.mock("./hooks", () => ({
  useConversations: () => ({
    conversations: state.conversations,
    activeId: state.activeId,
    setActiveId: (id: string) => {
      state.activeId = id;
    },
    createConversation: vi.fn(() => Promise.resolve({ conv: { id: "new-1" } })),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
    loadConversations: vi.fn(),
  }),
  useSkills: () => ({ skills: [] }),
  useRunningConversations: () => ({ runningIds: new Set() }),
}));

import AgentChat from "./index";

const conv = (id: string, title: string): Conversation => ({
  id,
  title,
  modelId: "gpt-4o",
  createtime: 1,
  updatetime: 1,
});

beforeEach(() => {
  initLanguage("zh-CN");
  state.isMobile = false;
  state.conversations = [];
  state.activeId = "";
});
afterEach(() => cleanup());

describe("Agent 会话页 AgentChat 桌面外壳", () => {
  it("同时渲染会话列表与聊天主区域", async () => {
    render(<AgentChat />);
    await waitFor(() => expect(screen.getByTestId("chat-area")).toBeInTheDocument());
    expect(screen.getByTestId("conv-new")).toBeInTheDocument();
  });

  it("点击折叠按钮可隐藏会话列表，再次点击恢复", async () => {
    render(<AgentChat />);
    await waitFor(() => expect(screen.getByTestId("conv-new")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("sidebar-collapse"));
    expect(screen.queryByTestId("conv-new")).toBeNull();

    fireEvent.click(screen.getByTestId("sidebar-collapse"));
    expect(screen.getByTestId("conv-new")).toBeInTheDocument();
  });

  it("有活动会话时头部展示模型胶囊(显示当前模型名)", async () => {
    state.conversations = [conv("a", "会话A")];
    state.activeId = "a";
    render(<AgentChat />);
    const pill = await screen.findByTestId("chat-model-pill");
    expect(pill.textContent).toContain("GPT-4o");
  });

  it("有活动会话时头部展示操作组(导出/新建)", async () => {
    state.conversations = [conv("a", "会话A")];
    state.activeId = "a";
    render(<AgentChat />);
    await waitFor(() => expect(screen.getByTestId("header-export")).toBeInTheDocument());
    expect(screen.getByTestId("header-new")).toBeInTheDocument();
  });
});

describe("Agent 会话页 AgentChat 移动端外壳", () => {
  beforeEach(() => {
    state.isMobile = true;
    state.conversations = [conv("a", "会话A"), conv("b", "会话B")];
  });

  it("默认只展示会话列表，不展示聊天主区域", async () => {
    render(<AgentChat />);
    await waitFor(() => expect(screen.getByTestId("conv-new")).toBeInTheDocument());
    expect(screen.queryByTestId("chat-area")).toBeNull();
  });

  it("点击会话进入对话视图（隐藏列表、显示聊天与返回钮）", async () => {
    render(<AgentChat />);
    await waitFor(() => expect(screen.getByTestId("conv-item-b")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("conv-item-b"));
    expect(screen.getByTestId("chat-area")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-back")).toBeInTheDocument();
    expect(screen.queryByTestId("conv-new")).toBeNull();
  });

  it("对话视图点返回回到列表", async () => {
    render(<AgentChat />);
    await waitFor(() => expect(screen.getByTestId("conv-item-a")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("conv-item-a"));

    fireEvent.click(screen.getByTestId("mobile-back"));
    expect(screen.getByTestId("conv-new")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-area")).toBeNull();
  });
});
