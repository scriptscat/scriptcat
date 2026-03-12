import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

      const skill1 = makeSkillRecord({
        name: "price-monitor",
        description: "监控商品价格",
        toolNames: ["price-check"],
        prompt: "Monitor prices.",
      });
      const skill2 = makeSkillRecord({
        name: "translator",
        description: "翻译助手",
        referenceNames: ["glossary"],
        prompt: "Translate text.",
      });
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

      // 应返回 2 个 metaTools（load_skill, read_reference），不再有 execute_skill_tool
      expect(result.metaTools).toHaveLength(2);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("read_reference");
      expect(names).not.toContain("execute_skill_tool");

      // dynamicToolNames 初始为空
      expect(result.dynamicToolNames).toEqual([]);
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

    it("有工具无参考资料时只注册 load_skill", () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "tools-only", toolNames: ["my-tool"], referenceNames: [] });
      (service as any).skillCache.set("tools-only", skill);

      const result = (service as any).resolveSkills("auto");

      // 工具在 load_skill 调用时才动态注册，不再有 execute_skill_tool
      expect(result.metaTools).toHaveLength(1);
      expect(result.metaTools[0].definition.name).toBe("load_skill");
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

    it("动态注册 skill 的 CATTool 为独立工具", async () => {
      const { service, mockSkillRepo } = createTestService();

      const toolRecord = makeCATToolRecord({
        name: "price-check",
        description: "Check price",
        params: [{ name: "url", type: "string", description: "Target URL", required: true }],
        grants: [],
      });
      const skill = makeSkillRecord({ name: "price-skill", toolNames: ["price-check"] });
      (service as any).skillCache.set("price-skill", skill);

      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([toolRecord]);

      const result = (service as any).resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      // 调用 load_skill 前，toolRegistry 中不应有 price-skill__price-check
      const registry = (service as any).toolRegistry;
      const defsBefore = registry.getDefinitions();
      expect(defsBefore.find((d: any) => d.name === "price-skill__price-check")).toBeUndefined();

      // 调用 load_skill（CATToolExecutor 执行会失败，但注册应完成）
      const output = await loadSkill.executor.execute({ skill_name: "price-skill" });
      expect(output).toBe(skill.prompt);

      // 调用后，toolRegistry 中应有 price-skill__price-check
      const defsAfter = registry.getDefinitions();
      const registered = defsAfter.find((d: any) => d.name === "price-skill__price-check");
      expect(registered).toBeDefined();
      expect(registered.description).toBe("Check price");
      expect(registered.parameters.properties.url).toBeDefined();
      expect(registered.parameters.required).toContain("url");

      // dynamicToolNames 应记录注册的工具名
      expect(result.dynamicToolNames).toContain("price-skill__price-check");

      // 验证 getSkillScripts 被正确调用
      expect(mockSkillRepo.getSkillScripts).toHaveBeenCalledWith("price-skill");

      // 清理
      registry.unregisterBuiltin("price-skill__price-check");
    });

    it("无工具的 skill 不调用 getSkillScripts", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skill = makeSkillRecord({ name: "no-tools", toolNames: [], prompt: "Simple prompt." });
      (service as any).skillCache.set("no-tools", skill);

      const result = (service as any).resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      await loadSkill.executor.execute({ skill_name: "no-tools" });
      expect(mockSkillRepo.getSkillScripts).not.toHaveBeenCalled();
      expect(result.dynamicToolNames).toEqual([]);
    });

    it("多个 CATTool 应全部注册并使用正确前缀", async () => {
      const { service, mockSkillRepo } = createTestService();

      const tool1 = makeCATToolRecord({
        name: "extract",
        description: "提取数据",
        params: [{ name: "url", type: "string", description: "URL", required: true }],
      });
      const tool2 = makeCATToolRecord({
        name: "compare",
        description: "比较价格",
        params: [
          { name: "a", type: "number", description: "价格A", required: true },
          { name: "b", type: "number", description: "价格B", required: true },
        ],
      });

      const skill = makeSkillRecord({ name: "taobao", toolNames: ["extract", "compare"] });
      (service as any).skillCache.set("taobao", skill);

      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([tool1, tool2]);

      const result = (service as any).resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      await loadSkill.executor.execute({ skill_name: "taobao" });

      const registry = (service as any).toolRegistry;
      const defs = registry.getDefinitions();

      // 两个工具都应注册
      const extractDef = defs.find((d: any) => d.name === "taobao__extract");
      const compareDef = defs.find((d: any) => d.name === "taobao__compare");
      expect(extractDef).toBeDefined();
      expect(compareDef).toBeDefined();
      expect(extractDef.description).toBe("提取数据");
      expect(compareDef.parameters.required).toEqual(["a", "b"]);

      // dynamicToolNames 应记录两个工具名
      expect(result.dynamicToolNames).toHaveLength(2);
      expect(result.dynamicToolNames).toContain("taobao__extract");
      expect(result.dynamicToolNames).toContain("taobao__compare");

      // 清理
      registry.unregisterBuiltin("taobao__extract");
      registry.unregisterBuiltin("taobao__compare");
    });

    it("重复 load_skill 同一 skill 应幂等注册（覆盖已有）", async () => {
      const { service, mockSkillRepo } = createTestService();

      const toolRecord = makeCATToolRecord({
        name: "my-tool",
        description: "V1",
        params: [],
      });
      const skill = makeSkillRecord({ name: "my-skill", toolNames: ["my-tool"] });
      (service as any).skillCache.set("my-skill", skill);

      // 第一次 load
      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([toolRecord]);
      const result = (service as any).resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");
      await loadSkill.executor.execute({ skill_name: "my-skill" });

      // 第二次 load（模拟更新后的 toolRecord）
      const updatedTool = makeCATToolRecord({ name: "my-tool", description: "V2", params: [] });
      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([updatedTool]);
      await loadSkill.executor.execute({ skill_name: "my-skill" });

      const registry = (service as any).toolRegistry;
      const defs = registry.getDefinitions();
      const def = defs.find((d: any) => d.name === "my-skill__my-tool");
      expect(def).toBeDefined();

      // dynamicToolNames 应记录两次（由外层清理负责去重）
      expect(result.dynamicToolNames).toContain("my-skill__my-tool");

      // 清理
      registry.unregisterBuiltin("my-skill__my-tool");
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

  describe("installSkill 完整流程", () => {
    it("安装含脚本和参考资料的 Skill", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skillMd = `---
name: full-skill
description: A skill with tools and refs
---
You are a full-featured skill.`;

      const scripts = [
        {
          name: "my-tool",
          code: VALID_CATTOOL_CODE,
        },
      ];

      const references = [{ name: "api-doc", content: "Some API documentation" }];

      const record = await service.installSkill(skillMd, scripts, references);

      expect(record.name).toBe("full-skill");
      expect(record.description).toBe("A skill with tools and refs");
      expect(record.prompt).toBe("You are a full-featured skill.");
      expect(record.toolNames).toEqual(["test-tool"]);
      expect(record.referenceNames).toEqual(["api-doc"]);

      // saveSkill 应被调用，带上脚本和参考资料
      expect(mockSkillRepo.saveSkill).toHaveBeenCalledTimes(1);
      const [savedRecord, savedScripts, savedRefs] = mockSkillRepo.saveSkill.mock.calls[0];
      expect(savedRecord.name).toBe("full-skill");
      expect(savedScripts).toHaveLength(1);
      expect(savedScripts[0].name).toBe("test-tool");
      expect(savedRefs).toHaveLength(1);
      expect(savedRefs[0].name).toBe("api-doc");

      // skillCache 应包含新安装的 skill
      expect((service as any).skillCache.has("full-skill")).toBe(true);
    });

    it("更新已有 Skill 时保留 installtime", async () => {
      const { service, mockSkillRepo } = createTestService();

      const oldInstallTime = 1000000;
      mockSkillRepo.getSkill.mockResolvedValueOnce(
        makeSkillRecord({ name: "existing-skill", installtime: oldInstallTime })
      );

      const skillMd = `---
name: existing-skill
description: Updated description
---
Updated prompt.`;

      const record = await service.installSkill(skillMd);

      expect(record.installtime).toBe(oldInstallTime);
      expect(record.updatetime).toBeGreaterThan(oldInstallTime);
      expect(record.description).toBe("Updated description");
      expect(record.prompt).toBe("Updated prompt.");
    });

    it("无效 SKILL.md 应抛出异常", async () => {
      const { service } = createTestService();

      await expect(service.installSkill("not valid skill md")).rejects.toThrow("Invalid SKILL.md");
    });

    it("含无效 CATTool 脚本时应抛出异常", async () => {
      const { service } = createTestService();

      const skillMd = `---
name: bad-scripts
description: Has invalid script
---
Some prompt.`;

      await expect(service.installSkill(skillMd, [{ name: "bad-tool", code: "not a cattool" }])).rejects.toThrow(
        "Invalid CATTool script"
      );
    });
  });

  describe("removeSkill", () => {
    it("删除存在的 Skill 返回 true", async () => {
      const { service, mockSkillRepo } = createTestService();

      (service as any).skillCache.set("to-delete", makeSkillRecord({ name: "to-delete" }));
      mockSkillRepo.removeSkill.mockResolvedValueOnce(true);

      const result = await service.removeSkill("to-delete");

      expect(result).toBe(true);
      expect(mockSkillRepo.removeSkill).toHaveBeenCalledWith("to-delete");
      expect((service as any).skillCache.has("to-delete")).toBe(false);
    });

    it("删除不存在的 Skill 返回 false 且不影响缓存", async () => {
      const { service, mockSkillRepo } = createTestService();

      mockSkillRepo.removeSkill.mockResolvedValueOnce(false);

      const result = await service.removeSkill("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("installSkill 从 ZIP 解析结果安装", () => {
    it("应正确安装 parseSkillZip 返回的完整结构", async () => {
      const { service, mockSkillRepo } = createTestService();

      // 模拟 parseSkillZip 的输出结构
      const zipResult = {
        skillMd: `---
name: taobao-helper
description: 淘宝购物助手
---
你是一个淘宝购物助手。`,
        scripts: [{ name: "taobao_extract.js", code: VALID_CATTOOL_CODE }],
        references: [
          { name: "api_docs.md", content: "# API Docs\n淘宝接口文档" },
          { name: "guide.txt", content: "使用指南" },
        ],
      };

      const record = await service.installSkill(zipResult.skillMd, zipResult.scripts, zipResult.references);

      expect(record.name).toBe("taobao-helper");
      expect(record.description).toBe("淘宝购物助手");
      expect(record.prompt).toBe("你是一个淘宝购物助手。");
      expect(record.toolNames).toEqual(["test-tool"]); // CATTool 名称从 metadata 中解析
      expect(record.referenceNames).toEqual(["api_docs.md", "guide.txt"]);

      // 验证 saveSkill 调用参数
      expect(mockSkillRepo.saveSkill).toHaveBeenCalledTimes(1);
      const [savedRecord, savedScripts, savedRefs] = mockSkillRepo.saveSkill.mock.calls[0];
      expect(savedRecord.name).toBe("taobao-helper");
      expect(savedScripts).toHaveLength(1);
      expect(savedScripts[0].name).toBe("test-tool");
      expect(savedRefs).toHaveLength(2);
      expect(savedRefs[0].name).toBe("api_docs.md");
      expect(savedRefs[1].content).toBe("使用指南");

      // 验证 skillCache 更新
      expect((service as any).skillCache.has("taobao-helper")).toBe(true);
    });

    it("ZIP 结果中多个脚本应全部安装", async () => {
      const { service, mockSkillRepo } = createTestService();

      const anotherToolCode = `// ==CATTool==
// @name another-tool
// @description Another tool
// @param {string} query - Search query
// ==/CATTool==
return query;`;

      const record = await service.installSkill(
        `---\nname: multi-tool\ndescription: Multi tools skill\n---\nMulti tool prompt.`,
        [
          { name: "tool1.js", code: VALID_CATTOOL_CODE },
          { name: "tool2.js", code: anotherToolCode },
        ],
        []
      );

      expect(record.toolNames).toHaveLength(2);
      expect(record.toolNames).toContain("test-tool");
      expect(record.toolNames).toContain("another-tool");

      const savedScripts = mockSkillRepo.saveSkill.mock.calls[0][1];
      expect(savedScripts).toHaveLength(2);
    });

    it("ZIP 结果无脚本无参考资料时应正常安装", async () => {
      const { service } = createTestService();

      const record = await service.installSkill(
        `---\nname: simple-zip\ndescription: Simple\n---\nSimple prompt.`,
        [],
        []
      );

      expect(record.name).toBe("simple-zip");
      expect(record.toolNames).toEqual([]);
      expect(record.referenceNames).toEqual([]);
    });
  });
});

// ---- handleConversationChat skill 动态工具清理测试 ----

describe("handleConversationChat skill 动态工具清理", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // 辅助：创建 mock sender
  function createMockSender() {
    const sentMessages: any[] = [];
    const mockConn = {
      sendMessage: (msg: any) => sentMessages.push(msg),
      onMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const sender = {
      isType: (type: any) => type === 1, // GetSenderType.CONNECT
      getConnect: () => mockConn,
    };
    return { sender, sentMessages };
  }

  it("对话结束后应清理 meta-tools 和动态注册的 CATTool", async () => {
    const { service, mockRepo, mockSkillRepo } = createTestService();
    const { sender } = createMockSender();

    // 设置 skill 带工具
    const toolRecord = makeCATToolRecord({
      name: "my-tool",
      description: "A tool",
      params: [],
    });
    const skill = makeSkillRecord({
      name: "test-skill",
      toolNames: ["my-tool"],
      referenceNames: [],
      prompt: "Test prompt.",
    });
    (service as any).skillCache.set("test-skill", skill);

    // mock conversation 存在且带 skills
    mockRepo.listConversations.mockResolvedValue([
      {
        id: "conv-1",
        title: "Test",
        modelId: "test-openai",
        skills: "auto",
        createtime: Date.now(),
        updatetime: Date.now(),
      },
    ]);

    // 第一轮 LLM 调用 load_skill → 注册动态工具
    mockSkillRepo.getSkillScripts.mockResolvedValueOnce([toolRecord]);

    // 构造 SSE：LLM 调用 load_skill，然后纯文本结束
    const encoder = new TextEncoder();
    // 第一次 fetch：返回 load_skill tool call
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          const chunks = [
            `data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"load_skill","arguments":""}}]}}]}\n\n`,
            `data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"skill_name\\":\\"test-skill\\"}"}}]}}]}\n\n`,
            `data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n`,
          ];
          let i = 0;
          return {
            read: async () => {
              if (i >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: encoder.encode(chunks[i++]) };
            },
            releaseLock: () => {},
            cancel: async () => {},
            closed: Promise.resolve(undefined),
          };
        },
      },
      text: async () => "",
    } as unknown as Response);

    // 第二次 fetch：纯文本结束
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          const chunks = [
            `data: {"choices":[{"delta":{"content":"完成"}}]}\n\n`,
            `data: {"usage":{"prompt_tokens":20,"completion_tokens":8}}\n\n`,
          ];
          let i = 0;
          return {
            read: async () => {
              if (i >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: encoder.encode(chunks[i++]) };
            },
            releaseLock: () => {},
            cancel: async () => {},
            closed: Promise.resolve(undefined),
          };
        },
      },
      text: async () => "",
    } as unknown as Response);

    const registry = (service as any).toolRegistry;

    // 对话前 registry 不应有 load_skill 和 test-skill__my-tool
    expect(registry.getDefinitions().find((d: any) => d.name === "load_skill")).toBeUndefined();
    expect(registry.getDefinitions().find((d: any) => d.name === "test-skill__my-tool")).toBeUndefined();

    await (service as any).handleConversationChat(
      { conversationId: "conv-1", message: "test" },
      sender
    );

    // 对话后 meta-tools 应已清理
    expect(registry.getDefinitions().find((d: any) => d.name === "load_skill")).toBeUndefined();
    // 动态注册的 CATTool 也应已清理
    expect(registry.getDefinitions().find((d: any) => d.name === "test-skill__my-tool")).toBeUndefined();
  });
});

