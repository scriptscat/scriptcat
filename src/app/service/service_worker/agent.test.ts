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
  const mockSkillRepo = {
    listSkills: vi.fn().mockResolvedValue([]),
    getSkill: vi.fn().mockResolvedValue(null),
    saveSkill: vi.fn().mockResolvedValue(undefined),
    removeSkill: vi.fn().mockResolvedValue(true),
    getSkillScripts: vi.fn().mockResolvedValue([]),
    getSkillReferences: vi.fn().mockResolvedValue([]),
    getReference: vi.fn().mockResolvedValue(null),
  };
  (service as any).repo = mockRepo;
  (service as any).catToolRepo = mockCatToolRepo;
  (service as any).skillRepo = mockSkillRepo;

  return { service, mockRepo, mockCatToolRepo, mockSkillRepo };
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

// ---- Skill 系统测试 ----

import type { SkillRecord, CATToolRecord } from "@App/app/service/agent/types";

// 辅助：创建 SkillRecord
function makeSkillRecord(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: "test-skill",
    description: "A test skill",
    toolNames: [],
    referenceNames: [],
    prompt: "You are a test skill assistant.",
    installtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

// 辅助：创建 CATToolRecord
function makeCATToolRecord(overrides: Partial<CATToolRecord> = {}): CATToolRecord {
  return {
    id: "tool-id-1",
    name: "test-cattool",
    description: "A test CATTool",
    params: [{ name: "input", type: "string", description: "The input", required: true }],
    grants: [],
    code: "module.exports = async (p) => p.input;",
    installtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

describe("AgentService Skill 系统", () => {
  describe("resolveSkills", () => {
    it("无 skills 时返回空", () => {
      const { service } = createTestService();
      const result = (service as any).resolveSkills(undefined);
      expect(result.promptSuffix).toBe("");
      expect(result.metaTools).toEqual([]);
    });

    it('"auto" 加载全部 skill 摘要', () => {
      const { service } = createTestService();

      const skill1 = makeSkillRecord({ name: "price-monitor", description: "监控商品价格", toolNames: ["price-check"], prompt: "Monitor prices." });
      const skill2 = makeSkillRecord({ name: "translator", description: "翻译助手", referenceNames: ["glossary"], prompt: "Translate text." });
      (service as any).skillCache.set("price-monitor", skill1);
      (service as any).skillCache.set("translator", skill2);

      const result = (service as any).resolveSkills("auto");

      // promptSuffix 应包含两个 skill 的 name + description
      expect(result.promptSuffix).toContain("price-monitor");
      expect(result.promptSuffix).toContain("监控商品价格");
      expect(result.promptSuffix).toContain("translator");
      expect(result.promptSuffix).toContain("翻译助手");

      // promptSuffix 不应包含 skill.prompt 内容
      expect(result.promptSuffix).not.toContain("Monitor prices.");
      expect(result.promptSuffix).not.toContain("Translate text.");

      // 应返回 3 个 metaTools（load_skill, execute_skill_tool, read_reference）
      expect(result.metaTools).toHaveLength(3);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("execute_skill_tool");
      expect(names).toContain("read_reference");
    });

    it("指定名称过滤", () => {
      const { service } = createTestService();

      const skill1 = makeSkillRecord({ name: "skill-a", description: "Skill A" });
      const skill2 = makeSkillRecord({ name: "skill-b", description: "Skill B" });
      (service as any).skillCache.set("skill-a", skill1);
      (service as any).skillCache.set("skill-b", skill2);

      const result = (service as any).resolveSkills(["skill-a"]);

      expect(result.promptSuffix).toContain("skill-a");
      expect(result.promptSuffix).toContain("Skill A");
      expect(result.promptSuffix).not.toContain("skill-b");
      expect(result.promptSuffix).not.toContain("Skill B");
    });

    it("无工具/参考资料的 skill 只注册 load_skill", () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "simple-skill", toolNames: [], referenceNames: [] });
      (service as any).skillCache.set("simple-skill", skill);

      const result = (service as any).resolveSkills("auto");

      expect(result.metaTools).toHaveLength(1);
      expect(result.metaTools[0].definition.name).toBe("load_skill");
    });

    it("有工具无参考资料时注册 load_skill + execute_skill_tool", () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "tools-only", toolNames: ["my-tool"], referenceNames: [] });
      (service as any).skillCache.set("tools-only", skill);

      const result = (service as any).resolveSkills("auto");

      expect(result.metaTools).toHaveLength(2);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("execute_skill_tool");
    });

    it("有参考资料无工具时注册 load_skill + read_reference", () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "refs-only", toolNames: [], referenceNames: ["doc.md"] });
      (service as any).skillCache.set("refs-only", skill);

      const result = (service as any).resolveSkills("auto");

      expect(result.metaTools).toHaveLength(2);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("read_reference");
    });
  });

  describe("load_skill meta-tool", () => {
    it("返回完整 prompt", async () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "my-skill", prompt: "Detailed instructions here." });
      (service as any).skillCache.set("my-skill", skill);

      const result = (service as any).resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      const output = await loadSkill.executor.execute({ skill_name: "my-skill" });
      expect(output).toBe("Detailed instructions here.");
    });

    it("skill 不存在时抛错", async () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "existing" });
      (service as any).skillCache.set("existing", skill);

      const result = (service as any).resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      await expect(loadSkill.executor.execute({ skill_name: "non-existent" })).rejects.toThrow(
        'Skill "non-existent" not found'
      );
    });
  });

  describe("execute_skill_tool meta-tool", () => {
    it("正常执行工具", async () => {
      const { service, mockSkillRepo } = createTestService();

      const toolRecord = makeCATToolRecord({ name: "price-check" });
      const skill = makeSkillRecord({ name: "price-skill", toolNames: ["price-check"] });
      (service as any).skillCache.set("price-skill", skill);

      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([toolRecord]);

      const result = (service as any).resolveSkills("auto");
      const execTool = result.metaTools.find((t: any) => t.definition.name === "execute_skill_tool");

      // execute_skill_tool 需要 skill_name 和 tool_name
      expect(execTool.definition.parameters.required).toContain("skill_name");
      expect(execTool.definition.parameters.required).toContain("tool_name");

      // 验证 getSkillScripts 被正确调用（实际执行会需要 sandbox，这里验证参数传递）
      // CATToolExecutor 需要 sandbox 环境，所以我们只验证到 getSkillScripts 被调用
      try {
        await execTool.executor.execute({
          skill_name: "price-skill",
          tool_name: "price-check",
          arguments: { url: "https://example.com" },
        });
      } catch {
        // CATToolExecutor 在测试环境中会抛出异常（缺少 sandbox），这里只验证流程
      }
      expect(mockSkillRepo.getSkillScripts).toHaveBeenCalledWith("price-skill");
    });

    it("工具不存在时抛错", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skill = makeSkillRecord({ name: "some-skill", toolNames: ["real-tool"] });
      (service as any).skillCache.set("some-skill", skill);

      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([]);

      const result = (service as any).resolveSkills("auto");
      const execTool = result.metaTools.find((t: any) => t.definition.name === "execute_skill_tool");

      await expect(
        execTool.executor.execute({ skill_name: "some-skill", tool_name: "missing-tool" })
      ).rejects.toThrow('Tool "missing-tool" not found in skill "some-skill"');
    });
  });

  describe("read_reference meta-tool", () => {
    it("正常返回参考资料内容", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skill = makeSkillRecord({ name: "ref-skill", referenceNames: ["api-doc"] });
      (service as any).skillCache.set("ref-skill", skill);

      mockSkillRepo.getReference.mockResolvedValueOnce({ name: "api-doc", content: "API documentation content" });

      const result = (service as any).resolveSkills("auto");
      const readRef = result.metaTools.find((t: any) => t.definition.name === "read_reference");

      const output = await readRef.executor.execute({ skill_name: "ref-skill", reference_name: "api-doc" });
      expect(output).toBe("API documentation content");
      expect(mockSkillRepo.getReference).toHaveBeenCalledWith("ref-skill", "api-doc");
    });

    it("不存在时抛错", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skill = makeSkillRecord({ name: "ref-skill", referenceNames: ["doc"] });
      (service as any).skillCache.set("ref-skill", skill);

      mockSkillRepo.getReference.mockResolvedValueOnce(null);

      const result = (service as any).resolveSkills("auto");
      const readRef = result.metaTools.find((t: any) => t.definition.name === "read_reference");

      await expect(
        readRef.executor.execute({ skill_name: "ref-skill", reference_name: "missing-doc" })
      ).rejects.toThrow('Reference "missing-doc" not found in skill "ref-skill"');
    });
  });

  describe("installSkill + resolveSkills 集成", () => {
    it("安装后缓存生效", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skillMd = `---
name: integrated-skill
description: An integrated test skill
---
Do something useful.`;

      mockSkillRepo.getSkill = vi.fn().mockResolvedValue(null);
      // mock saveSkill to succeed
      mockSkillRepo.saveSkill = vi.fn().mockResolvedValue(undefined);

      await service.installSkill(skillMd);

      // skillCache 应包含新安装的 skill
      expect((service as any).skillCache.has("integrated-skill")).toBe(true);

      const result = (service as any).resolveSkills("auto");
      expect(result.promptSuffix).toContain("integrated-skill");
      expect(result.promptSuffix).toContain("An integrated test skill");
      // 不应包含 prompt 内容
      expect(result.promptSuffix).not.toContain("Do something useful.");
    });
  });

  describe("removeSkill + resolveSkills 集成", () => {
    it("卸载后缓存清除", async () => {
      const { service, mockSkillRepo } = createTestService();

      // 先放入缓存
      const skill = makeSkillRecord({ name: "to-remove" });
      (service as any).skillCache.set("to-remove", skill);

      mockSkillRepo.removeSkill.mockResolvedValueOnce(true);

      await service.removeSkill("to-remove");

      // skillCache 应不再包含
      expect((service as any).skillCache.has("to-remove")).toBe(false);

      const result = (service as any).resolveSkills("auto");
      expect(result.promptSuffix).toBe("");
      expect(result.metaTools).toEqual([]);
    });
  });
});
