import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { ToolCall } from "@App/app/service/agent/core/types";
import ToolCallBlock from "./ToolCallBlock";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

const tc = (overrides?: Partial<ToolCall>): ToolCall => ({
  id: "t1",
  name: "web_search",
  arguments: '{"query":"天气"}',
  status: "completed",
  ...overrides,
});

describe("工具调用块 ToolCallBlock", () => {
  it("始终展示工具名称", () => {
    render(<ToolCallBlock toolCall={tc()} />);
    expect(screen.getByText("web_search")).toBeInTheDocument();
  });

  it("默认折叠，不展示参数", () => {
    render(<ToolCallBlock toolCall={tc()} />);
    expect(screen.queryByText(/"query":"天气"/)).toBeNull();
  });

  it("点击后展开展示参数与结果", () => {
    render(<ToolCallBlock toolCall={tc({ result: "晴 25°C" })} />);
    fireEvent.click(screen.getByTestId("toolcall-trigger"));
    expect(screen.getByText(/"query":"天气"/)).toBeInTheDocument();
    expect(screen.getByText("晴 25°C")).toBeInTheDocument();
  });

  it("展开后参数与结果各有带标题的卡片", () => {
    render(<ToolCallBlock toolCall={tc({ result: "晴 25°C" })} />);
    fireEvent.click(screen.getByTestId("toolcall-trigger"));
    // 参数卡片标题为「参数」，而非误标的「工具调用」
    expect(screen.getByText("参数")).toBeInTheDocument();
    expect(screen.queryByText("工具调用")).toBeNull();
    // 结果卡片有独立的「结果」标题
    expect(screen.getByText("结果")).toBeInTheDocument();
  });

  it("依据 status 标注状态", () => {
    const { rerender } = render(<ToolCallBlock toolCall={tc({ status: "error" })} />);
    expect(screen.getByTestId("toolcall-status").dataset.status).toBe("error");
    rerender(<ToolCallBlock toolCall={tc({ status: "running" })} />);
    expect(screen.getByTestId("toolcall-status").dataset.status).toBe("running");
  });
});
