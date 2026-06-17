import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { ChatMessage } from "@App/app/service/agent/core/types";
import type { SubAgentState } from "./types";
import { UserMessageItem, AssistantMessageGroup } from "./MessageItem";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

const msg = (over: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">): ChatMessage => ({
  id: "m1",
  conversationId: "c1",
  createtime: 1,
  ...over,
});

describe("用户消息 UserMessageItem", () => {
  it("展示用户文本气泡", () => {
    render(<UserMessageItem message={msg({ role: "user", content: "你好世界" })} />);
    expect(screen.getByText("你好世界")).toBeInTheDocument();
  });

  it("编辑后保存触发 onEdit 携带新文本", () => {
    const onEdit = vi.fn();
    render(<UserMessageItem message={msg({ role: "user", content: "原文" })} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("user-edit"));
    const ta = screen.getByTestId("user-edit-textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "改好了" } });
    fireEvent.click(screen.getByTestId("user-edit-save"));
    expect(onEdit).toHaveBeenCalledWith("改好了");
  });

  it("点击重新生成触发 onRegenerate", () => {
    const onRegenerate = vi.fn();
    render(<UserMessageItem message={msg({ role: "user", content: "原文" })} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByTestId("user-regenerate"));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });
});

describe("助手消息组 AssistantMessageGroup", () => {
  const groupProps = {
    streamingId: undefined,
    isStreaming: false,
    onCopy: vi.fn(),
    onRegenerate: vi.fn(),
    onDelete: vi.fn(),
  };

  it("展示助手文本与工具栏", () => {
    render(<AssistantMessageGroup {...groupProps} messages={[msg({ role: "assistant", content: "这是回答" })]} />);
    expect(screen.getByText("这是回答")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-meta")).toBeInTheDocument();
  });

  it("普通工具调用渲染为 ToolCallBlock", () => {
    const m = msg({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "t1", name: "web_search", arguments: "{}", status: "completed" }],
    });
    render(<AssistantMessageGroup {...groupProps} messages={[m]} />);
    expect(screen.getByTestId("toolcall-trigger")).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-trigger")).toBeNull();
  });

  it("agent 工具调用且有匹配子代理时渲染为 SubAgentBlock", () => {
    const m = msg({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "t1",
          name: "agent",
          arguments: '{"to":"sa1"}',
          status: "running",
        },
      ],
    });
    const subAgents = new Map<string, SubAgentState>([
      [
        "sa1",
        {
          agentId: "sa1",
          description: "子任务",
          completedMessages: [],
          currentContent: "",
          currentThinking: "",
          currentToolCalls: [],
          isRunning: true,
        },
      ],
    ]);
    render(<AssistantMessageGroup {...groupProps} messages={[m]} subAgents={subAgents} />);
    expect(screen.getByTestId("subagent-trigger")).toBeInTheDocument();
  });
});
