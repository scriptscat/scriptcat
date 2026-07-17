import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";

describe("SegmentedControl 分段选择", () => {
  it("使用 ToggleGroup 单选行为切换值", () => {
    const onValueChange = vi.fn();

    render(
      <SegmentedControl
        aria-label="模式"
        value="a"
        onValueChange={onValueChange}
        options={[
          { value: "a", label: "A", testId: "mode-a" },
          { value: "b", label: "B", testId: "mode-b" },
        ]}
      />
    );

    expect(screen.getByTestId("mode-a")).toHaveAttribute("data-state", "on");
    fireEvent.click(screen.getByTestId("mode-b"));

    expect(onValueChange).toHaveBeenCalledWith("b");
  });
});
