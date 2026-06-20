import { isImageFileName } from "@App/app/service/agent/core/content_utils";

export interface FileEntry {
  name: string;
  kind: "file" | "directory";
  size?: number;
  lastModified?: number;
}

export type FileKind = "json" | "md" | "img" | "text" | "bin";

// 格式化文件大小（与 release/v1.4-agent 保持一致）
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 依据文件名后缀推断类型（用于图标与预览方式）
export function fileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (isImageFileName(lower)) return "img";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  if (/\.(txt|log|csv|ya?ml|xml|html?|js|ts|css|toml|ini)$/.test(lower)) return "text";
  return "bin";
}

async function getDirHandle(root: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of path) {
    dir = await dir.getDirectoryHandle(part);
  }
  return dir;
}

// 列出目录内容：目录置顶，同类型按名称排序；文件附带 size/lastModified
export async function listDir(root: FileSystemDirectoryHandle, path: string[]): Promise<FileEntry[]> {
  const dir = await getDirHandle(root, path);
  const items: FileEntry[] = [];
  for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    const entry: FileEntry = { name, kind: handle.kind };
    if (handle.kind === "file") {
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        entry.size = file.size;
        entry.lastModified = file.lastModified;
      } catch {
        // OPFS 中个别文件可能暂不可读，跳过其元信息但仍列出
      }
    }
    items.push(entry);
  }
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

export async function removeEntry(
  root: FileSystemDirectoryHandle,
  path: string[],
  name: string,
  kind: "file" | "directory"
): Promise<void> {
  const dir = await getDirHandle(root, path);
  await dir.removeEntry(name, { recursive: kind === "directory" });
}

export async function readFileText(root: FileSystemDirectoryHandle, path: string[], name: string): Promise<string> {
  const dir = await getDirHandle(root, path);
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  return file.text();
}

export async function getFileBlob(root: FileSystemDirectoryHandle, path: string[], name: string): Promise<File> {
  const dir = await getDirHandle(root, path);
  const handle = await dir.getFileHandle(name);
  return handle.getFile();
}

// 把数据写入当前目录的指定文件（不存在则创建），用于上传
export async function writeFile(
  root: FileSystemDirectoryHandle,
  path: string[],
  name: string,
  data: Blob
): Promise<void> {
  const dir = await getDirHandle(root, path);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}
