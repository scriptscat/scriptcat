import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { McpFormDialog, parseHeaders, stringifyHeaders } from "./McpFormDialog";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

describe("parseHeaders 解析自定义请求头", () => {
  it("按行解析 Key: value，忽略空行", () => {
    expect(parseHeaders("Authorization: Bearer x\n\nX-Trace:  abc ")).toEqual({
      Authorization: "Bearer x",
      "X-Trace": "abc",
    });
  });
  it("含多个冒号时只按首个冒号切分", () => {
    expect(parseHeaders("X-Url: https://a.com/b")).toEqual({ "X-Url": "https://a.com/b" });
  });
  it("stringifyHeaders 还原为多行文本", () => {
    expect(stringifyHeaders({ A: "1", B: "2" })).toBe("A: 1\nB: 2");
  });
});

describe("McpFormDialog MCP 表单弹窗", () => {
  it("填写名称与 URL 后保存，回调带解析后的请求头", () => {
    const onSubmit = vi.fn();
    render(<McpFormDialog open value={null} onOpenChange={() => {}} onSubmit={onSubmit} onTest={vi.fn()} />);
    fireEvent.change(screen.getByTestId("mcp-name"), { target: { value: "远程工具" } });
    fireEvent.change(screen.getByTestId("mcp-url"), { target: { value: "https://x/mcp" } });
    fireEvent.change(screen.getByTestId("mcp-headers"), { target: { value: "X-Key: v" } });
    fireEvent.click(screen.getByTestId("mcp-submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "远程工具", url: "https://x/mcp", headers: { "X-Key": "v" } })
    );
  });

  it("点击测试连接调用 onTest", () => {
    const onTest = vi.fn();
    render(<McpFormDialog open value={null} onOpenChange={() => {}} onSubmit={vi.fn()} onTest={onTest} />);
    fireEvent.change(screen.getByTestId("mcp-name"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("mcp-url"), { target: { value: "https://x" } });
    fireEvent.click(screen.getByTestId("mcp-test"));
    expect(onTest).toHaveBeenCalled();
  });
});