// ---- init() 消息注册测试 ----

describe("AgentService init() 消息注册", () => {
  it("应注册 installSkill 和 removeSkill 消息处理", () => {
    const mockGroup = { on: vi.fn() } as any;
    const mockSender = {} as any;

    const service = new AgentService(mockGroup, mockSender);

    // 替换 repos 避免 OPFS 调用
    (service as any).catToolRepo = { listTools: vi.fn().mockResolvedValue([]) };
    (service as any).skillRepo = { listSkills: vi.fn().mockResolvedValue([]) };

    service.init();

    // 收集所有 group.on 注册的消息名
    const registeredNames = mockGroup.on.mock.calls.map((call: any[]) => call[0]);

    expect(registeredNames).toContain("installSkill");
    expect(registeredNames).toContain("removeSkill");
  });

  it("installSkill 消息处理应正确转发参数", async () => {
    const mockGroup = { on: vi.fn() } as any;
    const mockSender = {} as any;

    const service = new AgentService(mockGroup, mockSender);

    const mockSkillRepo = {
      listSkills: vi.fn().mockResolvedValue([]),
      getSkill: vi.fn().mockResolvedValue(null),
      saveSkill: vi.fn().mockResolvedValue(undefined),
    };
    (service as any).catToolRepo = { listTools: vi.fn().mockResolvedValue([]) };
    (service as any).skillRepo = mockSkillRepo;

    service.init();

    // 找到 installSkill 处理函数
    const installSkillCall = mockGroup.on.mock.calls.find((call: any[]) => call[0] === "installSkill");
    expect(installSkillCall).toBeDefined();

    const handler = installSkillCall[1];
    const skillMd = `---
name: msg-test
description: Test via message
---
Prompt content.`;

    const result = await handler({ skillMd });

    expect(result.name).toBe("msg-test");
    expect(mockSkillRepo.saveSkill).toHaveBeenCalledTimes(1);
  });

  it("removeSkill 消息处理应正确转发参数", async () => {
    const mockGroup = { on: vi.fn() } as any;
    const mockSender = {} as any;

    const service = new AgentService(mockGroup, mockSender);

    const mockSkillRepo = {
      listSkills: vi.fn().mockResolvedValue([]),
      removeSkill: vi.fn().mockResolvedValue(true),
    };
    (service as any).catToolRepo = { listTools: vi.fn().mockResolvedValue([]) };
    (service as any).skillRepo = mockSkillRepo;

    service.init();

    // 找到 removeSkill 处理函数
    const removeSkillCall = mockGroup.on.mock.calls.find((call: any[]) => call[0] === "removeSkill");
    expect(removeSkillCall).toBeDefined();

    const handler = removeSkillCall[1];
    const result = await handler("msg-test-skill");

    expect(result).toBe(true);
    expect(mockSkillRepo.removeSkill).toHaveBeenCalledWith("msg-test-skill");
  });
});
