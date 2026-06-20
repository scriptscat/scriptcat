import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { McpCard } from "./McpCard";

beforeAll(() => initTestLanguage("zh-CN"));
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

  it("资源标签为绿色、提示词标签为紫色(对齐设计稿配色)", () => {
    const { container } = render(
      <McpCard
        server={server}
        testState={{ status: "connected", tools: 2, resources: 5, prompts: 3 }}
        onEdit={noop}
        onDelete={noop}
        onTest={noop}
        onToggle={noop}
        onDetail={noop}
      />
    );
    const spans = Array.from(container.querySelectorAll("span"));
    const tools = spans.find((s) => s.textContent === "2 工具");
    const resources = spans.find((s) => s.textContent === "5 资源");
    const prompts = spans.find((s) => s.textContent === "3 提示词");
    expect(tools?.className).toContain("text-primary");
    expect(resources?.className).toContain("text-success-fg");
    expect(prompts?.className).toContain("text-skill-fg");
  });

  it("count 为 0 的能力标签不展示", () => {
    const { container } = render(
      <McpCard
        server={server}
        testState={{ status: "connected", tools: 2, resources: 0, prompts: 0 }}
        onEdit={noop}
        onDelete={noop}
        onTest={noop}
        onToggle={noop}
        onDetail={noop}
      />
    );
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.some((s) => s.textContent === "2 工具")).toBe(true);
    expect(spans.some((s) => /资源$/.test(s.textContent || ""))).toBe(false);
    expect(spans.some((s) => /提示词$/.test(s.textContent || ""))).toBe(false);
  });

  it("配置密钥与请求头时展示对应的灰色标签", () => {
    const withMeta = { ...server, apiKey: "sk-x", headers: { "X-A": "1", "X-B": "2" } };
    const { container } = render(
      <McpCard server={withMeta} onEdit={noop} onDelete={noop} onTest={noop} onToggle={noop} onDetail={noop} />
    );
    // CapabilityTag 以 text-[11px] 标识;未测试态 StatusDot 为 text-xs,不会混入
    const caps = Array.from(container.querySelectorAll("span")).filter((s) => s.className.includes("text-[11px]"));
    expect(caps.length).toBe(2); // 密钥 + 请求头
    caps.forEach((c) => expect(c.className).toContain("bg-muted"));
  });

  it("禁用时整卡降透明度", () => {
    const { container } = render(
      <McpCard
        server={{ ...server, enabled: false }}
        onEdit={noop}
        onDelete={noop}
        onTest={noop}
        onToggle={noop}
        onDetail={noop}
      />
    );
    expect(container.firstElementChild?.className).toContain("opacity-60");
  });
});
