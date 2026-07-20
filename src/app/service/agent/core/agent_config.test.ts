import { describe, expect, it, beforeEach } from "vitest";
import { AgentConfigRepo, DEFAULT_CHAT_MAX_ITERATIONS } from "./agent_config";

describe("AgentConfigRepo", () => {
  let repo: AgentConfigRepo;

  beforeEach(() => {
    chrome.storage.local.clear();
    repo = new AgentConfigRepo();
  });

  describe("getConfig", () => {
    it("未保存过配置时应返回默认的 chatMaxIterations", async () => {
      const config = await repo.getConfig();
      expect(config.chatMaxIterations).toBe(DEFAULT_CHAT_MAX_ITERATIONS);
    });

    it("storage 读取异常时应返回默认配置而非抛出异常", async () => {
      const originalGet = chrome.storage.local.get;
      chrome.storage.local.get = () => Promise.reject(new Error("storage error"));
      try {
        const config = await repo.getConfig();
        expect(config.chatMaxIterations).toBe(DEFAULT_CHAT_MAX_ITERATIONS);
      } finally {
        chrome.storage.local.get = originalGet;
      }
    });
  });

  describe("saveConfig", () => {
    it("应持久化自定义的 chatMaxIterations 并可被重新读取", async () => {
      await repo.saveConfig({ chatMaxIterations: 200 });
      const config = await repo.getConfig();
      expect(config.chatMaxIterations).toBe(200);
    });

    it("保存部分字段时应与默认配置合并而非丢失未指定字段", async () => {
      await repo.saveConfig({ chatMaxIterations: 120 });
      const config = await repo.getConfig();
      expect(config).toEqual({ chatMaxIterations: 120 });
    });

    it("保存值超过上限 1000 时应截断为 1000", async () => {
      await repo.saveConfig({ chatMaxIterations: 999999 });
      const config = await repo.getConfig();
      expect(config.chatMaxIterations).toBe(1000);
    });

    it("保存 0 或负数时应截断为下限 1", async () => {
      await repo.saveConfig({ chatMaxIterations: 0 });
      expect((await repo.getConfig()).chatMaxIterations).toBe(1);

      await repo.saveConfig({ chatMaxIterations: -20 });
      expect((await repo.getConfig()).chatMaxIterations).toBe(1);
    });

    it("保存非整数时应四舍五入", async () => {
      await repo.saveConfig({ chatMaxIterations: 50.6 });
      const config = await repo.getConfig();
      expect(config.chatMaxIterations).toBe(51);
    });
  });

  describe("边界防护 —— storage 中存在非法值（如损坏数据、devtools 直接写入、旧版本遗留值）", () => {
    it("getConfig 读取到超出范围或非法的原始值时应归一化而非直接透传", async () => {
      const cases: Array<[unknown, number]> = [
        [0, 1],
        [-5, 1],
        [999999, 1000],
        [NaN, DEFAULT_CHAT_MAX_ITERATIONS],
        ["not-a-number", DEFAULT_CHAT_MAX_ITERATIONS],
        [null, DEFAULT_CHAT_MAX_ITERATIONS],
        [12.9, 13],
      ];

      for (const [stored, expected] of cases) {
        await chrome.storage.local.set({ agent_general_config: { chatMaxIterations: stored } });
        const config = await repo.getConfig();
        expect(config.chatMaxIterations).toBe(expected);
      }
    });
  });
});
