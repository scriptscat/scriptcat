import type { ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import {
  sanitizePath,
  getDirectory,
  getWorkspaceRoot,
  splitPath,
  writeWorkspaceFile,
} from "@App/app/service/agent/core/opfs_helpers";
import { isText } from "@App/pkg/utils/istextorbinary";
import { requireString } from "./param_utils";

// re-export sanitizePath 供外部使用
export { sanitizePath };

// ---- Tool Definitions ----

const OPFS_WRITE_DEFINITION: ToolDefinition = {
  name: "opfs_write",
  description:
    "Write content to a file in the workspace. Supports text strings, Blob, and data URL (base64 auto-decoded to binary). Creates parent directories automatically. " +
    "Text files can be read back via opfs_read. Binary data (images, downloads) are returned as blob URLs.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to workspace root (e.g. 'notes/todo.txt')" },
      content: { type: "string", description: "Text content to write" },
    },
    required: ["path", "content"],
  },
};

/** 最大允许无分页直接返回的文本行数 */
const MAX_TEXT_LINES = 200;

const OPFS_READ_DEFINITION: ToolDefinition = {
  name: "opfs_read",
  description:
    "Read a file from the workspace. " +
    "By default auto-detects: text files return content, binary files return blob URL. " +
    "Use 'mode' to override. If text exceeds 200 lines, use 'offset' and 'limit' to read in segments.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to workspace root" },
      mode: {
        type: "string",
        enum: ["text", "blob", "auto"],
        description:
          "Return mode. 'text': force text content; 'blob': force blob URL (for passing images/binary to SkillScripts or page); 'auto' (default): detect by file content",
      },
      offset: {
        type: "number",
        description: "Start line number (1-based). Only for text mode. Default: 1",
      },
      limit: {
        type: "number",
        description: "Number of lines to read. Only for text mode. Default: all (up to 200)",
      },
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

/** 根据文件扩展名推断 MIME 类型（仅用于元数据，文本/二进制判断由 isText 负责） */
export function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    csv: "text/csv",
    xml: "text/xml",
    svg: "image/svg+xml",
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    pdf: "application/pdf",
    zip: "application/zip",
    wasm: "application/wasm",
  };
  return map[ext] || "application/octet-stream";
}

// ---- Factory ----

export function createOPFSTools(): {
  tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
} {
  const writeExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const path = requireString(args, "path");
      const result = await writeWorkspaceFile(path, args.content as string | Blob);
      return JSON.stringify(result);
    },
  };

  const readExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const safePath = sanitizePath(requireString(args, "path"));
      if (!safePath) throw new Error("path is required");

      const workspace = await getWorkspaceRoot();
      const { dirPath, fileName } = splitPath(safePath);
      const dir = dirPath ? await getDirectory(workspace, dirPath) : workspace;
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const mimeType = guessMimeType(safePath);
      const arrayBuffer = await file.arrayBuffer();

      // 确定返回模式：auto 通过内容字节检测文本/二进制
      const mode = (args.mode as string) || "auto";
      const useText = mode === "text" || (mode === "auto" && isText(new Uint8Array(arrayBuffer)));

      // blob 模式：返回 blob URL
      if (!useText) {
        if (!createBlobUrlFn) {
          throw new Error("Blob URL creation not available (Offscreen not initialized)");
        }
        const blobUrl = await createBlobUrlFn(arrayBuffer, mimeType);
        return JSON.stringify({ path: safePath, blobUrl, size: file.size, mimeType, type: "binary" });
      }

      // text 模式：返回文本内容
      const text = new TextDecoder().decode(arrayBuffer);
      const lines = text.split("\n");
      const totalLines = lines.length;

      const offset = typeof args.offset === "number" ? args.offset : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;

      // 超过行数限制且未指定分页参数，报错要求分段读取
      if (offset == null && limit == null && totalLines > MAX_TEXT_LINES) {
        throw new Error(
          `文件共 ${totalLines} 行，超过单次读取上限（${MAX_TEXT_LINES} 行）。` +
            `请使用 offset 和 limit 参数分段读取，例如：offset=1, limit=${MAX_TEXT_LINES}`
        );
      }

      const startLine = offset != null ? Math.max(1, offset) : 1;
      const endLine = limit != null ? Math.min(totalLines, startLine + limit - 1) : totalLines;
      const selectedLines = lines.slice(startLine - 1, endLine);
      const content = selectedLines.join("\n");

      return JSON.stringify({
        path: safePath,
        content,
        totalLines,
        startLine,
        endLine,
        mimeType,
        type: "text",
      });
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
      const safePath = sanitizePath(requireString(args, "path"));
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
