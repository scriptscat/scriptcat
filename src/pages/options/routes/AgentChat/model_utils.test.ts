import { describe, it, expect } from "vitest";
import {
  supportsImageOutputByModelId,
  supportsImageOutput,
  supportsVisionByModelId,
  supportsVision,
} from "./model_utils";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";

const makeModel = (model: string, overrides?: Partial<AgentModelConfig>): AgentModelConfig => ({
  id: "test",
  name: "Test",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model,
  ...overrides,
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

  it.concurrent("Gemini 2.0 Flash 应支持图片输出", () => {
    expect(supportsImageOutputByModelId("gemini-2.0-flash")).toBe(true);
    expect(supportsImageOutputByModelId("gemini-2.0-flash-exp")).toBe(true);
  });

  it.concurrent("Gemini 3+ 带 image 标识的模型应支持图片输出", () => {
    expect(supportsImageOutputByModelId("gemini-3-pro-image-preview")).toBe(true);
    expect(supportsImageOutputByModelId("gemini-3.1-flash-image-preview")).toBe(true);
  });

  it.concurrent("Gemini 旧版本和非图片模型不应支持图片输出", () => {
    expect(supportsImageOutputByModelId("gemini-1.5-pro")).toBe(false);
    expect(supportsImageOutputByModelId("gemini-pro-vision")).toBe(false);
    expect(supportsImageOutputByModelId("gemini-3-flash-preview")).toBe(false);
    expect(supportsImageOutputByModelId("gemini-3.1-pro-preview")).toBe(false);
    expect(supportsImageOutputByModelId("gemini-2.0-flash-lite")).toBe(false);
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

describe("用户手动标记能力优先于自动检测", () => {
  it.concurrent("supportsVision 应优先使用用户手动设置的值", () => {
    // 自动检测为 true，用户手动关闭
    expect(supportsVision(makeModel("gpt-4o", { supportsVision: false }))).toBe(false);
    // 自动检测为 false，用户手动开启
    expect(supportsVision(makeModel("deepseek-chat", { supportsVision: true }))).toBe(true);
    // 未设置时回退到自动检测
    expect(supportsVision(makeModel("gpt-4o"))).toBe(true);
    expect(supportsVision(makeModel("deepseek-chat"))).toBe(false);
  });

  it.concurrent("supportsImageOutput 应优先使用用户手动设置的值", () => {
    // 自动检测为 true，用户手动关闭
    expect(supportsImageOutput(makeModel("gpt-4o", { supportsImageOutput: false }))).toBe(false);
    // 自动检测为 false，用户手动开启
    expect(supportsImageOutput(makeModel("gemini-3-flash-preview", { supportsImageOutput: true }))).toBe(true);
    // 未设置时回退到自动检测
    expect(supportsImageOutput(makeModel("gpt-4o"))).toBe(true);
    expect(supportsImageOutput(makeModel("gemini-3-flash-preview"))).toBe(false);
  });
});
