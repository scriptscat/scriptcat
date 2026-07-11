import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Surface } from "./surface";

afterEach(cleanup);

describe("Surface 基础承载面", () => {
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
