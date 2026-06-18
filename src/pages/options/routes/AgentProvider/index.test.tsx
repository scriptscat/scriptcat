import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { agentClient } from "@App/pages/store/features/script";

let mobile = false;
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => mobile }));

vi.mock("@App/pages/store/features/script", () => ({
  agentClient: {
    listModels: vi.fn(async () => [
      { id: "1", name: "GPT-4o", provider: "openai", apiBaseUrl: "", apiKey: "sk-x", model: "gpt-4o" },
    ]),
    getDefaultModelId: vi.fn(async () => "1"),
    saveModel: vi.fn(async () => {}),
    removeModel: vi.fn(async () => {}),
    setDefaultModelId: vi.fn(async () => {}),
  },
}));

import AgentProvider from "./index";

beforeEach(() => {
  mobile = false;
  initLanguage("zh-CN");
});
afterEach(() => cleanup());

describe("AgentProvider 页面", () => {
  it("挂载后展示已配置模型", async () => {
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByText("GPT-4o")).toBeInTheDocument());
  });

  it("无模型时展示空状态", async () => {
    (agentClient.listModels as any).mockResolvedValueOnce([]);
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByText(t("agent:model_no_models"))).toBeInTheDocument());
  });

  it("桌面展示统一计数条（CountBar）", async () => {
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByText("GPT-4o")).toBeInTheDocument());
    expect(screen.getByTestId("count-bar")).toBeInTheDocument();
  });

  it("桌面页头渲染标准文档按钮", async () => {
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByTestId("page-header-docs")).toBeInTheDocument());
  });

  it("移动端不渲染 64px 页头(复用全局 MobileHeader),仅在正文补「页名 + 新增」上下文行", async () => {
    mobile = true;
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByTestId("model-add")).toBeInTheDocument());
    // 正文上下文行存在
    expect(screen.getByTestId("mobile-actions")).toBeInTheDocument();
    // 不渲染共享页头的文档按钮(即未渲染 64px AgentPageHeader),避免与全局栏双层
    expect(screen.queryByTestId("page-header-docs")).toBeNull();
  });
});
