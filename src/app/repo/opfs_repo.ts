// OPFS（Origin Private File System）通用 Repo 基类
// 所有 Agent 相关的持久化数据统一存储在 agents/ 目录下

import { stackAsyncTask } from "@App/pkg/utils/async_queue";

const AGENTS_ROOT = "agents";

function isNotFoundError(error: unknown): boolean {
  return (error as { name?: string })?.name === "NotFoundError";
}

// 跨上下文互斥：Options 页与 Service Worker 都会直接读写同一份 OPFS JSON 文件，
// 进程内队列（stackAsyncTask）覆盖不了跨上下文的读-改-写竞争。Web Locks 按 origin
// 全局生效（扩展页与 MV3 SW 同源），是两者之间唯一共享的互斥原语；不支持 Web Locks
// 的环境（单元测试 jsdom）退化为进程内按 key 排队。
function withExclusiveFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks?.request) {
    return locks.request(key, { mode: "exclusive" }, fn) as Promise<T>;
  }
  return stackAsyncTask(key, fn);
}

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

  // 以当前 Repo + 逻辑范围（scope）为粒度的排它锁，供子类把"读-改-写"包成互斥临界区
  protected withFileLock<T>(scope: string, fn: () => Promise<T>): Promise<T> {
    return withExclusiveFileLock(`opfs-repo:${this.subPath}:${scope}`, fn);
  }

  // 读取 JSON 文件。文件尚未创建（NotFoundError）是预期状态，返回默认值；
  // 解析失败、权限或 I/O 错误一律抛出——把这类失败静默转成默认值，会让后续的
  // 读-改-写（appendMessage / saveConversation 等）基于空快照把仍然存在的旧数据
  // 整份覆写掉。
  protected async readJsonFile<T>(filename: string, defaultValue: T, dir?: FileSystemDirectoryHandle): Promise<T> {
    const targetDir = dir || (await this.getDir());
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await targetDir.getFileHandle(filename);
    } catch (error) {
      if (isNotFoundError(error)) return defaultValue;
      throw error;
    }
    const file = await fileHandle.getFile();
    const text = await file.text();
    // 空文件：createWritable() 事务性写入不会留下半截内容，空文件只可能是 create 后从未写入，
    // 与"文件不存在"同义，按默认值处理
    if (!text) return defaultValue;
    return JSON.parse(text) as T;
  }

  // 写入 JSON 文件。
  // OPFS 的 createWritable() 本身是事务性的：write() 写入的是临时副本，只有 close() 成功
  // 才会原子替换原文件；调用方持有的旧内容在此之前始终完整可读。
  // 传入 signal 时，若在"调用 close() 之前"已 abort，则改为 writable.abort() 放弃这次写入。
  // 诚实说明这里的边界：这只保证 close() 调用前的 abort 一定不会提交；一旦 close() 已经
  // 发出，FSA 规范不提供可靠的方式中途取消它，abort 恰好落在 close() 进行期间这个极窄窗口
  // 理论上仍可能提交。调用方（compact_service.ts / chat_service.ts）都会在
  // saveMessages() resolve 之后再次检查 signal，因此即使命中这个窗口，也不会对外报告
  // 虚假的成功事件（compact_done/done）——唯一的残留风险是磁盘内容被替换但会话已判定为
  // 取消，这是一个已知的、极窄的边界情况，未做完整的事务回滚。
  protected async writeJsonFile(
    filename: string,
    data: unknown,
    dir?: FileSystemDirectoryHandle,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted) throw new Error("Aborted");
    const targetDir = dir || (await this.getDir());
    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    if (signal?.aborted) {
      await writable.abort().catch(() => {});
      throw new Error("Aborted");
    }
    await writable.close();
  }

  // 删除文件，不存在时忽略
  protected async deleteFile(filename: string, dir?: FileSystemDirectoryHandle): Promise<void> {
    try {
      const targetDir = dir || (await this.getDir());
      await targetDir.removeEntry(filename);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  // 递归删除子目录
  protected async removeDirectory(name: string, dir?: FileSystemDirectoryHandle): Promise<void> {
    try {
      const targetDir = dir || (await this.getDir());
      await targetDir.removeEntry(name, { recursive: true });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
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
