import type { MessageSend } from "@Packages/message/types";
import type {
  SkillApiRequest,
  SkillMetadata,
  SkillRecord,
  SkillScriptRecord,
  SkillSummary,
  ToolDefinition,
} from "@App/app/service/agent/core/types";
import { SkillRepo } from "@App/app/repo/skill_repo";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import { parseSkillMd, parseSkillZip } from "@App/pkg/utils/skill";
import { SkillScriptExecutor } from "@App/app/service/agent/core/skill_script_executor";
import { CACHE_KEY_SKILL_INSTALL } from "@App/app/cache_key";
import { SKILL_SUFFIX_HEADER } from "@App/app/service/agent/core/system_prompt";
import { cacheInstance } from "@App/app/cache";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import type { ResourceService } from "@App/app/service/service_worker/resource";
import { versionCompare } from "@App/pkg/utils/semver";

// 更新检查结果
export type SkillUpdateInfo = {
  name: string;
  currentVersion: string;
  remoteVersion: string;
  installUrl: string;
};

export class SkillService {
  // 已加载的 Skill 缓存
  skillCache = new Map<string, SkillRecord>();
  skillRepo: SkillRepo;

  constructor(
    private sender: MessageSend,
    private resourceService: ResourceService | undefined,
    skillRepo?: SkillRepo
  ) {
    this.skillRepo = skillRepo ?? new SkillRepo();
  }

  // 创建 require 资源加载器，从 ResourceDAO 缓存中读取已下载的资源内容
  private createRequireLoader(): ((url: string) => Promise<string | undefined>) | undefined {
    if (!this.resourceService) return undefined;
    const rs = this.resourceService;
    return async (url: string) => {
      const res = await rs.getResource("skillscript-require", url, "require", false);
      return res?.content as string | undefined;
    };
  }

  // ---- Skill 管理 ----

  // 从 OPFS 加载所有 Skill 到缓存
  async loadSkills() {
    try {
      const summaries = await this.skillRepo.listSkills();
      for (const summary of summaries) {
        const record = await this.skillRepo.getSkill(summary.name);
        if (record) {
          // 从 registry 同步 enabled 状态到缓存
          if (summary.enabled !== undefined) {
            record.enabled = summary.enabled;
          }
          this.skillCache.set(record.name, record);
        }
      }
    } catch {
      // OPFS 可能不可用，静默忽略
    }
  }

  // 安装 Skill
  async installSkill(
    skillMd: string,
    scripts?: Array<{ name: string; code: string }>,
    references?: Array<{ name: string; content: string }>,
    installUrl?: string
  ): Promise<SkillRecord> {
    const parsed = parseSkillMd(skillMd);
    if (!parsed) {
      throw new Error("Invalid SKILL.cat.md: missing or malformed frontmatter");
    }

    // 解析 SkillScript 脚本
    const toolRecords: SkillScriptRecord[] = [];
    const toolNames: string[] = [];
    if (scripts) {
      for (const script of scripts) {
        const metadata = parseSkillScriptMetadata(script.code);
        if (!metadata) {
          throw new Error(`Invalid SkillScript "${script.name}": missing ==SkillScript== header`);
        }
        // 下载并缓存 @require 资源
        if (metadata.requires.length > 0 && this.resourceService) {
          const dummyUuid = "skillscript-require";
          await Promise.all(
            metadata.requires.map((url) => this.resourceService!.getResource(dummyUuid, url, "require", true))
          );
        }
        toolNames.push(metadata.name);
        const now = Date.now();
        toolRecords.push({
          id: uuidv4(),
          name: metadata.name,
          description: metadata.description,
          params: metadata.params,
          grants: metadata.grants,
          requires: metadata.requires.length > 0 ? metadata.requires : undefined,
          timeout: metadata.timeout,
          code: script.code,
          installtime: now,
          updatetime: now,
        });
      }
    }

    const referenceNames = references?.map((r) => r.name) || [];

    const now = Date.now();
    const existing = await this.skillRepo.getSkill(parsed.metadata.name);
    const record: SkillRecord = {
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      ...(parsed.metadata.version ? { version: parsed.metadata.version } : {}),
      toolNames,
      referenceNames,
      prompt: parsed.prompt,
      ...(parsed.metadata.config ? { config: parsed.metadata.config } : {}),
      ...(installUrl ? { installUrl } : {}),
      installtime: existing?.installtime || now,
      updatetime: now,
    };

    const skillRefs = references?.map((r) => ({ name: r.name, content: r.content }));
    await this.skillRepo.saveSkill(record, toolRecords, skillRefs);
    this.skillCache.set(record.name, record);

    return record;
  }

