import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  it("应当通过 Portal 将提示内容渲染到滚动容器之外，避免被 sticky 表头遮挡", () => {
    const { getByTestId } = render(
      <TooltipProvider>
        <div data-testid="scroll-container" style={{ overflow: "auto" }}>
          <Tooltip open>
            <TooltipTrigger>编辑按钮</TooltipTrigger>
            <TooltipContent data-testid="tooltip-content">编辑</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );

    const scrollContainer = getByTestId("scroll-container");
    const content = getByTestId("tooltip-content");

    // 提示内容必须被 Portal 挂到滚动容器之外（body 层）。
    // 否则它会留在 overflow 滚动容器内，被 sticky 表头（z-10、不透明背景）遮挡。
    expect(scrollContainer.contains(content)).toBe(false);
  });
});
