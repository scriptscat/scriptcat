import type { CATToolRecord } from "@App/app/service/agent/types";
import { OPFSRepo } from "./opfs_repo";

// 索引文件中存储的摘要信息（不含 code）
export type CATToolSummary = Omit<CATToolRecord, "code">;

const REGISTRY_FILE = "tools.json";
// 完整记录存放的子目录
const DATA_DIR = "data";

// 目录结构：agents/tools/tools.json（索引）+ agents/tools/data/<id>.json（完整记录）
export class CATToolRepo extends OPFSRepo {
  constructor() {
    super("tools");
  }

  // 将工具名转为安全的文件名，过滤路径分隔符和特殊字符
  // 注意：不同名称可能映射到同一文件名（如 "a.b" 和 "a/b" 都变成 "a_b"），
  // 当前仅用于兼容旧数据的迁移清理，新数据使用 UUID 作为文件名
  static sanitizeName(name: string): string {
    // 移除路径分隔符和 OPFS 不允许的字符
    return name.replace(/[/\\:*?"<>|.]/g, "_");
  }

  // 使用 UUID 作为 data 文件名，完全避免碰撞
  private idToFileName(id: string): string {
    return `${id}.json`;
  }

  // 获取完整记录所在的子目录
  private async getDataDir(): Promise<FileSystemDirectoryHandle> {
    return this.getChildDir(DATA_DIR);
  }

  // 读取索引文件
  private async readRegistry(): Promise<CATToolSummary[]> {
    return this.readJsonFile<CATToolSummary[]>(REGISTRY_FILE, []);
  }

  // 写入索引文件
  private async writeRegistry(summaries: CATToolSummary[]): Promise<void> {
    await this.writeJsonFile(REGISTRY_FILE, summaries);
  }

  // 从完整记录生成摘要（去掉 code）
  private toSummary(record: CATToolRecord): CATToolSummary {
    const { code: _, ...summary } = record;
    return summary;
  }

  // 列出所有工具的摘要信息（只读索引，不读单个文件）
  async listTools(): Promise<CATToolSummary[]> {
    return this.readRegistry();
  }

  // 获取完整的工具记录（含 code），通过索引查找 id 再读取 data 文件
  async getTool(name: string): Promise<CATToolRecord | null> {
    const registry = await this.readRegistry();
    const summary = registry.find((t) => t.name === name);
    if (!summary) return null;
    const dataDir = await this.getDataDir();
    return this.readJsonFile<CATToolRecord | null>(this.idToFileName(summary.id), null, dataDir);
  }

  // 保存工具并更新索引，使用 record.id 作为 data 文件名
  async saveTool(record: CATToolRecord): Promise<void> {
    const dataDir = await this.getDataDir();
    await this.writeJsonFile(this.idToFileName(record.id), record, dataDir);
    // 更新索引
    const registry = await this.readRegistry();
    const idx = registry.findIndex((t) => t.name === record.name);
    const summary = this.toSummary(record);
    if (idx >= 0) {
      registry[idx] = summary;
    } else {
      registry.push(summary);
    }
    await this.writeRegistry(registry);
  }

  // 删除工具并更新索引
  // 先更新索引再删 data 文件：如果中间崩溃，最差情况是留下孤儿 data 文件（无害），
  // 反过来会产生索引中有记录但 data 已删的悬空引用
  async removeTool(name: string): Promise<boolean> {
    const registry = await this.readRegistry();
    const summary = registry.find((t) => t.name === name);
    if (!summary) return false;
    // 先从索引中移除
    const filtered = registry.filter((t) => t.name !== name);
    await this.writeRegistry(filtered);
    // 再删除 data 文件
    const dataDir = await this.getDataDir();
    await this.deleteFile(this.idToFileName(summary.id), dataDir);
    return true;
  }
}
