import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Surface } from "./surface";

afterEach(cleanup);

describe("Surface 基础承载面", () => {
  it("默认使用 shadcn Card 的语义槽并提供紧凑卡片样式", () => {
    render(<Surface data-testid="surface">{"内容"}</Surface>);

    const surface = screen.getByTestId("surface");
    expect(surface).toHaveAttribute("data-slot", "surface");
    expect(surface).toHaveClass("bg-card");
    expect(surface).toHaveClass("p-4");
    expect(surface).toHaveTextContent("内容");
  });

  it("支持交互态和禁用态", () => {
    render(
      <Surface interactive disabled data-testid="surface">
        {"内容"}
      </Surface>
    );

    const surface = screen.getByTestId("surface");
    expect(surface).toHaveClass("hover:shadow-md");
    expect(surface).toHaveClass("opacity-60");
  });
});
