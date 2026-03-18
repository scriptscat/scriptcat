import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";

const WORKSPACE_ROOT = "agents/workspace";

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
async function getDirectory(
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
async function getWorkspaceRoot(create = false): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  return getDirectory(opfsRoot, WORKSPACE_ROOT, create);
}

/** Split a sanitized path into parent directory path and filename */
function splitPath(sanitized: string): { dirPath: string; fileName: string } {
  const lastSlash = sanitized.lastIndexOf("/");
  if (lastSlash === -1) {
    return { dirPath: "", fileName: sanitized };
  }
  return {
    dirPath: sanitized.substring(0, lastSlash),
    fileName: sanitized.substring(lastSlash + 1),
  };
}

// ---- Tool Definitions ----

const OPFS_WRITE_DEFINITION: ToolDefinition = {
  name: "opfs_write",
  description: "Write text content to a file in the workspace. Creates parent directories automatically.",
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
  description: "Read text content from a file in the workspace.",
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

// ---- Factory ----

export function createOPFSTools(): {
  tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
} {
  const writeExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const safePath = sanitizePath(args.path as string);
      const content = args.content as string;
      if (!safePath) throw new Error("path is required");

      const workspace = await getWorkspaceRoot(true);
      const { dirPath, fileName } = splitPath(safePath);
      const dir = dirPath ? await getDirectory(workspace, dirPath, true) : workspace;
      const fileHandle = await dir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      return JSON.stringify({ path: safePath, size: new Blob([content]).size });
    },
  };

  const readExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const safePath = sanitizePath(args.path as string);
      if (!safePath) throw new Error("path is required");

      const workspace = await getWorkspaceRoot();
      const { dirPath, fileName } = splitPath(safePath);
      const dir = dirPath ? await getDirectory(workspace, dirPath) : workspace;
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const content = await file.text();

      return JSON.stringify({ path: safePath, content, size: file.size });
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
          const file = await (handle as FileSystemFileHandle).getFile();
          entries.push({ name, type: "file", size: file.size });
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
