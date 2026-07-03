import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { DropOverlay } from "./DropOverlay";

describe("DropOverlay", () => {
  beforeEach(() => {
    initLanguage("zh-CN");
  });

  it("active=false 时不渲染", () => {
    const { container } = render(<DropOverlay active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("active=true 时显示提示文案与类型标签", () => {
    render(<DropOverlay active />);
    expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();
    expect(screen.getByText("拖拽脚本或 Skill 到此处安装")).toBeInTheDocument();
    expect(screen.getByText(".zip")).toBeInTheDocument();
  });
});
