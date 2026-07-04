import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { agentClient } from "@App/pages/store/features/script";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

// DOM 测试环境默认未实现 matchMedia,useIsMobile 依赖它——固定返回 desktop
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));

vi.mock("@App/pages/store/features/script", () => ({
  agentClient: {
    mcpApi: vi.fn(async (req: { action: string }) => {
      switch (req.action) {
        case "listServers":
          return [{ id: "s1", name: "本地工具", url: "http://x/mcp", enabled: true, createtime: 0, updatetime: 0 }];
        case "listTools":
        case "listResources":
        case "listPrompts":
          return [];
        case "testConnection":
          return { tools: 0, resources: 0, prompts: 0 };
        default:
          return undefined;
      }
    }),
  },
}));

import AgentMcp from "./index";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.mocked(useIsMobile).mockReturnValue(false);
});
afterEach(() => cleanup());

describe("AgentMcp 页面", () => {
  it("挂载后展示已配置的服务器", async () => {
    render(<AgentMcp />);
    await waitFor(() => expect(screen.getByText("本地工具")).toBeInTheDocument());
  });

  it("无服务器时展示空状态", async () => {
    (agentClient.mcpApi as any).mockResolvedValueOnce([]);
    render(<AgentMcp />);
    await waitFor(() => expect(screen.getByText(t("agent:mcp_no_servers"))).toBeInTheDocument());
  });

  it("桌面页头通过 docHref 渲染统一文档按钮", async () => {
    render(<AgentMcp />);
    await waitFor(() => expect(screen.getByText("本地工具")).toBeInTheDocument());
    const docs = screen.getByTestId("page-header-docs");
    expect(docs.getAttribute("href")).toContain("/docs/dev/agent/agent-mcp");
  });

  it("计数摘要使用共享 CountBar(三段:服务/已连接/工具)", async () => {
    render(<AgentMcp />);
    await waitFor(() => expect(screen.getByText("本地工具")).toBeInTheDocument());
    const bar = screen.getByTestId("count-bar");
    expect(bar).toBeInTheDocument();
    // 三段以两个分隔符相连
    expect(screen.getAllByTestId("count-bar-sep")).toHaveLength(2);
  });

  it("移动端展示页面上下文栏的标题与图标添加按钮,不渲染 64px 桌面页头文档按钮", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<AgentMcp />);
    await waitFor(() => expect(screen.getByText("本地工具")).toBeInTheDocument());
    // 标题存在
    expect(screen.getByTestId("mcp-mobile-title")).toHaveTextContent(t("agent:mcp_title"));
    // 添加按钮可达
    expect(screen.getByTestId("mcp-add")).toBeInTheDocument();
    // 桌面文档按钮在移动端不出现(避免双头部/重复操作)
    expect(screen.queryByTestId("page-header-docs")).not.toBeInTheDocument();
  });
});
