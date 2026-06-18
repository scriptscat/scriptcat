import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
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

  it("桌面页头渲染标准文档按钮并深链到模型文档页", async () => {
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByTestId("page-header-docs")).toBeInTheDocument());
    const docs = screen.getByTestId("page-header-docs");
    expect(docs.getAttribute("href")).toContain("/docs/dev/agent/agent-model");
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

  it("复制:打开预填表单(新增模式、名称带后缀)且不立即持久化", async () => {
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByText("GPT-4o")).toBeInTheDocument());

    // 打开卡片菜单并点击「复制」(Radix 下拉在 jsdom 需 pointerDown 触发打开)
    fireEvent.pointerDown(screen.getByTestId("card-menu"), { button: 0 });
    fireEvent.click(await screen.findByTestId("card-menu-copy"));

    // 不应立即调用持久化 —— 用户需先在弹窗中审阅/编辑
    expect(agentClient.saveModel).not.toHaveBeenCalled();

    // 弹窗打开后,表单预填源模型字段,名称带后缀
    const nameInput = (await screen.findByTestId("model-name")) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toContain("GPT-4o"));
    expect(nameInput.value).not.toBe("GPT-4o");
    // 弹窗以「新增」模式打开(对话框标题为新增,而非编辑)
    expect(screen.getByRole("dialog")).toHaveTextContent(t("agent:model_add"));
    expect(screen.getByRole("dialog")).not.toHaveTextContent(t("agent:model_edit"));
  });

  it("复制后提交:作为新条目保存(全新 id,不覆盖源模型),携带预填值", async () => {
    render(<AgentProvider />);
    await waitFor(() => expect(screen.getByText("GPT-4o")).toBeInTheDocument());

    fireEvent.pointerDown(screen.getByTestId("card-menu"), { button: 0 });
    fireEvent.click(await screen.findByTestId("card-menu-copy"));
    await screen.findByTestId("model-name");

    // 提交后才落库
    fireEvent.click(screen.getByTestId("model-submit"));
    await waitFor(() => expect(agentClient.saveModel).toHaveBeenCalled());

    const saved = (agentClient.saveModel as any).mock.calls[0][0];
    expect(saved.id).toBeTruthy();
    expect(saved.id).not.toBe("1"); // 全新 id,不覆盖源模型
    expect(saved.name).toContain("GPT-4o");
    expect(saved.model).toBe("gpt-4o");
  });
});
