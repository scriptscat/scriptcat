import { describe, it, expect } from "vitest";
import { supportsImageOutputByModelId, supportsImageOutput, supportsVisionByModelId } from "./model_utils";
import type { AgentModelConfig } from "@App/app/service/agent/types";

const makeModel = (model: string): AgentModelConfig => ({
  id: "test",
  name: "Test",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model,
});

describe("supportsImageOutputByModelId", () => {
  it.concurrent("GPT-4o 系列应支持图片输出", () => {
    expect(supportsImageOutputByModelId("gpt-4o")).toBe(true);
    expect(supportsImageOutputByModelId("gpt-4o-2024-08-06")).toBe(true);
    expect(supportsImageOutputByModelId("GPT-4o")).toBe(true);
  });

  it.concurrent("GPT-4o-mini 不应支持图片输出", () => {
    expect(supportsImageOutputByModelId("gpt-4o-mini")).toBe(false);
    expect(supportsImageOutputByModelId("gpt-4o-mini-2024-07-18")).toBe(false);
  });

  it.concurrent("GPT-4o-audio 不应支持图片输出", () => {
    expect(supportsImageOutputByModelId("gpt-4o-audio-preview")).toBe(false);
  });

  it.concurrent("Gemini Flash/Pro 应支持图片输出", () => {
    expect(supportsImageOutputByModelId("gemini-2.0-flash")).toBe(true);
    expect(supportsImageOutputByModelId("gemini-2.0-flash-exp")).toBe(true);
    expect(supportsImageOutputByModelId("gemini-1.5-pro")).toBe(true);
    expect(supportsImageOutputByModelId("gemini-pro-vision")).toBe(true);
  });

  it.concurrent("DALL-E 应支持图片输出", () => {
    expect(supportsImageOutputByModelId("dall-e-3")).toBe(true);
    expect(supportsImageOutputByModelId("dall-e-2")).toBe(true);
  });

  it.concurrent("Claude 系列不应支持图片输出", () => {
    expect(supportsImageOutputByModelId("claude-sonnet-4-20250514")).toBe(false);
    expect(supportsImageOutputByModelId("claude-3-opus-20240229")).toBe(false);
  });

  it.concurrent("其他模型不应支持图片输出", () => {
    expect(supportsImageOutputByModelId("deepseek-chat")).toBe(false);
    expect(supportsImageOutputByModelId("gpt-3.5-turbo")).toBe(false);
    expect(supportsImageOutputByModelId("o1-preview")).toBe(false);
    expect(supportsImageOutputByModelId("qwen-vl-plus")).toBe(false);
  });
});

describe("supportsImageOutput", () => {
  it.concurrent("应通过模型配置检测图片输出支持", () => {
    expect(supportsImageOutput(makeModel("gpt-4o"))).toBe(true);
    expect(supportsImageOutput(makeModel("gpt-4o-mini"))).toBe(false);
    expect(supportsImageOutput(makeModel("claude-sonnet-4-20250514"))).toBe(false);
    expect(supportsImageOutput(makeModel("gemini-2.0-flash"))).toBe(true);
  });
});

describe("supportsVisionByModelId（回归测试）", () => {
  it.concurrent("视觉检测不应受图片输出逻辑影响", () => {
    // 支持视觉但不支持图片输出
    expect(supportsVisionByModelId("claude-sonnet-4-20250514")).toBe(true);
    expect(supportsImageOutputByModelId("claude-sonnet-4-20250514")).toBe(false);

    // 同时支持视觉和图片输出
    expect(supportsVisionByModelId("gpt-4o")).toBe(true);
    expect(supportsImageOutputByModelId("gpt-4o")).toBe(true);
  });
});
