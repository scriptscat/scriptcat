import { describe, it, expect, vi } from "vitest";
import { createTestService, VALID_SKILLSCRIPT_CODE, makeSkillRecord, makeSkillScriptRecord } from "./test-helpers";

// ---- Skill 系统测试 ----

describe("AgentService Skill 系统", () => {
  describe("resolveSkills", () => {
    it("无 skills 时返回空", () => {
      const { service } = createTestService();
      const result = (service as any).skillService.resolveSkills(undefined);
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
      (service as any).skillService.skillCache.set("price-monitor", skill1);
      (service as any).skillService.skillCache.set("translator", skill2);

      const result = (service as any).skillService.resolveSkills("auto");

      // promptSuffix 应包含两个 skill 的 name + description
      expect(result.promptSuffix).toContain("price-monitor");
      expect(result.promptSuffix).toContain("监控商品价格");
      expect(result.promptSuffix).toContain("translator");
      expect(result.promptSuffix).toContain("翻译助手");

      // promptSuffix 不应包含 skill.prompt 内容
      expect(result.promptSuffix).not.toContain("Monitor prices.");
      expect(result.promptSuffix).not.toContain("Translate text.");

      // 应返回 3 个 metaTools（load_skill, execute_skill_script, read_reference）
      expect(result.metaTools).toHaveLength(3);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("execute_skill_script");
      expect(names).toContain("read_reference");
    });

    it("指定名称过滤", () => {
      const { service } = createTestService();

      const skill1 = makeSkillRecord({ name: "skill-a", description: "Skill A" });
      const skill2 = makeSkillRecord({ name: "skill-b", description: "Skill B" });
      (service as any).skillService.skillCache.set("skill-a", skill1);
      (service as any).skillService.skillCache.set("skill-b", skill2);

      const result = (service as any).skillService.resolveSkills(["skill-a"]);

      expect(result.promptSuffix).toContain("skill-a");
      expect(result.promptSuffix).toContain("Skill A");
      expect(result.promptSuffix).not.toContain("skill-b");
      expect(result.promptSuffix).not.toContain("Skill B");
    });

    it("无工具/参考资料的 skill 注册 load_skill + execute_skill_script", () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "simple-skill", toolNames: [], referenceNames: [] });
      (service as any).skillService.skillCache.set("simple-skill", skill);

      const result = (service as any).skillService.resolveSkills("auto");

      expect(result.metaTools).toHaveLength(2);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("execute_skill_script");
    });

    it("有工具无参考资料时注册 load_skill + execute_skill_script", () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "tools-only", toolNames: ["my-tool"], referenceNames: [] });
      (service as any).skillService.skillCache.set("tools-only", skill);

      const result = (service as any).skillService.resolveSkills("auto");

      expect(result.metaTools).toHaveLength(2);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("execute_skill_script");
    });

    it("有参考资料无工具时注册 load_skill + execute_skill_script + read_reference", () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "refs-only", toolNames: [], referenceNames: ["doc.md"] });
      (service as any).skillService.skillCache.set("refs-only", skill);

      const result = (service as any).skillService.resolveSkills("auto");

      expect(result.metaTools).toHaveLength(3);
      const names = result.metaTools.map((t: any) => t.definition.name);
      expect(names).toContain("load_skill");
      expect(names).toContain("execute_skill_script");
      expect(names).toContain("read_reference");
    });
  });

  describe("load_skill meta-tool", () => {
    it("返回完整 prompt", async () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "my-skill", prompt: "Detailed instructions here." });
      (service as any).skillService.skillCache.set("my-skill", skill);

      const result = (service as any).skillService.resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      const output = await loadSkill.executor.execute({ skill_name: "my-skill" });
      expect(output).toBe("Detailed instructions here.");
    });

    it("skill 不存在时抛错", async () => {
      const { service } = createTestService();

      const skill = makeSkillRecord({ name: "existing" });
      (service as any).skillService.skillCache.set("existing", skill);

      const result = (service as any).skillService.resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      await expect(loadSkill.executor.execute({ skill_name: "non-existent" })).rejects.toThrow(
        'Skill "non-existent" not found'
      );
    });

    it("load_skill 返回 prompt 并附带脚本描述", async () => {
      const { service, mockSkillRepo } = createTestService();

      const scriptRecord = makeSkillScriptRecord({
        name: "price-check",
        description: "Check price",
        params: [{ name: "url", type: "string", description: "Target URL", required: true }],
        grants: [],
      });
      const skill = makeSkillRecord({ name: "price-skill", toolNames: ["price-check"], prompt: "Monitor prices." });
      (service as any).skillService.skillCache.set("price-skill", skill);

      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([scriptRecord]);

      const result = (service as any).skillService.resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      const output = await loadSkill.executor.execute({ skill_name: "price-skill" });

      // 返回的 prompt 应包含脚本描述信息
      expect(output).toContain("Monitor prices.");
      expect(output).toContain("price-check");
      expect(output).toContain("Check price");
      expect(output).toContain("execute_skill_script");

      // 验证 getSkillScripts 被正确调用
      expect(mockSkillRepo.getSkillScripts).toHaveBeenCalledWith("price-skill");
    });

    it("无工具的 skill 不调用 getSkillScripts", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skill = makeSkillRecord({ name: "no-tools", toolNames: [], prompt: "Simple prompt." });
      (service as any).skillService.skillCache.set("no-tools", skill);

      const result = (service as any).skillService.resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      await loadSkill.executor.execute({ skill_name: "no-tools" });
      expect(mockSkillRepo.getSkillScripts).not.toHaveBeenCalled();
    });

    it("多个脚本应全部包含在 prompt 中", async () => {
      const { service, mockSkillRepo } = createTestService();

      const tool1 = makeSkillScriptRecord({
        name: "extract",
        description: "提取数据",
        params: [{ name: "url", type: "string", description: "URL", required: true }],
      });
      const tool2 = makeSkillScriptRecord({
        name: "compare",
        description: "比较价格",
        params: [
          { name: "a", type: "number", description: "价格A", required: true },
          { name: "b", type: "number", description: "价格B", required: true },
        ],
      });

      const skill = makeSkillRecord({ name: "taobao", toolNames: ["extract", "compare"], prompt: "淘宝助手。" });
      (service as any).skillService.skillCache.set("taobao", skill);

      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([tool1, tool2]);

      const result = (service as any).skillService.resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");

      const output = await loadSkill.executor.execute({ skill_name: "taobao" });

      // prompt 应包含所有脚本的描述
      expect(output).toContain("extract");
      expect(output).toContain("提取数据");
      expect(output).toContain("compare");
      expect(output).toContain("比较价格");
    });

    it("重复 load_skill 同一 skill 应幂等（返回缓存 prompt）", async () => {
      const { service, mockSkillRepo } = createTestService();

      const scriptRecord = makeSkillScriptRecord({
        name: "my-tool",
        description: "V1",
        params: [],
      });
      const skill = makeSkillRecord({ name: "my-skill", toolNames: ["my-tool"], prompt: "My prompt." });
      (service as any).skillService.skillCache.set("my-skill", skill);

      // 第一次 load
      mockSkillRepo.getSkillScripts.mockResolvedValueOnce([scriptRecord]);
      const result = (service as any).skillService.resolveSkills("auto");
      const loadSkill = result.metaTools.find((t: any) => t.definition.name === "load_skill");
      await loadSkill.executor.execute({ skill_name: "my-skill" });

      // 第二次 load 应直接返回 prompt（不再调用 getSkillScripts）
      const output2 = await loadSkill.executor.execute({ skill_name: "my-skill" });

      expect(output2).toBe(skill.prompt);
      // getSkillScripts 只应被调用一次（第一次 load 时）
      expect(mockSkillRepo.getSkillScripts).toHaveBeenCalledTimes(1);
    });
  });

  describe("read_reference meta-tool", () => {
    it("正常返回参考资料内容", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skill = makeSkillRecord({ name: "ref-skill", referenceNames: ["api-doc"] });
      (service as any).skillService.skillCache.set("ref-skill", skill);

      mockSkillRepo.getReference.mockResolvedValueOnce({ name: "api-doc", content: "API documentation content" });

      const result = (service as any).skillService.resolveSkills("auto");
      const readRef = result.metaTools.find((t: any) => t.definition.name === "read_reference");

      const output = await readRef.executor.execute({ skill_name: "ref-skill", reference_name: "api-doc" });
      expect(output).toBe("API documentation content");
      expect(mockSkillRepo.getReference).toHaveBeenCalledWith("ref-skill", "api-doc");
    });

    it("不存在时抛错", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skill = makeSkillRecord({ name: "ref-skill", referenceNames: ["doc"] });
      (service as any).skillService.skillCache.set("ref-skill", skill);

      mockSkillRepo.getReference.mockResolvedValueOnce(null);

      const result = (service as any).skillService.resolveSkills("auto");
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
      expect((service as any).skillService.skillCache.has("integrated-skill")).toBe(true);

      const result = (service as any).skillService.resolveSkills("auto");
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
      (service as any).skillService.skillCache.set("to-remove", skill);

      mockSkillRepo.removeSkill.mockResolvedValueOnce(true);

      await service.removeSkill("to-remove");

      // skillCache 应不再包含
      expect((service as any).skillService.skillCache.has("to-remove")).toBe(false);

      const result = (service as any).skillService.resolveSkills("auto");
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
          code: VALID_SKILLSCRIPT_CODE,
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
      expect((service as any).skillService.skillCache.has("full-skill")).toBe(true);
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

      await expect(service.installSkill("not valid skill md")).rejects.toThrow("Invalid SKILL.cat.md");
    });

    it("含无效 Skill Script 时应抛出异常", async () => {
      const { service } = createTestService();

      const skillMd = `---
name: bad-scripts
description: Has invalid script
---
Some prompt.`;

      await expect(service.installSkill(skillMd, [{ name: "bad-tool", code: "not a skillscript" }])).rejects.toThrow(
        "Invalid SkillScript"
      );
    });
  });

  describe("removeSkill", () => {
    it("删除存在的 Skill 返回 true", async () => {
      const { service, mockSkillRepo } = createTestService();

      (service as any).skillService.skillCache.set("to-delete", makeSkillRecord({ name: "to-delete" }));
      mockSkillRepo.removeSkill.mockResolvedValueOnce(true);

      const result = await service.removeSkill("to-delete");

      expect(result).toBe(true);
      expect(mockSkillRepo.removeSkill).toHaveBeenCalledWith("to-delete");
      expect((service as any).skillService.skillCache.has("to-delete")).toBe(false);
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
        scripts: [{ name: "taobao_extract.js", code: VALID_SKILLSCRIPT_CODE }],
        references: [
          { name: "api_docs.md", content: "# API Docs\n淘宝接口文档" },
          { name: "guide.txt", content: "使用指南" },
        ],
      };

      const record = await service.installSkill(zipResult.skillMd, zipResult.scripts, zipResult.references);

      expect(record.name).toBe("taobao-helper");
      expect(record.description).toBe("淘宝购物助手");
      expect(record.prompt).toBe("你是一个淘宝购物助手。");
      expect(record.toolNames).toEqual(["test-tool"]); // 脚本名称从 ==SkillScript== metadata 中解析
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
      expect((service as any).skillService.skillCache.has("taobao-helper")).toBe(true);
    });

    it("ZIP 结果中多个脚本应全部安装", async () => {
      const { service, mockSkillRepo } = createTestService();

      const anotherToolCode = `// ==SkillScript==
// @name another-tool
// @description Another tool
// @param {string} query - Search query
// ==/SkillScript==
return query;`;

      const record = await service.installSkill(
        `---\nname: multi-tool\ndescription: Multi tools skill\n---\nMulti tool prompt.`,
        [
          { name: "tool1.js", code: VALID_SKILLSCRIPT_CODE },
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

  describe("installSkill version 和 installUrl", () => {
    it("应正确保存 version 字段", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skillMd = `---
name: versioned
description: test
version: 1.2.3
---
Prompt.`;

      const record = await (service as any).skillService.installSkill(skillMd);
      expect(record.version).toBe("1.2.3");
      expect(mockSkillRepo.saveSkill.mock.calls[0][0].version).toBe("1.2.3");
    });

    it("应正确保存 installUrl", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skillMd = `---
name: from-url
description: test
version: 1.0.0
---
Prompt.`;
      const url = "https://example.com/skills/test/SKILL.cat.md";

      const record = await (service as any).skillService.installSkill(skillMd, undefined, undefined, url);
      expect(record.installUrl).toBe(url);
      expect(mockSkillRepo.saveSkill.mock.calls[0][0].installUrl).toBe(url);
    });

    it("无 version 时 record.version 应为 undefined", async () => {
      const { service } = createTestService();

      const skillMd = `---
name: no-ver
description: test
---
Prompt.`;

      const record = await (service as any).skillService.installSkill(skillMd);
      expect(record.version).toBeUndefined();
    });
  });

  describe("installFromUrl", () => {
    it("应从 URL 获取 SKILL.cat.md 并安装", async () => {
      const { service } = createTestService();

      const skillMd = `---
name: remote-skill
description: Remote skill
version: 2.0.0
scripts:
  - helper.js
references:
  - docs.md
---
Remote prompt.`;

      const scriptCode = VALID_SKILLSCRIPT_CODE;
      const refContent = "# Docs\nSome docs.";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.endsWith("SKILL.cat.md")) {
          return { ok: true, text: async () => skillMd } as Response;
        }
        if (urlStr.includes("scripts/helper.js")) {
          return { ok: true, text: async () => scriptCode } as Response;
        }
        if (urlStr.includes("references/docs.md")) {
          return { ok: true, text: async () => refContent } as Response;
        }
        return { ok: false, status: 404, statusText: "Not Found" } as Response;
      });

      try {
        const record = await (service as any).skillService.installFromUrl(
          "https://example.com/skills/test/SKILL.cat.md"
        );

        expect(record.name).toBe("remote-skill");
        expect(record.version).toBe("2.0.0");
        expect(record.installUrl).toBe("https://example.com/skills/test/SKILL.cat.md");
        expect(record.toolNames).toEqual(["test-tool"]);
        expect(record.referenceNames).toEqual(["docs.md"]);

        // 验证 fetch 调用了正确的相对路径
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        const urls = fetchSpy.mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : c[0].toString()));
        expect(urls).toContain("https://example.com/skills/test/SKILL.cat.md");
        expect(urls).toContain("https://example.com/skills/test/scripts/helper.js");
        expect(urls).toContain("https://example.com/skills/test/references/docs.md");
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("SKILL.cat.md 获取失败时应抛错", async () => {
      const { service } = createTestService();

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      try {
        await expect(
          (service as any).skillService.installFromUrl("https://example.com/not-found.cat.md")
        ).rejects.toThrow("Failed to fetch");
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("checkForUpdates / updateSkill", () => {
    it("远程版本更高时应返回更新信息", async () => {
      const { service, mockSkillRepo } = createTestService();

      const skillList = [{ name: "updatable", version: "1.0.0", installUrl: "https://example.com/SKILL.cat.md" }];
      mockSkillRepo.listSkills.mockResolvedValue(skillList);

      const remoteMd = `---
name: updatable
description: test
version: 2.0.0
---
Updated prompt.`;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: async () => remoteMd,
      } as Response);

      try {
        const updates = await (service as any).skillService.checkForUpdates();
        expect(updates).toHaveLength(1);
        expect(updates[0].name).toBe("updatable");
        expect(updates[0].currentVersion).toBe("1.0.0");
        expect(updates[0].remoteVersion).toBe("2.0.0");
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("远程版本相同或更低时不返回更新", async () => {
      const { service, mockSkillRepo } = createTestService();

      mockSkillRepo.listSkills.mockResolvedValue([
        { name: "up-to-date", version: "2.0.0", installUrl: "https://example.com/SKILL.cat.md" },
      ]);

      const remoteMd = `---
name: up-to-date
description: test
version: 2.0.0
---
Same prompt.`;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: async () => remoteMd,
      } as Response);

      try {
        const updates = await (service as any).skillService.checkForUpdates();
        expect(updates).toHaveLength(0);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("无 installUrl 的 Skill 不参与更新检查", async () => {
      const { service, mockSkillRepo } = createTestService();

      mockSkillRepo.listSkills.mockResolvedValue([
        { name: "local-only", version: "1.0.0" },
        { name: "no-version", installUrl: "https://example.com/SKILL.cat.md" },
      ]);

      const updates = await (service as any).skillService.checkForUpdates();
      expect(updates).toHaveLength(0);
    });

    it("网络错误时静默忽略", async () => {
      const { service, mockSkillRepo } = createTestService();

      mockSkillRepo.listSkills.mockResolvedValue([
        { name: "net-err", version: "1.0.0", installUrl: "https://example.com/SKILL.cat.md" },
      ]);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

      try {
        const updates = await (service as any).skillService.checkForUpdates();
        expect(updates).toHaveLength(0);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("updateSkill 应从 installUrl 重新安装", async () => {
      const { service, mockSkillRepo } = createTestService();

      const url = "https://example.com/skills/test/SKILL.cat.md";
      mockSkillRepo.listSkills.mockResolvedValue([{ name: "to-update", version: "1.0.0", installUrl: url }]);

      const remoteMd = `---
name: to-update
description: updated
version: 2.0.0
---
Updated.`;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: async () => remoteMd,
      } as Response);

      try {
        const record = await (service as any).skillService.updateSkill("to-update");
        expect(record.name).toBe("to-update");
        expect(record.version).toBe("2.0.0");
        expect(record.installUrl).toBe(url);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("无 installUrl 的 Skill 调用 updateSkill 应抛错", async () => {
      const { service, mockSkillRepo } = createTestService();

      mockSkillRepo.listSkills.mockResolvedValue([{ name: "local-only", version: "1.0.0" }]);

      await expect((service as any).skillService.updateSkill("local-only")).rejects.toThrow("no install URL");
    });
  });
});
