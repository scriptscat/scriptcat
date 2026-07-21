import { cleanup, render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

afterEach(cleanup);

describe("基础空状态组件", () => {
  it("非紧凑模式渲染大图标、加粗标题与说明", () => {
    render(<EmptyState icon={Inbox} title="暂无数据" description="稍后再试" data-testid="empty" />);

    const root = screen.getByTestId("empty");
    expect(root).toHaveClass("gap-3");
    expect(root.querySelector("svg")).toHaveClass("size-10");
    expect(screen.getByText("暂无数据")).toHaveClass("font-medium");
    expect(screen.getByText("稍后再试")).toBeInTheDocument();
  });

  it("支持紧凑模式只展示标题", () => {
    render(<EmptyState title="暂无脚本" compact data-testid="empty" />);

    const root = screen.getByTestId("empty");
    expect(root).toHaveClass("gap-2");
    expect(screen.getByText("暂无脚本")).toHaveClass("text-sm");
  });
});
