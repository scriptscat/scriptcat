import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";
import {
  sanitizePath,
  getDirectory,
  getWorkspaceRoot,
  splitPath,
  writeWorkspaceFile,
} from "@App/app/service/agent/opfs_helpers";

// re-export sanitizePath 供外部使用
export { sanitizePath };

// ---- Tool Definitions ----

const OPFS_WRITE_DEFINITION: ToolDefinition = {
  name: "opfs_write",
  description:
    "Write content to a file in the workspace. Supports text strings, Blob, and data URL (base64 auto-decoded to binary). Creates parent directories automatically.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to workspace root (e.g. 'notes/todo.txt')" },
      content: { type: "string", description: "Text content to write" },
    },
    required: ["path", "content"],
  },
};

const OPFS_READ_DEFINITION: ToolDefinition = {
  name: "opfs_read",
  description:
    "Read a file from the workspace. Returns a blob URL (blob:chrome-extension://...) that can be used in executeScript (ISOLATED world) for download, display, or further processing. Never returns file content directly to avoid context overflow.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to workspace root" },
    },
    required: ["path"],
  },
};

const OPFS_LIST_DEFINITION: ToolDefinition = {
  name: "opfs_list",
  description: "List files and directories in a workspace directory.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path relative to workspace root (default: root)" },
    },
  },
};

const OPFS_DELETE_DEFINITION: ToolDefinition = {
  name: "opfs_delete",
  description: "Delete a file or directory from the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File or directory path relative to workspace root" },
    },
    required: ["path"],
  },
};

// ---- blob URL 创建（通过 Offscreen） ----

// 创建 blob URL 的回调，由外部注入（Offscreen 通道）
type CreateBlobUrlFn = (data: ArrayBuffer, mimeType: string) => Promise<string>;
let createBlobUrlFn: CreateBlobUrlFn | null = null;

/** 注入 Offscreen blob URL 创建函数 */
export function setCreateBlobUrlFn(fn: CreateBlobUrlFn): void {
  createBlobUrlFn = fn;
}

/** 根据文件扩展名推断 MIME 类型 */
export function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    pdf: "application/pdf",
    json: "application/json",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
  };
  return map[ext] || "application/octet-stream";
}

// ---- Factory ----

export function createOPFSTools(): {
  tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
} {
  const writeExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const result = await writeWorkspaceFile(args.path as string, args.content as string | Blob);
      return JSON.stringify(result);
    },
  };

  const readExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const safePath = sanitizePath(args.path as string);
      if (!safePath) throw new Error("path is required");

      if (!createBlobUrlFn) {
        throw new Error("Blob URL creation not available (Offscreen not initialized)");
      }

      const workspace = await getWorkspaceRoot();
      const { dirPath, fileName } = splitPath(safePath);
      const dir = dirPath ? await getDirectory(workspace, dirPath) : workspace;
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      // 一律返回 blob URL，避免文件内容进入 LLM 上下文
      const arrayBuffer = await file.arrayBuffer();
      const mimeType = guessMimeType(safePath);
      const blobUrl = await createBlobUrlFn(arrayBuffer, mimeType);
      return JSON.stringify({ path: safePath, blobUrl, size: file.size, mimeType });
    },
  };

  const listExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const rawPath = (args.path as string) || "";
      const safePath = sanitizePath(rawPath);

      const workspace = await getWorkspaceRoot(true);
      const dir = safePath ? await getDirectory(workspace, safePath) : workspace;

      const entries: Array<{ name: string; type: "file" | "directory"; size?: number }> = [];
      for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (handle.kind === "file") {
          const f = await (handle as FileSystemFileHandle).getFile();
          entries.push({ name, type: "file", size: f.size });
        } else {
          entries.push({ name, type: "directory" });
        }
      }

      return JSON.stringify(entries);
    },
  };

  const deleteExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const safePath = sanitizePath(args.path as string);
      if (!safePath) throw new Error("path is required");

      const workspace = await getWorkspaceRoot();
      const { dirPath, fileName } = splitPath(safePath);
      const dir = dirPath ? await getDirectory(workspace, dirPath) : workspace;
      await dir.removeEntry(fileName, { recursive: true });

      return JSON.stringify({ success: true });
    },
  };

  return {
    tools: [
      { definition: OPFS_WRITE_DEFINITION, executor: writeExecutor },
      { definition: OPFS_READ_DEFINITION, executor: readExecutor },
      { definition: OPFS_LIST_DEFINITION, executor: listExecutor },
      { definition: OPFS_DELETE_DEFINITION, executor: deleteExecutor },
    ],
  };
}
