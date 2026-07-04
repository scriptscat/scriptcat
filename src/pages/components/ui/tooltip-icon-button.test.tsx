import { render, screen } from "@testing-library/react";
import { Copy } from "lucide-react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "./tooltip";
import { TooltipIconButton } from "./tooltip-icon-button";

describe("TooltipIconButton 带提示图标按钮", () => {
  it("强制使用 label 作为可访问名称", () => {
    render(
      <TooltipProvider>
        <TooltipIconButton label="复制" icon={Copy} />
      </TooltipProvider>
    );

    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("危险态复用 ghost 按钮并添加危险悬停色", () => {
    render(
      <TooltipProvider>
        <TooltipIconButton label="删除" icon={Copy} destructive />
      </TooltipProvider>
    );

    expect(screen.getByRole("button", { name: "删除" })).toHaveClass("hover:text-destructive");
  });
});
