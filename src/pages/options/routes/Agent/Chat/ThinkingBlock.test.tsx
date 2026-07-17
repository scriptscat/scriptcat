import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import ThinkingBlock from "./ThinkingBlock";

vi.mock("./MarkdownRenderer", () => import("@Tests/mocks/MarkdownRenderer.tsx"));

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

describe("思考过程块 ThinkingBlock", () => {
  it("内容为空时不渲染任何内容", () => {
    const { container } = render(<ThinkingBlock content="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("默认折叠，不展示思考正文", () => {
    render(<ThinkingBlock content="隐藏的推理过程" />);
    expect(screen.queryByText("隐藏的推理过程")).toBeNull();
  });

  it("点击触发器后展开并展示思考正文", () => {
    render(<ThinkingBlock content="隐藏的推理过程" />);
    fireEvent.click(screen.getByTestId("thinking-trigger"));
    expect(screen.getByText("隐藏的推理过程")).toBeInTheDocument();
  });
});
