import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { McpCard } from "./McpCard";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

const server = {
  id: "s1",
  name: "本地工具",
  url: "http://localhost:8080/mcp",
  enabled: true,
  createtime: 0,
  updatetime: 0,
} as any;

function noop() {}

describe("McpCard MCP 服务器卡片", () => {
  it("展示名称与 URL", () => {
    render(<McpCard server={server} onEdit={noop} onDelete={noop} onTest={noop} onToggle={noop} onDetail={noop} />);
    expect(screen.getByText("本地工具")).toBeInTheDocument();
    expect(screen.getByText("http://localhost:8080/mcp")).toBeInTheDocument();
  });

  it("点击开关触发 onToggle", () => {
    const onToggle = vi.fn();
    render(<McpCard server={server} onEdit={noop} onDelete={noop} onTest={noop} onToggle={onToggle} onDetail={noop} />);
    fireEvent.click(screen.getByTestId("mcp-toggle"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("菜单删除触发 onDelete", () => {
    const onDelete = vi.fn();
    render(<McpCard server={server} onEdit={noop} onDelete={onDelete} onTest={noop} onToggle={noop} onDetail={noop} />);
    fireEvent.pointerDown(screen.getByTestId("card-menu"), { button: 0 });
    fireEvent.click(screen.getByTestId("card-menu-delete"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("已连接时展示状态与计数标签", () => {
    render(
      <McpCard
        server={server}
        testState={{ status: "connected", tools: 3, resources: 1, prompts: 0 }}
        onEdit={noop}
        onDelete={noop}
        onTest={noop}
        onToggle={noop}
        onDetail={noop}
      />
    );
    expect(screen.getByText("已连接")).toBeInTheDocument();
  });
});
