import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService } from "./agent";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_CATTOOL_INSTALL } from "@App/app/cache_key";

// 确保 chrome.tabs.onRemoved 方法可用
if (!chrome.tabs.onRemoved.removeListener) {
  (chrome.tabs.onRemoved as any).removeListener = vi.fn();
}
if (!chrome.tabs.onRemoved.addListener) {
  (chrome.tabs.onRemoved as any).addListener = vi.fn();
}

// 创建 mock AgentService 实例
function createTestService() {
  const mockGroup = { on: vi.fn() } as any;
  const mockSender = {} as any;

  const service = new AgentService(mockGroup, mockSender);

  // 替换 modelRepo（避免 chrome.storage 调用）
  const mockModelRepo = {
    listModels: vi
      .fn()
      .mockResolvedValue([
        { id: "test-openai", name: "Test", provider: "openai", apiBaseUrl: "", apiKey: "", model: "gpt-4o" },
      ]),
    getModel: vi.fn().mockImplementation((id: string) => {
      if (id === "test-openai") {
        return Promise.resolve({
          id: "test-openai",
          name: "Test",
          provider: "openai",
          apiBaseUrl: "",
          apiKey: "",
          model: "gpt-4o",
        });
      }
      return Promise.resolve(undefined);
    }),
    getDefaultModelId: vi.fn().mockResolvedValue("test-openai"),
    saveModel: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
    setDefaultModelId: vi.fn().mockResolvedValue(undefined),
  };
  (service as any).modelRepo = mockModelRepo;

  // 替换 repo 和 catToolRepo（避免 OPFS 调用）
  const mockRepo = {
    appendMessage: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
    listConversations: vi.fn().mockResolvedValue([]),
    saveConversation: vi.fn().mockResolvedValue(undefined),
    saveMessages: vi.fn().mockResolvedValue(undefined),
  };
  const mockCatToolRepo = {
    listTools: vi.fn().mockResolvedValue([]),
    getTool: vi.fn().mockResolvedValue(null),
    saveTool: vi.fn().mockResolvedValue(undefined),
    removeTool: vi.fn().mockResolvedValue(true),
  };
  (service as any).repo = mockRepo;
  (service as any).catToolRepo = mockCatToolRepo;

  return { service, mockRepo, mockCatToolRepo };
}

const VALID_CATTOOL_CODE = `// ==CATTool==
// @name test-tool
// @description A test tool
// @param {string} input - The input
// ==/CATTool==
module.exports = async function(params) { return params.input; }`;