  // ---- URL 安装与更新 ----

  // 根据 SKILL.cat.md URL 的基路径获取相对资源
  private resolveSkillUrl(skillMdUrl: string, relativePath: string): string {
    const base = skillMdUrl.substring(0, skillMdUrl.lastIndexOf("/") + 1);
    return base + relativePath;
  }

  // 从 URL 获取文本内容
  private async fetchText(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
    }
    return resp.text();
  }

  /**
   * 从 URL 获取 SKILL.cat.md 及其声明的 scripts/references
   */
  private async fetchSkillResources(url: string): Promise<{
    skillMd: string;
    parsed: { metadata: SkillMetadata; prompt: string };
    scripts: Array<{ name: string; code: string }>;
    references: Array<{ name: string; content: string }>;
  }> {
    const skillMd = await this.fetchText(url);
    const parsed = parseSkillMd(skillMd);
    if (!parsed) {
      throw new Error("Invalid SKILL.cat.md: missing or malformed frontmatter");
    }

    // 获取 frontmatter 中声明的 scripts
    const scripts: Array<{ name: string; code: string }> = [];
    if (parsed.metadata.scripts?.length) {
      for (const fileName of parsed.metadata.scripts) {
        const scriptUrl = this.resolveSkillUrl(url, `scripts/${fileName}`);
        const code = await this.fetchText(scriptUrl);
        scripts.push({ name: fileName, code });
      }
    }

    // 获取 frontmatter 中声明的 references
    const references: Array<{ name: string; content: string }> = [];
    if (parsed.metadata.references?.length) {
      for (const fileName of parsed.metadata.references) {
        const refUrl = this.resolveSkillUrl(url, `references/${fileName}`);
        const content = await this.fetchText(refUrl);
        references.push({ name: fileName, content });
      }
    }

    return { skillMd, parsed, scripts, references };
  }

  // 从 URL 安装 Skill（获取 SKILL.cat.md + 声明的 scripts/references）
  async installFromUrl(url: string): Promise<SkillRecord> {
    const { skillMd, scripts, references } = await this.fetchSkillResources(url);
    return this.installSkill(skillMd, scripts, references, url);
  }

  // 检查单个 Skill 是否有更新（返回 null 表示无更新或无法检查）
  async checkSkillUpdate(name: string): Promise<SkillUpdateInfo | null> {
    const summary = (await this.skillRepo.listSkills()).find((s) => s.name === name);
    if (!summary?.installUrl || !summary.version) return null;

    try {
      const remoteMd = await this.fetchText(summary.installUrl);
      const parsed = parseSkillMd(remoteMd);
      if (!parsed?.metadata.version) return null;

      if (versionCompare(parsed.metadata.version, summary.version) > 0) {
        return {
          name,
          currentVersion: summary.version,
          remoteVersion: parsed.metadata.version,
          installUrl: summary.installUrl,
        };
      }
    } catch {
      // 网络错误静默忽略
    }
    return null;
  }

  // 检查所有有 installUrl 的 Skill 的更新
  async checkForUpdates(): Promise<SkillUpdateInfo[]> {
    const summaries = await this.skillRepo.listSkills();
    const updatable = summaries.filter((s) => s.installUrl && s.version);
    const results = await Promise.allSettled(updatable.map((s) => this.checkSkillUpdate(s.name)));
    return results
      .filter((r): r is PromiseFulfilledResult<SkillUpdateInfo | null> => r.status === "fulfilled" && r.value != null)
      .map((r) => r.value!);
  }

  // 更新单个 Skill（从 installUrl 重新安装）
  async updateSkill(name: string): Promise<SkillRecord> {
    const summary = (await this.skillRepo.listSkills()).find((s) => s.name === name);
    if (!summary?.installUrl) {
      throw new Error(`Skill "${name}" has no install URL, cannot update`);
    }
    return this.installFromUrl(summary.installUrl);
  }

  // 卸载 Skill
  async removeSkill(name: string): Promise<boolean> {
    const removed = await this.skillRepo.removeSkill(name);
    if (removed) {
      this.skillCache.delete(name);
    }
    return removed;
  }

  // 刷新单个 Skill 缓存（从 OPFS 重新加载）
  async refreshSkill(name: string): Promise<boolean> {
    const record = await this.skillRepo.getSkill(name);
    if (record) {
      this.skillCache.set(record.name, record);
      return true;
    }
    this.skillCache.delete(name);
    return false;
  }

  // 启用/禁用 Skill
  async setSkillEnabled(name: string, enabled: boolean): Promise<boolean> {
    return this.skillRepo.setSkillEnabled(name, enabled);
  }

  // 缓存 Skill ZIP 数据，返回 uuid，供安装页面获取
  async prepareSkillInstall(zipBase64: string): Promise<string> {
    const uuid = uuidv4();
    await cacheInstance.set(CACHE_KEY_SKILL_INSTALL + uuid, zipBase64);
    return uuid;
  }

  // 从 URL 获取 Skill 并缓存，返回 uuid，供安装页面获取
  async prepareSkillFromUrl(url: string): Promise<string> {
    const { skillMd, scripts, references } = await this.fetchSkillResources(url);
    const uuid = uuidv4();
    // 缓存已解析的数据（对象格式，区别于 ZIP 的 base64 字符串格式）
    await cacheInstance.set(CACHE_KEY_SKILL_INSTALL + uuid, {
      skillMd,
      scripts,
      references,
      installUrl: url,
    });
    return uuid;
  }

  // 缓存的 URL 安装数据格式
  private isUrlInstallCache(data: unknown): data is {
    skillMd: string;
    scripts: Array<{ name: string; code: string }>;
    references: Array<{ name: string; content: string }>;
    installUrl: string;
  } {
    return typeof data === "object" && data !== null && "skillMd" in data;
  }

  // 获取缓存的 Skill 安装数据并解析（支持 ZIP base64 和 URL 两种缓存格式）
  async getSkillInstallData(uuid: string): Promise<{
    skillMd: string;
    metadata: SkillMetadata;
    prompt: string;
    scripts: Array<{ name: string; code: string }>;
    references: Array<{ name: string; content: string }>;
    isUpdate: boolean;
    installUrl?: string;
  }> {
    const cached = await cacheInstance.get<string | object>(CACHE_KEY_SKILL_INSTALL + uuid);
    if (!cached) {
      throw new Error("Skill install data not found or expired");
    }

    let skillMd: string;
    let scripts: Array<{ name: string; code: string }>;
    let references: Array<{ name: string; content: string }>;
    let installUrl: string | undefined;

    if (this.isUrlInstallCache(cached)) {
      // URL 安装缓存：已解析的对象
      skillMd = cached.skillMd;
      scripts = cached.scripts;
      references = cached.references;
      installUrl = cached.installUrl;
    } else if (typeof cached === "string") {
      // ZIP 安装缓存：base64 字符串
      const binaryStr = atob(cached);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const result = await parseSkillZip(bytes.buffer);
      skillMd = result.skillMd;
      scripts = result.scripts;
      references = result.references;
    } else {
      throw new Error("Invalid cached skill data format");
    }

    const parsed = parseSkillMd(skillMd);
    if (!parsed) {
      throw new Error("Invalid SKILL.cat.md format");
    }
    const existing = await this.skillRepo.getSkill(parsed.metadata.name);
    return {
      skillMd,
      metadata: parsed.metadata,
      prompt: parsed.prompt,
      scripts,
      references,
      isUpdate: !!existing,
      installUrl,
    };
  }

  // Skill 安装页面确认安装
  async completeSkillInstall(uuid: string): Promise<SkillRecord> {
    const data = await this.getSkillInstallData(uuid);
    const record = await this.installSkill(data.skillMd, data.scripts, data.references, data.installUrl);
    await cacheInstance.del(CACHE_KEY_SKILL_INSTALL + uuid);
    return record;
  }

  // Skill 安装页面取消
  async cancelSkillInstall(uuid: string): Promise<void> {
    await cacheInstance.del(CACHE_KEY_SKILL_INSTALL + uuid);
  }

  // 处理 CAT.agent.skills API 请求
  async handleSkillsApi(request: SkillApiRequest): Promise<SkillSummary[] | SkillRecord | null | boolean | unknown> {
    switch (request.action) {
      case "list":
        return this.skillRepo.listSkills();
      case "get":
        return this.skillRepo.getSkill(request.name);
      case "install":
        return this.installSkill(request.skillMd, request.scripts, request.references);
      case "remove":
        return this.removeSkill(request.name);
      case "call": {
        const { skillName, scriptName, params } = request;
        const skillRecord = await this.skillRepo.getSkill(skillName);
        if (!skillRecord) {
          throw new Error(`Skill "${skillName}" not found`);
        }
        const scripts = await this.skillRepo.getSkillScripts(skillName);
        const script = scripts.find((s) => s.name === scriptName);
        if (!script) {
          throw new Error(`Script "${scriptName}" not found in skill "${skillName}"`);
        }
        const configValues = skillRecord.config ? await this.skillRepo.getConfigValues(skillName) : undefined;
        const executor = new SkillScriptExecutor(script, this.sender, this.createRequireLoader(), configValues);
        return executor.execute(params || {});
      }
      default:
        throw new Error(`Unknown skills action: ${(request as any).action}`);
    }
  }

  // 解析对话关联的 skills，返回 system prompt 附加内容和 meta-tool 定义
  // 两层渐进加载：1) system prompt 只注入摘要 2) load_skill 按需加载完整提示词及脚本描述
  resolveSkills(skills?: "auto" | string[]): {
    promptSuffix: string;
    metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
  } {
    if (!skills) {
      return { promptSuffix: "", metaTools: [] };
    }

    // 确定要加载的 skill 列表
    let skillRecords: SkillRecord[];
    if (skills === "auto") {
      // auto 模式只加载已启用的 skill（enabled 为 undefined 视为启用）
      skillRecords = Array.from(this.skillCache.values()).filter((r) => r.enabled !== false);
    } else {
      // 显式指定名称时不过滤 enabled 状态
      skillRecords = skills.map((name) => this.skillCache.get(name)).filter((r): r is SkillRecord => r != null);
    }

    if (skillRecords.length === 0) {
      return { promptSuffix: "", metaTools: [] };
    }

    // 构建 prompt 后缀：只包含 name + description 摘要
    const promptParts: string[] = [SKILL_SUFFIX_HEADER];

    // 检查是否有任何参考资料
    let hasReferences = false;

    for (const skill of skillRecords) {
      const toolHint = skill.toolNames.length > 0 ? ` (scripts: ${skill.toolNames.join(", ")})` : "";
      const refHint = skill.referenceNames.length > 0 ? ` [has references]` : "";
      promptParts.push(`- **${skill.name}**: ${skill.description || "(no description)"}${toolHint}${refHint}`);
      if (skill.referenceNames.length > 0) hasReferences = true;
    }

    // 构建 meta-tools
    const metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [];

    // 已加载的 skill 名，避免重复加载
    const loadedSkills = new Set<string>();

    // load_skill — 始终注册
    metaTools.push({
      definition: {
        name: "load_skill",
        description:
          "Load a skill's full instructions. MUST be called before using any skill. Returns the skill's detailed prompt and a description of available scripts that can be executed via `execute_skill_script`.",
        parameters: {
          type: "object",
          properties: {
            skill_name: { type: "string", description: "Name of the skill to load" },
          },
          required: ["skill_name"],
        },
      },
      executor: {
        execute: async (args: Record<string, unknown>) => {
          const skillName = args.skill_name as string;
          const record = this.skillCache.get(skillName);
          if (!record) {
            throw new Error(`Skill "${skillName}" not found`);
          }
          if (loadedSkills.has(skillName)) {
            return record.prompt;
          }
          loadedSkills.add(skillName);
          // 拼接脚本描述到 prompt（供 LLM 了解可用脚本及参数）
          let prompt = record.prompt;
          if (record.toolNames.length > 0) {
            const toolRecords = await this.skillRepo.getSkillScripts(skillName);
            if (toolRecords.length > 0) {
              prompt += "\n\n## Available Scripts\n\nUse `execute_skill_script` to run these scripts:\n";
              for (const tool of toolRecords) {
                prompt += `\n### ${tool.name}\n${tool.description}\n`;
                if (tool.params.length > 0) {
                  prompt += "\nParameters:\n";
                  for (const p of tool.params) {
                    const req = p.required ? " (required)" : "";
                    const enumStr = p.enum ? ` [${p.enum.join(", ")}]` : "";
                    prompt += `- \`${p.name}\` (${p.type}${enumStr})${req}: ${p.description}\n`;
                  }
                }
              }
            }
          }
          return prompt;
        },
      },
    });

    // execute_skill_script — 始终注册
    metaTools.push({
      definition: {
        name: "execute_skill_script",
        description: "Execute a script belonging to a loaded skill. The skill must be loaded first via `load_skill`.",
        parameters: {
          type: "object",
          properties: {
            skill: { type: "string", description: "Name of the skill that owns the script" },
            script: { type: "string", description: "Name of the script to execute" },
            params: {
              type: "object",
              description: "Parameters to pass to the script (as defined in the script's metadata)",
            },
          },
          required: ["skill", "script"],
        },
      },
      executor: {
        execute: async (args: Record<string, unknown>) => {
          const skillName = args.skill as string;
          const scriptName = args.script as string;
          const params = (args.params || {}) as Record<string, unknown>;
          if (!loadedSkills.has(skillName)) {
            throw new Error(`Skill "${skillName}" is not loaded. Call load_skill first.`);
          }
          const toolRecords = await this.skillRepo.getSkillScripts(skillName);
          const scriptRecord = toolRecords.find((t) => t.name === scriptName);
          if (!scriptRecord) {
            throw new Error(`Script "${scriptName}" not found in skill "${skillName}"`);
          }
          const configValues = this.skillCache.get(skillName)?.config
            ? await this.skillRepo.getConfigValues(skillName)
            : undefined;
          const executor = new SkillScriptExecutor(scriptRecord, this.sender, this.createRequireLoader(), configValues);
          return executor.execute(params);
        },
      },
    });

    // read_reference — 有参考资料时才注册
    if (hasReferences) {
      metaTools.push({
        definition: {
          name: "read_reference",
          description:
            "Read a reference document belonging to a skill (e.g. API docs, examples). The skill must be loaded first via `load_skill`.",
          parameters: {
            type: "object",
            properties: {
              skill_name: { type: "string", description: "Name of the skill that owns the reference" },
              reference_name: { type: "string", description: "Name of the reference document to read" },
            },
            required: ["skill_name", "reference_name"],
          },
        },
        executor: {
          execute: async (args: Record<string, unknown>) => {
            const skillName = args.skill_name as string;
            const refName = args.reference_name as string;
            const ref = await this.skillRepo.getReference(skillName, refName);
            if (!ref) {
              throw new Error(`Reference "${refName}" not found in skill "${skillName}"`);
            }
            return ref.content;
          },
        },
      });
    }

    return { promptSuffix: promptParts.join("\n"), metaTools };
  }
}
