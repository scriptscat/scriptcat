import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button 主操作按钮", () => {
  it("默认变体应使用专用主色背景令牌", () => {
    render(<Button>{"保存"}</Button>);

    expect(screen.getByRole("button", { name: "保存" })).toHaveClass(
      "bg-primary-background",
      "text-primary-foreground"
    );
  });
});
