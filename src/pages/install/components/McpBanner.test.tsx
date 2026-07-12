import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { McpBanner } from "./McpBanner";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("McpBanner MCP 请求安装横幅", () => {
  it("渲染请求方名称", () => {
    render(<McpBanner requestingClientName="Test Client" contentHash="abcdef1234567890" source="raw code" />);
    expect(screen.getByTestId("mcp-install-banner")).toHaveTextContent("Test Client");
  });

  it("长哈希被截断显示，完整值保留在 title 属性中", () => {
    const hash = "a".repeat(64);
    render(<McpBanner requestingClientName="Test Client" contentHash={hash} source="raw code" />);
    const hashEl = screen.getByTestId("mcp-install-banner-hash");
    expect(hashEl).toHaveAttribute("title", hash);
    expect(hashEl.textContent).not.toContain(hash);
  });

  it("短哈希不被截断", () => {
    render(<McpBanner requestingClientName="Test Client" contentHash="short" source="raw code" />);
    expect(screen.getByTestId("mcp-install-banner-hash")).toHaveTextContent("short");
  });

  it("提示注入探测：请求方名称原样渲染为文本，不作为 HTML 解析", () => {
    const injected = '<img src=x onerror="alert(1)">Evil';
    render(<McpBanner requestingClientName={injected} contentHash="hash" source="raw code" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("mcp-install-banner")).toHaveTextContent(injected);
  });
});