describe("AgentService CATTool 安装流程", () => {
  beforeEach(async () => {
    await cacheInstance.clear();
  });

  describe("cancelCATToolInstall", () => {
    it("应 await cleanupPendingInstall 并 reject", async () => {
      const { service } = createTestService();
      let rejected = false;
      let rejectedError: Error | null = null;

      // 模拟 pendingInstall
      const uuid = "test-uuid";
      // 创建 pending promise（catch 防止 unhandled rejection）
      new Promise<any>((resolve, reject) => {
        (service as any).pendingInstalls.set(uuid, {
          resolve,
          reject: (err: Error) => {
            rejected = true;
            rejectedError = err;
            reject(err);
          },
          tabId: 1,
          timer: setTimeout(() => {}, 60000),
          onTabRemoved: () => {},
        });
      }).catch(() => {});

      await service.cancelCATToolInstall(uuid);

      expect(rejected).toBe(true);
      expect(rejectedError!.message).toBe("CATTool install cancelled by user");
      // pendingInstalls 应已清理
      expect((service as any).pendingInstalls.has(uuid)).toBe(false);
    });

    it("uuid 不存在时应静默返回", async () => {
      const { service } = createTestService();
      // 不应抛出异常
      await service.cancelCATToolInstall("non-existent");
    });
  });

  describe("completeCATToolInstall", () => {
    it("缓存存在时应完成安装并 resolve", async () => {
      const { service } = createTestService();
      const uuid = "complete-uuid";

      // 设置缓存
      await cacheInstance.set(CACHE_KEY_CATTOOL_INSTALL + uuid, {
        code: VALID_CATTOOL_CODE,
        scriptUuid: "src-script",
        scriptName: "Source Script",
      });

      let resolvedRecord: any = null;

      const completionPromise = new Promise<any>((resolve, reject) => {
        (service as any).pendingInstalls.set(uuid, {
          resolve: (record: any) => {
            resolvedRecord = record;
            resolve(record);
          },
          reject,
          tabId: 1,
          timer: setTimeout(() => {}, 60000),
          onTabRemoved: () => {},
        });
      });

      await (service as any).completeCATToolInstall(uuid);
      await completionPromise;

      expect(resolvedRecord).not.toBeNull();
      expect(resolvedRecord.name).toBe("test-tool");
      // pendingInstalls 应已清理
      expect((service as any).pendingInstalls.has(uuid)).toBe(false);
    });

    it("缓存不存在时应 reject", async () => {
      const { service } = createTestService();
      const uuid = "no-cache-uuid";

      let rejectedError: Error | null = null;

      new Promise<any>((resolve, reject) => {
        (service as any).pendingInstalls.set(uuid, {
          resolve,
          reject: (err: Error) => {
            rejectedError = err;
            reject(err);
          },
          tabId: 1,
          timer: setTimeout(() => {}, 60000),
          onTabRemoved: () => {},
        });
      }).catch(() => {});

      await (service as any).completeCATToolInstall(uuid);

      expect(rejectedError).not.toBeNull();
      expect(rejectedError!.message).toContain("not found or expired");
    });

    it("pending 不存在时应静默返回", async () => {
      const { service } = createTestService();
      // 不应抛出异常
      await (service as any).completeCATToolInstall("non-existent");
    });
  });

  describe("getCATToolInstallCode", () => {
    it("缓存存在时应返回代码和元信息", async () => {
      const { service } = createTestService();
      const uuid = "get-code-uuid";

      await cacheInstance.set(CACHE_KEY_CATTOOL_INSTALL + uuid, {
        code: VALID_CATTOOL_CODE,
        scriptName: "My Script",
      });

      const result = await (service as any).getCATToolInstallCode(uuid);

      expect(result.code).toBe(VALID_CATTOOL_CODE);
      expect(result.scriptName).toBe("My Script");
      expect(result.isUpdate).toBe(false);
    });

    it("同名工具已存在时 isUpdate 应为 true", async () => {
      const { service, mockCatToolRepo } = createTestService();
      const uuid = "update-uuid";

      await cacheInstance.set(CACHE_KEY_CATTOOL_INSTALL + uuid, {
        code: VALID_CATTOOL_CODE,
      });

      // 模拟已存在同名工具
      mockCatToolRepo.getTool.mockResolvedValueOnce({ name: "test-tool" });

      const result = await (service as any).getCATToolInstallCode(uuid);

      expect(result.isUpdate).toBe(true);
    });

    it("缓存不存在时应抛出异常", async () => {
      const { service } = createTestService();

      await expect((service as any).getCATToolInstallCode("missing")).rejects.toThrow("not found or expired");
    });
  });

  describe("installCATTool", () => {
    it("应正确安装新工具", async () => {
      const { service, mockCatToolRepo } = createTestService();

      const record = await service.installCATTool(VALID_CATTOOL_CODE);

      expect(record.id).toBeDefined();
      expect(record.name).toBe("test-tool");
      expect(record.description).toBe("A test tool");
      expect(record.code).toBe(VALID_CATTOOL_CODE);
      expect(record.installtime).toBeDefined();
      expect(record.updatetime).toBeDefined();
      expect(mockCatToolRepo.saveTool).toHaveBeenCalledTimes(1);
    });

    it("更新已有工具时应保留 id 和 installtime", async () => {
      const { service, mockCatToolRepo } = createTestService();

      const oldId = "existing-uuid-123";
      const oldInstallTime = 1000000;
      mockCatToolRepo.getTool.mockResolvedValueOnce({
        id: oldId,
        name: "test-tool",
        installtime: oldInstallTime,
        updatetime: oldInstallTime,
      });

      const record = await service.installCATTool(VALID_CATTOOL_CODE);

      expect(record.id).toBe(oldId);
      expect(record.installtime).toBe(oldInstallTime);
      expect(record.updatetime).toBeGreaterThan(oldInstallTime);
    });

    it("无效代码应抛出异常", async () => {
      const { service } = createTestService();

      await expect(service.installCATTool("invalid code")).rejects.toThrow("Invalid CATTool");
    });
  });

  describe("removeCATTool", () => {
    it("工具存在时应删除并返回 true", async () => {
      const { service, mockCatToolRepo } = createTestService();
      mockCatToolRepo.removeTool.mockResolvedValueOnce(true);

      const result = await service.removeCATTool("test-tool");

      expect(result).toBe(true);
      expect(mockCatToolRepo.removeTool).toHaveBeenCalledWith("test-tool");
    });

    it("工具不存在时应返回 false", async () => {
      const { service, mockCatToolRepo } = createTestService();
      mockCatToolRepo.removeTool.mockResolvedValueOnce(false);

      const result = await service.removeCATTool("non-existent");

      expect(result).toBe(false);
    });
  });
});
