import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingState } from "./loading-state";

afterEach(cleanup);

describe("基础加载状态组件", () => {
  it("渲染状态文本和忙碌图标", () => {
    render(<LoadingState label="加载中" />);

    expect(document.querySelector('[role="status"]')).toHaveAttribute("aria-label", "加载中");
    expect(screen.getByText("加载中")).toBeInTheDocument();
  });

  it("可隐藏可见文本仅保留可访问名称", () => {
    render(<LoadingState label="加载中" showLabel={false} />);

    expect(document.querySelector('[role="status"][aria-label="加载中"]')).toBeInTheDocument();
    expect(screen.queryByText("加载中")).not.toBeInTheDocument();
  });
});
