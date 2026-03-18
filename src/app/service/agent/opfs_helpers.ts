// OPFS 工作区公共辅助函数
// 供 opfs_tools、agent_dom 等模块复用

export const WORKSPACE_ROOT = "agents/workspace";

/** Strip leading `/`, reject `..` segments */
export function sanitizePath(raw: string): string {
  const stripped = raw.replace(/^\/+/, "");
  const segments = stripped.split("/").filter(Boolean);
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`Invalid path: ".." is not allowed`);
    }
  }
  return segments.join("/");
}

/** Navigate into nested directories, creating them as needed */
export async function getDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false
): Promise<FileSystemDirectoryHandle> {
  const segments = path.split("/").filter(Boolean);
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return dir;
}

/** Get the workspace root directory handle */
export async function getWorkspaceRoot(create = false): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  return getDirectory(opfsRoot, WORKSPACE_ROOT, create);
}

/** Split a sanitized path into parent directory path and filename */
export function splitPath(sanitized: string): { dirPath: string; fileName: string } {
  const lastSlash = sanitized.lastIndexOf("/");
  if (lastSlash === -1) {
    return { dirPath: "", fileName: sanitized };
  }
  return {
    dirPath: sanitized.substring(0, lastSlash),
    fileName: sanitized.substring(lastSlash + 1),
  };
}

/** 将 data URL 解码为二进制 Uint8Array */
export function decodeDataUrl(dataUrl: string): { data: Uint8Array; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL format");
  }
  const mimeType = match[1];
  const base64 = match[2];
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return { data: bytes, mimeType };
}

/** 将二进制数据写入 OPFS workspace 指定路径 */
export async function writeWorkspaceFile(
  path: string,
  data: Uint8Array | string
): Promise<{ path: string; size: number }> {
  const safePath = sanitizePath(path);
  if (!safePath) throw new Error("path is required");

  const workspace = await getWorkspaceRoot(true);
  const { dirPath, fileName } = splitPath(safePath);
  const dir = dirPath ? await getDirectory(workspace, dirPath, true) : workspace;
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data);
  await writable.close();

  const size = typeof data === "string" ? new Blob([data]).size : data.byteLength;
  return { path: safePath, size };
}
