// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));
const mockedUseIsMobile = vi.mocked(useIsMobile);
vi.mock("@App/pages/options/hooks/useScrollSpy", () => ({
  useScrollSpy: () => ({
    activeId: "model",
    register: () => () => {},
    scrollContainerRef: { current: null },
    scrollTo: vi.fn(),
  }),
}));

const { getSearchConfigMock } = vi.hoisted(() => ({ getSearchConfigMock: vi.fn() }));
vi.mock("@App/pages/store/features/script", () => ({
  agentClient: {
    listModels: vi.fn(async () => [
      { id: "m1", name: "GPT-4o", provider: "openai", apiBaseUrl: "", apiKey: "", model: "gpt-4o" },
    ]),
    getSummaryModelId: vi.fn(async () => "m1"),
    getSearchConfig: getSearchConfigMock,
    setSummaryModelId: vi.fn(async () => {}),
    saveSearchConfig: vi.fn(async () => {}),
  },
}));

import AgentSettings from "./index";
import { agentClient } from "@App/pages/store/features/script";

beforeEach(() => {
  initLanguage("zh-CN");
  getSearchConfigMock.mockResolvedValue({ engine: "bing" });
  mockedUseIsMobile.mockReturnValue(false);
});
afterEach(() => cleanup());

describe("AgentSettings 页面", () => {
  it("挂载后展示当前搜索引擎提示", async () => {
    render(<AgentSettings />);
    await waitFor(() => expect(screen.getByText(t("agent:search_engine_tip_bing"))).toBeInTheDocument());
  });

  it("当前分类导航项使用 primary-light 高亮(对照设计稿激活态)", async () => {
    render(<AgentSettings />);
    const activeNav = await screen.findByTestId("settings-nav-model");
    expect(activeNav.dataset.active).toBe("true");
    expect(activeNav.className).toContain("bg-primary-light");
    expect(activeNav.className).toContain("text-primary");
    const inactiveNav = screen.getByTestId("settings-nav-search");
    expect(inactiveNav.dataset.active).toBe("false");
    expect(inactiveNav.className).not.toContain("bg-primary-light");
  });

  it("摘要模型字段标签与说明文案均渲染", async () => {
    render(<AgentSettings />);
    expect(await screen.findByText(t("agent:summary_model"))).toBeInTheDocument();
    expect(screen.getByText(t("agent:summary_model_desc"))).toBeInTheDocument();
  });

  it("google_custom 引擎时显示 Google 字段", async () => {
    getSearchConfigMock.mockResolvedValueOnce({ engine: "google_custom", googleApiKey: "", googleCseId: "" });
    render(<AgentSettings />);
    await waitFor(() => expect(screen.getByTestId("search-google-cse-id")).toBeInTheDocument());
  });

  it("修改 Google CSE ID 触发 saveSearchConfig", async () => {
    getSearchConfigMock.mockResolvedValueOnce({ engine: "google_custom", googleApiKey: "", googleCseId: "" });
    render(<AgentSettings />);
    const input = await screen.findByTestId("search-google-cse-id");
    fireEvent.change(input, { target: { value: "cse123" } });
    expect(agentClient.saveSearchConfig).toHaveBeenCalledWith(expect.objectContaining({ googleCseId: "cse123" }));
  });

  describe("桌面端", () => {
    it("渲染统一 64px 页头(含文档按钮)", async () => {
      render(<AgentSettings />);
      expect(await screen.findByTestId("settings-docs-desktop")).toBeInTheDocument();
      expect(screen.queryByTestId("settings-mobile-heading")).not.toBeInTheDocument();
    });

    it("点击文档按钮深链到 Agent 设置文档页(而非站点根)", async () => {
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      render(<AgentSettings />);
      fireEvent.click(await screen.findByTestId("settings-docs-desktop"));
      expect(open).toHaveBeenCalledWith(expect.stringContaining("/docs/dev/agent/agent"), "_blank");
      open.mockRestore();
    });
  });

  describe("移动端", () => {
    beforeEach(() => mockedUseIsMobile.mockReturnValue(true));

    it("不渲染第二个顶栏(复用全局 MobileHeader),改用页内标题行", async () => {
      render(<AgentSettings />);
      // 全局已有 52px MobileHeader,页面不得再渲染 AgentPageHeader 的桌面页头
      expect(screen.queryByTestId("settings-docs-desktop")).not.toBeInTheDocument();
      // 页内标题行 + 文档动作仍可达
      expect(await screen.findByTestId("settings-mobile-heading")).toHaveTextContent(t("agent:settings_title"));
      expect(screen.getByTestId("settings-docs-mobile")).toBeInTheDocument();
    });

    it("仍展示分类 chip 导航与字段", async () => {
      render(<AgentSettings />);
      expect(await screen.findByTestId("settings-nav-model")).toBeInTheDocument();
      expect(screen.getByText(t("agent:summary_model"))).toBeInTheDocument();
    });
  });
});
