// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { detectProvider, groupModelsByProvider } from "./model_utils";

const makeModel = (model: string, overrides?: Partial<AgentModelConfig>): AgentModelConfig => ({
  id: model,
  name: model,
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model,
  ...overrides,
});

describe("detectProvider 推断供应商", () => {
  it("gpt 系列或 openai.com 归入 openai", () => {
    expect(detectProvider(makeModel("gpt-4o")).key).toBe("openai");
    expect(detectProvider(makeModel("o1-preview")).key).toBe("openai");
    expect(detectProvider(makeModel("custom", { apiBaseUrl: "https://api.openai.com/v1" })).key).toBe("openai");
  });

  it("claude 系列或 anthropic.com 归入 anthropic", () => {
    expect(detectProvider(makeModel("claude-opus-4-20250514")).key).toBe("anthropic");
    expect(detectProvider(makeModel("x", { apiBaseUrl: "https://api.anthropic.com" })).key).toBe("anthropic");
  });

  it("gemini 系列归入 google，deepseek 归入 deepseek", () => {
    expect(detectProvider(makeModel("gemini-2.0-flash")).key).toBe("google");
    expect(detectProvider(makeModel("deepseek-chat")).key).toBe("deepseek");
  });

  it("无法识别模型名时按 provider 字段兜底", () => {
    expect(detectProvider(makeModel("my-model", { provider: "anthropic" })).key).toBe("anthropic");
  });

  it("完全无法识别时归入 other", () => {
    expect(detectProvider(makeModel("zzz-unknown-model")).key).toBe("other");
  });
});

describe("groupModelsByProvider 按供应商分组", () => {
  it("同供应商的模型归入同一组", () => {
    const groups = groupModelsByProvider([makeModel("gpt-4o"), makeModel("gpt-4o-mini")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].provider.key).toBe("openai");
    expect(groups[0].models.map((m) => m.model)).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("不同供应商按 order 排序（openai 在 anthropic 之前）", () => {
    const groups = groupModelsByProvider([makeModel("claude-opus-4-20250514"), makeModel("gpt-4o")]);
    expect(groups.map((g) => g.provider.key)).toEqual(["openai", "anthropic"]);
  });

  it("空列表返回空数组", () => {
    expect(groupModelsByProvider([])).toEqual([]);
  });
});
