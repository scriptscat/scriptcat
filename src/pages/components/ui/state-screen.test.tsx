import { render, screen } from "@testing-library/react";
import { CircleCheck } from "lucide-react";
import { describe, expect, it } from "vitest";
import { StateScreen } from "./state-screen";

describe("StateScreen 状态屏", () => {
  it("渲染状态图标、标题、说明和操作", () => {
    render(
      <StateScreen
        icon={CircleCheck}
        iconClassName="opacity-80"
        tone="success"
        title="处理完成"
        description="已导入 3 项"
        action={<button type="button">{"继续"}</button>}
      />
    );

    expect(document.querySelector('[role="status"]')).toHaveAttribute("aria-label", "处理完成");
    expect(screen.getByText("处理完成")).toBeInTheDocument();
    expect(screen.getByText("已导入 3 项")).toBeInTheDocument();
    expect(screen.getByText("继续").closest("button")).toBeInTheDocument();
    expect(document.querySelector("svg")).toHaveClass("opacity-80");
  });

  it("错误详情使用等宽可滚动区域", () => {
    render(
      <StateScreen
        tone="error"
        title="加载失败"
        detail="Error: failed"
        detailTestId="error-detail"
        detailClassName="w-[440px]"
      />
    );

    const detail = screen.getByTestId("error-detail");
    expect(detail).toHaveClass("font-mono");
    expect(detail).toHaveClass("text-destructive");
    expect(detail).toHaveClass("w-[440px]");
  });
});
