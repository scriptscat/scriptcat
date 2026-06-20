import { describe, it, expect, beforeEach } from "vitest";
import { SearchEngineRegistry } from "./registry";
import type { SearchEngine } from "./types";

// 单独导出 class 供测试用，这里通过重新实例化来隔离测试
// 由于 registry.ts 导出的是单例，测试中构造新实例保持隔离
describe("SearchEngineRegistry", () => {
  let registry: SearchEngineRegistry;

  beforeEach(() => {
    registry = new SearchEngineRegistry();
  });

  it("初始状态下引擎列表为空", () => {
    expect(registry.listNames()).toEqual([]);
  });

  it("注册引擎后可通过名称获取", () => {
    const engine: SearchEngine = {
      name: "test",
      extract: () => [],
    };
    registry.register(engine);
    expect(registry.get("test")).toBe(engine);
  });

  it("listNames 返回所有已注册引擎名", () => {
    registry.register({ name: "a", extract: () => [] });
    registry.register({ name: "b", extract: () => [] });
    expect(registry.listNames()).toContain("a");
    expect(registry.listNames()).toContain("b");
    expect(registry.listNames()).toHaveLength(2);
  });

  it("同名注册时覆盖旧引擎", () => {
    const engine1: SearchEngine = { name: "bing", extract: () => [] };
    const engine2: SearchEngine = { name: "bing", extract: () => [{ title: "x", url: "y", snippet: "z" }] };
    registry.register(engine1);
    registry.register(engine2);
    expect(registry.get("bing")).toBe(engine2);
    expect(registry.listNames()).toHaveLength(1);
  });

  it("获取未注册引擎返回 undefined", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });
});
