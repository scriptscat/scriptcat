import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DropOverlay } from "./DropOverlay";

describe("DropOverlay", () => {
  it("active=false 时不渲染", () => {
    const { container } = render(<DropOverlay active={false} />);
    expect(container.firstChild).toBeNull();
  });
  it("active=true 时显示提示文案", () => {
    render(<DropOverlay active />);
    expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();
  });
});
