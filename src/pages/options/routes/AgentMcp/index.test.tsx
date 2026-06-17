import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { agentClient } from "@App/pages/store/features/script";

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

beforeEach(() => initLanguage("zh-CN"));
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
});
