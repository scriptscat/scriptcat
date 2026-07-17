import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { CountBar } from "./CountBar";

afterEach(() => cleanup());

describe("CountBar 计数摘要条", () => {
  it("以 segments 渲染并用分隔符连接", () => {
    render(<CountBar segments={[{ label: "4 个服务" }, { label: "2 个已连接" }, { label: "38 个工具可用" }]} />);
    const bar = screen.getByTestId("count-bar");
    expect(bar).toHaveTextContent("4 个服务");
    expect(bar).toHaveTextContent("2 个已连接");
    expect(bar).toHaveTextContent("38 个工具可用");
    // 分隔符 · 出现在相邻段之间（3 段 → 2 个分隔符）
    expect(bar.querySelectorAll("[data-testid='count-bar-sep']")).toHaveLength(2);
  });

  it("单段时不渲染分隔符", () => {
    render(<CountBar segments={[{ label: "已配置 4 个模型" }]} />);
    const bar = screen.getByTestId("count-bar");
    expect(bar).toHaveTextContent("已配置 4 个模型");
    expect(bar.querySelectorAll("[data-testid='count-bar-sep']")).toHaveLength(0);
  });

  it("支持给单个段着语义色", () => {
    render(<CountBar segments={[{ label: "4 个任务" }, { label: "3 个已启用", tone: "success" }]} />);
    const enabled = screen.getByText("3 个已启用");
    expect(enabled.className).toContain("text-success-fg");
  });

  it("接受自定义 children 覆盖默认渲染", () => {
    render(
      <CountBar>
        <span>{"自定义内容"}</span>
      </CountBar>
    );
    expect(screen.getByText("自定义内容")).toBeInTheDocument();
    // children 模式下不应渲染 segments 容器
    expect(screen.queryByTestId("count-bar-sep")).toBeNull();
  });
});
