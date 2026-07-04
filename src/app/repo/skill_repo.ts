import type { SkillScriptRecord, SkillRecord, SkillReference, SkillSummary } from "@App/app/service/agent/core/types";
import { OPFSRepo } from "./opfs_repo";

const REGISTRY_FILE = "registry.json";
const DATA_DIR = "data";
const SCRIPTS_DIR = "scripts";
const REFERENCES_DIR = "references";
const CONFIG_VALUES_FILE = "config_values.json";

// 目录结构：
// agents/skills/registry.json — SkillSummary[]
// agents/skills/data/{sanitized_name}/
//   skill.json — SkillRecord
//   scripts/{toolname}.json — SkillScriptRecord
//   references/{name}.json — { name, content }
export class SkillRepo extends OPFSRepo {
  constructor() {
    super("skills");
  }

  // 将名称转为安全的目录名，过滤路径分隔符和特殊字符
  static sanitizeName(name: string): string {
    return name.replace(/[/\\:*?"<>|.]/g, "_");
  }

  private async getDataDir(): Promise<FileSystemDirectoryHandle> {
    return this.getChildDir(DATA_DIR);
  }

  private async getSkillDir(name: string): Promise<FileSystemDirectoryHandle> {
    return this.getChildDir(`${DATA_DIR}/${SkillRepo.sanitizeName(name)}`);
  }

  private async readRegistry(): Promise<SkillSummary[]> {
    return this.readJsonFile<SkillSummary[]>(REGISTRY_FILE, []);
  }

  private async writeRegistry(summaries: SkillSummary[]): Promise<void> {
    await this.writeJsonFile(REGISTRY_FILE, summaries);
  }

  async listSkills(): Promise<SkillSummary[]> {
    return this.readRegistry();
  }

  async getSkill(name: string): Promise<SkillRecord | null> {
    const registry = await this.readRegistry();
    if (!registry.find((s) => s.name === name)) return null;
    const skillDir = await this.getSkillDir(name);
    return this.readJsonFile<SkillRecord | null>("skill.json", null, skillDir);
  }

  async saveSkill(record: SkillRecord, scripts?: SkillScriptRecord[], references?: SkillReference[]): Promise<void> {
    const skillDir = await this.getSkillDir(record.name);

    // 写 skill.json
    await this.writeJsonFile("skill.json", record, skillDir);

    // 写 scripts（先清空旧文件再写入，防止更新后残留旧工具）
    if (scripts) {
      const sanitized = SkillRepo.sanitizeName(record.name);
      await this.removeDirectory(SCRIPTS_DIR, await this.getSkillDir(record.name));
      if (scripts.length > 0) {
        const scriptsDir = await this.getChildDir(`${DATA_DIR}/${sanitized}/${SCRIPTS_DIR}`);
        for (const script of scripts) {
          await this.writeJsonFile(`${script.name}.json`, script, scriptsDir);
        }
      }
    }

    // 写 references（先清空旧文件再写入）
    if (references) {
      const sanitized = SkillRepo.sanitizeName(record.name);
      await this.removeDirectory(REFERENCES_DIR, await this.getSkillDir(record.name));
      if (references.length > 0) {
        const refsDir = await this.getChildDir(`${DATA_DIR}/${sanitized}/${REFERENCES_DIR}`);
        for (const ref of references) {
          await this.writeJsonFile(`${ref.name}.json`, ref, refsDir);
        }
      }
    }

    // 更新 registry
    const registry = await this.readRegistry();
    const idx = registry.findIndex((s) => s.name === record.name);
    const summary: SkillSummary = {
      name: record.name,
      description: record.description,
      ...(record.version ? { version: record.version } : {}),
      toolNames: record.toolNames,
      referenceNames: record.referenceNames,
      ...(record.config && Object.keys(record.config).length > 0 ? { hasConfig: true } : {}),
      // 保留已有的 enabled 状态
      ...(idx >= 0 && registry[idx].enabled !== undefined ? { enabled: registry[idx].enabled } : {}),
      // 保留或更新 installUrl
      ...(record.installUrl
        ? { installUrl: record.installUrl }
        : idx >= 0 && registry[idx].installUrl
          ? { installUrl: registry[idx].installUrl }
          : {}),
      installtime: record.installtime,
      updatetime: record.updatetime,
    };
    if (idx >= 0) {
      registry[idx] = summary;
    } else {
      registry.push(summary);
    }
    await this.writeRegistry(registry);
  }

  async removeSkill(name: string): Promise<boolean> {
    const registry = await this.readRegistry();
    if (!registry.find((s) => s.name === name)) return false;

    // 先更新 registry
    const filtered = registry.filter((s) => s.name !== name);
    await this.writeRegistry(filtered);

    // 再删除整个 data/{sanitized_name}/ 目录
    const dataDir = await this.getDataDir();
    await this.removeDirectory(SkillRepo.sanitizeName(name), dataDir);

    return true;
  }

  async getSkillScripts(name: string): Promise<SkillScriptRecord[]> {
    try {
      const scriptsDir = await this.getChildDir(`${DATA_DIR}/${SkillRepo.sanitizeName(name)}/${SCRIPTS_DIR}`);
      const files = await this.listFiles(scriptsDir);
      const records: SkillScriptRecord[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const record = await this.readJsonFile<SkillScriptRecord | null>(file, null, scriptsDir);
        if (record) records.push(record);
      }
      return records;
    } catch {
      return [];
    }
  }

  async getSkillReferences(name: string): Promise<SkillReference[]> {
    try {
      const refsDir = await this.getChildDir(`${DATA_DIR}/${SkillRepo.sanitizeName(name)}/${REFERENCES_DIR}`);
      const files = await this.listFiles(refsDir);
      const refs: SkillReference[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const ref = await this.readJsonFile<SkillReference | null>(file, null, refsDir);
        if (ref) refs.push(ref);
      }
      return refs;
    } catch {
      return [];
    }
  }

  async getReference(skillName: string, refName: string): Promise<SkillReference | null> {
    try {
      const refsDir = await this.getChildDir(`${DATA_DIR}/${SkillRepo.sanitizeName(skillName)}/${REFERENCES_DIR}`);
      return this.readJsonFile<SkillReference | null>(`${refName}.json`, null, refsDir);
    } catch {
      return null;
    }
  }

  async setSkillEnabled(name: string, enabled: boolean): Promise<boolean> {
    const registry = await this.readRegistry();
    const idx = registry.findIndex((s) => s.name === name);
    if (idx < 0) return false;
    registry[idx].enabled = enabled;
    await this.writeRegistry(registry);
    return true;
  }

  async getConfigValues(name: string): Promise<Record<string, unknown>> {
    try {
      const skillDir = await this.getSkillDir(name);
      return this.readJsonFile<Record<string, unknown>>(CONFIG_VALUES_FILE, {}, skillDir);
    } catch {
      return {};
    }
  }

  async saveConfigValues(name: string, values: Record<string, unknown>): Promise<void> {
    const skillDir = await this.getSkillDir(name);
    await this.writeJsonFile(CONFIG_VALUES_FILE, values, skillDir);
  }
}
