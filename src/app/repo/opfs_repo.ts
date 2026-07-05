// OPFS（Origin Private File System）通用 Repo 基类
// 所有 Agent 相关的持久化数据统一存储在 agents/ 目录下

const AGENTS_ROOT = "agents";

// 获取 agents 根目录
async function getAgentsRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(AGENTS_ROOT, { create: true });
}

// 按路径逐级获取子目录，自动创建不存在的目录
async function getSubDir(base: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  const parts = path.split("/").filter(Boolean);
  let dir = base;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

/**
 * OPFS Repo 基类，提供基于 OPFS 的 JSON 文件读写能力
 *
 * 目录结构示例：
 *   agents/conversations/          - 对话元数据
 *   agents/conversations/messages/ - 对话消息
 *   agents/skills/                 - Skill 配置
 *   agents/memory/                 - Agent 记忆
 */
export class OPFSRepo {
  constructor(private subPath: string) {}

  // 获取当前 Repo 对应的目录
  protected async getDir(): Promise<FileSystemDirectoryHandle> {
    const root = await getAgentsRoot();
    return getSubDir(root, this.subPath);
  }

  // 获取子目录
  protected async getChildDir(childPath: string): Promise<FileSystemDirectoryHandle> {
    const dir = await this.getDir();
    return getSubDir(dir, childPath);
  }

  // 读取 JSON 文件，文件不存在时返回默认值
  protected async readJsonFile<T>(filename: string, defaultValue: T, dir?: FileSystemDirectoryHandle): Promise<T> {
    try {
      const targetDir = dir || (await this.getDir());
      const fileHandle = await targetDir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as T;
    } catch {
      return defaultValue;
    }
  }

  // 写入 JSON 文件
  protected async writeJsonFile(filename: string, data: unknown, dir?: FileSystemDirectoryHandle): Promise<void> {
    const targetDir = dir || (await this.getDir());
    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  }

  // 删除文件，不存在时忽略
  protected async deleteFile(filename: string, dir?: FileSystemDirectoryHandle): Promise<void> {
    try {
      const targetDir = dir || (await this.getDir());
      await targetDir.removeEntry(filename);
    } catch {
      // 文件不存在则忽略
    }
  }

  // 递归删除子目录
  protected async removeDirectory(name: string, dir?: FileSystemDirectoryHandle): Promise<void> {
    try {
      const targetDir = dir || (await this.getDir());
      await targetDir.removeEntry(name, { recursive: true });
    } catch {
      // 目录不存在则忽略
    }
  }

  // 列出目录下所有文件名
  protected async listFiles(dir?: FileSystemDirectoryHandle): Promise<string[]> {
    const targetDir = dir || (await this.getDir());
    const files: string[] = [];
    for await (const [name, handle] of targetDir as any) {
      if (handle.kind === "file") {
        files.push(name);
      }
    }
    return files;
  }
}
