import { isImageFileName } from "@App/app/service/agent/core/content_utils";
import { isWorkspacePath, sanitizePath, WORKSPACE_PATH } from "@App/app/service/agent/core/opfs_helpers";

export const EDITABLE_PATH = WORKSPACE_PATH;

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

export function isEditablePath(path: readonly string[]): boolean {
  return isWorkspacePath(path);
}

function assertEditablePath(path: readonly string[]): void {
  if (!isEditablePath(path)) {
    throw new Error("This directory is read-only");
  }
}

function assertEntryName(name: string): void {
  if (!name.trim() || name === "." || name === ".." || /[\\/]/.test(name)) {
    throw new Error("Invalid file name");
  }
}

export function parsePath(rawPath: string): string[] {
  return sanitizePath(rawPath).split("/").filter(Boolean);
}

export async function getDirHandle(
  root: FileSystemDirectoryHandle,
  path: string[]
): Promise<FileSystemDirectoryHandle> {
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
  assertEditablePath(path);
  assertEntryName(name);
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
  assertEditablePath(path);
  assertEntryName(name);
  const dir = await getDirHandle(root, path);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function ensureDestinationAvailable(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  let exists = false;
  try {
    await dir.getFileHandle(name);
    exists = true;
  } catch {
    // The entry may be a directory.
  }
  if (!exists) {
    try {
      await dir.getDirectoryHandle(name);
      exists = true;
    } catch {
      // The destination is available.
    }
  }
  if (exists) {
    throw new Error(`An entry named "${name}" already exists`);
  }
}

async function copyEntry(
  sourceDir: FileSystemDirectoryHandle,
  sourceName: string,
  destinationDir: FileSystemDirectoryHandle,
  destinationName: string
): Promise<void> {
  let sourceFile: FileSystemFileHandle | undefined;
  try {
    sourceFile = await sourceDir.getFileHandle(sourceName);
  } catch {
    // The source may be a directory.
  }

  if (sourceFile) {
    const source = await sourceFile.getFile();
    const target = await destinationDir.getFileHandle(destinationName, { create: true });
    const writable = await target.createWritable();
    await writable.write(source);
    await writable.close();
    return;
  }

  const sourceDirectory = await sourceDir.getDirectoryHandle(sourceName);
  const destinationDirectory = await destinationDir.getDirectoryHandle(destinationName, { create: true });
  for await (const [name, handle] of sourceDirectory as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    await copyEntry(sourceDirectory, name, destinationDirectory, handle.name || name);
  }
}

export async function renameEntry(
  root: FileSystemDirectoryHandle,
  path: string[],
  name: string,
  newName: string
): Promise<void> {
  assertEditablePath(path);
  assertEntryName(name);
  assertEntryName(newName);
  if (name === newName) return;
  await moveEntry(root, path, name, path, newName);
}

export async function moveEntry(
  root: FileSystemDirectoryHandle,
  sourcePath: string[],
  name: string,
  destinationPath: string[],
  destinationName = name
): Promise<void> {
  assertEditablePath(sourcePath);
  assertEditablePath(destinationPath);
  assertEntryName(name);
  assertEntryName(destinationName);

  const sourceEntryPath = [...sourcePath, name];
  const destinationEntryPath = [...destinationPath, destinationName];
  if (destinationEntryPath.join("/") === sourceEntryPath.join("/")) return;
  const destinationIsInsideSource = sourceEntryPath.every((part, index) => destinationPath[index] === part);
  if (destinationIsInsideSource) {
    throw new Error("Cannot move an entry into itself");
  }

  const sourceDir = await getDirHandle(root, sourcePath);
  const destinationDir = await getDirHandle(root, destinationPath);
  await ensureDestinationAvailable(destinationDir, destinationName);
  await copyEntry(sourceDir, name, destinationDir, destinationName);
  await sourceDir.removeEntry(name, { recursive: true });
}
