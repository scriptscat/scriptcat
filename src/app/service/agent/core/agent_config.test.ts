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
  });
});
