import { describe, expect, it } from "vitest";
import { getContextWindow, inferContextWindow, DEFAULT_CONTEXT_WINDOW } from "./model_context";

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
});

describe("inferContextWindow", () => {
  it("returns prefix-matched value", () => {
    expect(inferContextWindow("gpt-4o")).toBe(128_000);
  });

  it("returns default for unknown models", () => {
    expect(inferContextWindow("unknown-model")).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});
