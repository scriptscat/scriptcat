import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";

vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));
vi.mock("@App/pages/options/hooks/useScrollSpy", () => ({
  useScrollSpy: () => ({ activeId: "model", register: () => () => {}, scrollContainerRef: { current: null }, scrollTo: vi.fn() }),
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
});
afterEach(() => cleanup());

describe("AgentSettings 页面", () => {
  it("挂载后展示当前搜索引擎提示", async () => {
    render(<AgentSettings />);
    await waitFor(() => expect(screen.getByText(t("agent:search_engine_tip_bing"))).toBeInTheDocument());
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
});
