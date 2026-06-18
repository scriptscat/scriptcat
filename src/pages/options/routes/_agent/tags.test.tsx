// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { StatusDot, CapabilityTag } from "./tags";

afterEach(() => cleanup());

describe("tags 标签", () => {
  it("StatusDot 渲染文本与 success 语义色", () => {
    render(<StatusDot tone="success">已连接</StatusDot>);
    const el = screen.getByText("已连接");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("text-success-fg");
  });
  it("CapabilityTag 渲染文本与 blue 语义色", () => {
    render(<CapabilityTag tone="blue">视觉</CapabilityTag>);
    const el = screen.getByText("视觉");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("text-primary");
  });
});
