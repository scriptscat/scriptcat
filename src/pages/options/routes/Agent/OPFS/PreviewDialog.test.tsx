import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { PreviewDialog } from "./PreviewDialog";

afterEach(() => cleanup());

describe("PreviewDialog 文件预览", () => {
  it("JSON 文本格式化展示", () => {
    render(<PreviewDialog open name="a.json" kind="json" text='{"a":1,"b":2}' onOpenChange={() => {}} />);
    const pre = screen.getByTestId("preview-content");
    expect(pre.textContent).toContain('"a": 1');
  });

  it("非法 JSON 回退为原始文本", () => {
    render(<PreviewDialog open name="a.json" kind="json" text="{not json}" onOpenChange={() => {}} />);
    expect(screen.getByTestId("preview-content").textContent).toBe("{not json}");
  });

  it("图片类型渲染 img", () => {
    render(<PreviewDialog open name="x.png" kind="img" imageUrl="blob:abc" onOpenChange={() => {}} />);
    expect(document.querySelector("img")).toHaveAttribute("src", "blob:abc");
  });
});
