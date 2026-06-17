import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { agentClient } from "@App/pages/store/features/script";

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

beforeEach(() => initLanguage("zh-CN"));
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
});
