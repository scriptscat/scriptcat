import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "./progress";

afterEach(cleanup);

describe("基础进度条组件", () => {
  it("确定进度按 value/max 计算宽度并暴露 aria 数值", () => {
    render(<Progress aria-label="下载进度" value={25} max={50} />);

    const progress = screen.getByLabelText("下载进度");
    expect(progress).toHaveAttribute("role", "progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "25");
    expect(progress).toHaveAttribute("aria-valuemax", "50");
    expect(screen.getByTestId("progress-indicator")).toHaveStyle({ width: "50%" });
  });

  it("确定进度会限制到合法范围", () => {
    render(<Progress aria-label="下载进度" value={150} />);

    expect(document.querySelector('[role="progressbar"]')).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByTestId("progress-indicator")).toHaveStyle({ width: "100%" });
  });

  it("不确定进度不暴露 aria 数值并使用共享动画", () => {
    render(<Progress aria-label="检查中" indeterminate />);

    const progress = screen.getByLabelText("检查中");
    expect(progress).toHaveAttribute("role", "progressbar");
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByTestId("progress-indicator")).toHaveClass("animate-indeterminate-bar");
  });

  it("顶部变体使用统一的细条样式", () => {
    render(<Progress aria-label="导入中" variant="top" value={1} max={4} />);

    expect(document.querySelector('[role="progressbar"]')).toHaveClass("h-0.5", "bg-primary/15");
    expect(screen.getByTestId("progress-indicator")).toHaveStyle({ width: "25%" });
  });
});
