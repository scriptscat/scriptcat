import { describe, expect, it } from "vitest";
import {
  getContextWindow,
  getInputTokenBudget,
  getReservedOutputTokens,
  inferContextWindow,
  normalizeModelLimits,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_ANTHROPIC_MAX_TOKENS,
} from "./model_context";

describe("getContextWindow", () => {
  it("returns user-configured contextWindow when provided", () => {
    expect(getContextWindow({ model: "gpt-4o", contextWindow: 50_000 })).toBe(50_000);
  });

  it("matches GPT-4o prefix", () => {
    expect(getContextWindow({ model: "gpt-4o" })).toBe(128_000);
    expect(getContextWindow({ model: "gpt-4o-mini" })).toBe(128_000);
  });

  it("matches GPT-4.1 prefix before GPT-4", () => {
    expect(getContextWindow({ model: "gpt-4.1-nano" })).toBe(1_047_576);
  });

  it("matches GPT-4 Turbo before GPT-4 base", () => {
    expect(getContextWindow({ model: "gpt-4-turbo-preview" })).toBe(128_000);
  });

  it("matches GPT-4 base", () => {
    expect(getContextWindow({ model: "gpt-4-0613" })).toBe(8_192);
  });

  it("matches Claude models", () => {
    expect(getContextWindow({ model: "claude-sonnet-4-20250514" })).toBe(200_000);
    expect(getContextWindow({ model: "claude-3-haiku" })).toBe(200_000);
  });

  it("matches Gemini models", () => {
    expect(getContextWindow({ model: "gemini-2.0-flash" })).toBe(1_048_576);
  });

  it("matches DeepSeek models", () => {
    expect(getContextWindow({ model: "deepseek-chat" })).toBe(64_000);
  });

  it("matches Qwen models", () => {
    expect(getContextWindow({ model: "qwen-max" })).toBe(131_072);
  });

  it("matches Llama-4 before Llama base", () => {
    expect(getContextWindow({ model: "llama-4-maverick" })).toBe(1_048_576);
    expect(getContextWindow({ model: "llama-3.1-70b" })).toBe(131_072);
  });

  it("is case-insensitive", () => {
    expect(getContextWindow({ model: "GPT-4O" })).toBe(128_000);
    expect(getContextWindow({ model: "Claude-Sonnet-4" })).toBe(200_000);
  });

  it("returns default for unknown models", () => {
    expect(getContextWindow({ model: "my-custom-model" })).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("负数 contextWindow 是 truthy，不能被原样返回，否则 getInputTokenBudget 会塌缩为 0", () => {
    expect(getContextWindow({ model: "gpt-4o", contextWindow: -1 })).toBe(128_000);
    expect(getInputTokenBudget({ model: "gpt-4o", contextWindow: -1, provider: "openai" } as any)).toBeGreaterThan(0);
  });

  it("非有限数 contextWindow 应回退到前缀匹配", () => {
    expect(getContextWindow({ model: "gpt-4o", contextWindow: Infinity })).toBe(128_000);
    expect(getContextWindow({ model: "gpt-4o", contextWindow: NaN })).toBe(128_000);
  });
});

describe("getReservedOutputTokens / getInputTokenBudget（小上下文窗口不应把输入预算压成 0）", () => {
  it("未配置 maxTokens 时，大窗口模型仍保留默认输出预留", () => {
    expect(getReservedOutputTokens({ model: "claude-3-haiku", provider: "anthropic" } as any)).toBe(
      DEFAULT_ANTHROPIC_MAX_TOKENS
    );
    expect(getReservedOutputTokens({ model: "gpt-4o", provider: "openai" } as any)).toBe(DEFAULT_ANTHROPIC_MAX_TOKENS);
  });

  it("未配置 maxTokens 时，默认输出预留不应吃掉小窗口模型的全部输入预算", () => {
    // gpt-4 基础版窗口 8192：预留 16384 会让输入预算塌缩为 0，导致每次对话都直接报 context_too_large
    for (const model of ["gpt-4-0613", "gpt-3.5-turbo", "phi-3-mini"]) {
      const budget = getInputTokenBudget({ model, provider: "openai" } as any);
      expect(budget, `${model} 的输入预算不应为 0`).toBeGreaterThan(0);
    }
  });

  it("用户配置的小 contextWindow（本地小模型）同样保留可用的输入预算", () => {
    const budget = getInputTokenBudget({ model: "my-local-model", contextWindow: 8192, provider: "openai" } as any);
    expect(budget).toBeGreaterThan(0);
  });

  it("显式配置的 maxTokens 原样生效，不被默认值改写", () => {
    expect(getReservedOutputTokens({ model: "gpt-4-0613", maxTokens: 4096, provider: "openai" } as any)).toBe(4096);
    expect(getInputTokenBudget({ model: "gpt-4-0613", maxTokens: 4096, provider: "openai" } as any)).toBeGreaterThan(0);
  });
});

describe("normalizeModelLimits（存储边界统一归一化）", () => {
  it("负数 / 非有限数 / 超出合理范围一律归一化为 undefined", () => {
    expect(normalizeModelLimits({ maxTokens: -5, contextWindow: -1 })).toEqual({
      maxTokens: undefined,
      contextWindow: undefined,
    });
    expect(normalizeModelLimits({ maxTokens: Infinity, contextWindow: NaN })).toEqual({
      maxTokens: undefined,
      contextWindow: undefined,
    });
    expect(normalizeModelLimits({ maxTokens: 50_000_000, contextWindow: 50_000_000 })).toEqual({
      maxTokens: undefined,
      contextWindow: undefined,
    });
  });

  it("合法正整数保持不变（向下取整）", () => {
    expect(normalizeModelLimits({ maxTokens: 4096.7, contextWindow: 128_000 })).toEqual({
      maxTokens: 4096,
      contextWindow: 128_000,
    });
  });

  it("未配置（undefined）保持 undefined，交给下游默认值", () => {
    expect(normalizeModelLimits({})).toEqual({ maxTokens: undefined, contextWindow: undefined });
  });
});

describe("inferContextWindow", () => {
  it("returns prefix-matched value", () => {
    expect(inferContextWindow("gpt-4o")).toBe(128_000);
  });

  it("returns default for unknown models", () => {
    expect(inferContextWindow("unknown-model")).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});
