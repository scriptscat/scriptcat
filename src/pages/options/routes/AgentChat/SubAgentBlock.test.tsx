import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { SubAgentState } from "./types";
import SubAgentBlock from "./SubAgentBlock";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

const state = (over?: Partial<SubAgentState>): SubAgentState => ({
  agentId: "sa1",
  description: "搜索资料",
  completedMessages: [],
  currentContent: "",
  currentThinking: "",
  currentToolCalls: [],
  isRunning: false,
  ...over,
});

describe("子代理块 SubAgentBlock", () => {
  it("展示子代理描述", () => {
    render(<SubAgentBlock state={state()} />);
    expect(screen.getByText("搜索资料")).toBeInTheDocument();
  });

  it("依据 isRunning 标注运行/完成状态", () => {
    const { rerender } = render(<SubAgentBlock state={state({ isRunning: true })} />);
    expect(screen.getByTestId("subagent-status").dataset.running).toBe("true");
    rerender(<SubAgentBlock state={state({ isRunning: false })} />);
    expect(screen.getByTestId("subagent-status").dataset.running).toBe("false");
  });

  it("默认折叠，展开后显示子代理消息内容", () => {
    const s = state({ completedMessages: [{ content: "找到结果了", toolCalls: [] }] });
    render(<SubAgentBlock state={s} />);
    expect(screen.queryByText("找到结果了")).toBeNull();
    fireEvent.click(screen.getByTestId("subagent-trigger"));
    expect(screen.getByText("找到结果了")).toBeInTheDocument();
  });
});
