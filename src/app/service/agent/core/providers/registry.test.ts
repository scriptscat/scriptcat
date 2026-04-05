import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "./registry";
import type { LLMProvider } from "./types";

// 辅助函数：创建一个简单的 mock Provider
function makeMockProvider(name: string): LLMProvider {
  return {
    name,
    buildRequest: () => ({ url: "https://example.com", init: { method: "POST" } }),
    parseStream: async () => {},
  };
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("register 后 has 应返回 true", () => {
    registry.register(makeMockProvider("openai"));
    expect(registry.has("openai")).toBe(true);
  });

  it("未注册的 provider has 应返回 false", () => {
    expect(registry.has("unknown")).toBe(false);
  });

  it("get 应返回已注册的 provider", () => {
    const p = makeMockProvider("anthropic");
    registry.register(p);
    expect(registry.get("anthropic")).toBe(p);
  });

  it("get 未注册的 provider 应返回 undefined", () => {
    expect(registry.get("gemini")).toBeUndefined();
  });

  it("listNames 应返回所有已注册的名称", () => {
    registry.register(makeMockProvider("openai"));
    registry.register(makeMockProvider("anthropic"));
    expect(registry.listNames()).toEqual(expect.arrayContaining(["openai", "anthropic"]));
    expect(registry.listNames()).toHaveLength(2);
  });

  it("重复注册同名 provider 应覆盖", () => {
    const p1 = makeMockProvider("openai");
    const p2 = makeMockProvider("openai");
    registry.register(p1);
    registry.register(p2);
    expect(registry.get("openai")).toBe(p2);
    expect(registry.listNames()).toHaveLength(1);
  });

  it("listNames 在无注册时应返回空数组", () => {
    expect(registry.listNames()).toEqual([]);
  });
});
