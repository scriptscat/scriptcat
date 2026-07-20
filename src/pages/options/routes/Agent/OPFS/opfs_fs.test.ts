import { describe, it, expect } from "vitest";
import {
  listDir,
  removeEntry,
  readFileText,
  writeFile,
  formatSize,
  fileKind,
  isEditablePath,
  renameEntry,
  moveEntry,
} from "./opfs_fs";

// ---- 内存版 FileSystemDirectoryHandle mock ----
function fileHandle(name: string, content = "x", lastModified = 0): any {
  return {
    kind: "file",
    name,
    async getFile() {
      return { size: content.length, lastModified, text: async () => content };
    },
  };
}
function dirHandle(name: string, children: Record<string, any> = {}): any {
  return {
    kind: "directory",
    name,
    async *[Symbol.asyncIterator]() {
      for (const [n, h] of Object.entries(children)) yield [n, h];
    },
    async getDirectoryHandle(n: string) {
      return children[n];
    },
    async getFileHandle(n: string) {
      return children[n];
    },
    async removeEntry(n: string) {
      delete children[n];
    },
    _children: children,
  };
}

function mutableFile(name: string, initialContent: string): any {
  let content = initialContent;
  return {
    kind: "file",
    name,
    async getFile() {
      return new Blob([content]);
    },
    async createWritable() {
      let nextContent = "";
      return {
        async write(data: Blob | string) {
          nextContent = typeof data === "string" ? data : await data.text();
        },
        async close() {
          content = nextContent;
        },
      };
    },
  };
}

function mutableDirectory(name: string, children: Record<string, any> = {}): any {
  return {
    kind: "directory",
    name,
    async getDirectoryHandle(childName: string, opts?: { create?: boolean }) {
      if (!children[childName]) {
        if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
        children[childName] = mutableDirectory(childName);
      }
      if (children[childName].kind !== "directory") throw new DOMException("Not a directory", "TypeMismatchError");
      return children[childName];
    },
    async getFileHandle(childName: string, opts?: { create?: boolean }) {
      if (!children[childName]) {
        if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
        children[childName] = mutableFile(childName, "");
      }
      if (children[childName].kind !== "file") throw new DOMException("Not a file", "TypeMismatchError");
      return children[childName];
    },
    async removeEntry(childName: string) {
      if (!children[childName]) throw new DOMException("Not found", "NotFoundError");
      delete children[childName];
    },
    async *[Symbol.asyncIterator]() {
      for (const [childName, child] of Object.entries(children)) yield [childName, child];
    },
    _children: children,
  };
}

describe("opfs_fs 文件系统封装", () => {
  it("只允许 agents/workspace 及其子目录修改", () => {
    expect(isEditablePath(["agents", "workspace"])).toBe(true);
    expect(isEditablePath(["agents", "workspace", "uploads"])).toBe(true);
    expect(isEditablePath([])).toBe(false);
    expect(isEditablePath(["agents"])).toBe(false);
    expect(isEditablePath(["agents", "workspaces"])).toBe(false);
    expect(isEditablePath(["agents", "workspace", ""])).toBe(false);
    expect(isEditablePath(["agents", "workspace", "."])).toBe(false);
    expect(isEditablePath(["agents", "workspace", ".."])).toBe(false);
  });

  it("写入和删除系统目录中的条目应被拒绝", async () => {
    const root = {} as FileSystemDirectoryHandle;

    await expect(writeFile(root, [], "system.txt", new Blob(["blocked"]))).rejects.toThrow("read-only");
    await expect(removeEntry(root, [], "system.txt", "file")).rejects.toThrow("read-only");
    await expect(renameEntry(root, ["agents"], "system.txt", "renamed.txt")).rejects.toThrow("read-only");
  });

  it("移动条目必须同时拥有源目录和目标目录的修改权限", async () => {
    const root = {} as FileSystemDirectoryHandle;

    await expect(moveEntry(root, ["agents", "workspace"], "file.txt", ["agents"])).rejects.toThrow("read-only");
    await expect(moveEntry(root, ["agents"], "file.txt", ["agents", "workspace"])).rejects.toThrow("read-only");
  });

  it("listDir 目录置顶并读取文件大小", async () => {
    const root = dirHandle("root", { "z.txt": fileHandle("z.txt", "hello"), alpha: dirHandle("alpha") });
    const entries = await listDir(root, []);
    expect(entries.map((e) => e.name)).toEqual(["alpha", "z.txt"]);
    expect(entries[0].kind).toBe("directory");
    expect(entries[1].size).toBe(5);
  });

  it("listDir 支持进入子目录", async () => {
    const child = dirHandle("sub", { "a.json": fileHandle("a.json", "{}") });
    const root = dirHandle("root", { sub: child });
    const entries = await listDir(root, ["sub"]);
    expect(entries.map((e) => e.name)).toEqual(["a.json"]);
  });

  it("removeEntry 删除条目", async () => {
    const workspace = dirHandle("workspace", { "a.txt": fileHandle("a.txt"), "b.txt": fileHandle("b.txt") });
    const root = dirHandle("root", { agents: dirHandle("agents", { workspace }) });
    await removeEntry(root, ["agents", "workspace"], "a.txt", "file");
    const entries = await listDir(root, ["agents", "workspace"]);
    expect(entries.map((e) => e.name)).toEqual(["b.txt"]);
  });

  it("readFileText 读取文本内容", async () => {
    const root = dirHandle("root", { "a.txt": fileHandle("a.txt", "内容") });
    expect(await readFileText(root, [], "a.txt")).toBe("内容");
  });

  it("writeFile 创建文件并写入内容(上传)", async () => {
    let written = "";
    const writable = {
      async write(data: any) {
        written = typeof data === "string" ? data : await data.text();
      },
      async close() {},
    };
    const created: Record<string, any> = {};
    const root: any = {
      kind: "directory",
      async getFileHandle(n: string, opts?: { create?: boolean }) {
        if (!created[n]) {
          if (!opts?.create) throw new Error("not found");
          created[n] = { kind: "file", name: n, createWritable: async () => writable };
        }
        return created[n];
      },
    };
    const workspace = {
      kind: "directory",
      async getFileHandle(n: string, opts?: { create?: boolean }) {
        if (!created[n]) {
          if (!opts?.create) throw new Error("not found");
          created[n] = { kind: "file", name: n, createWritable: async () => writable };
        }
        return created[n];
      },
    };
    const agents = { getDirectoryHandle: async () => workspace };
    root.getDirectoryHandle = async () => agents;
    await writeFile(root, ["agents", "workspace"], "new.txt", new Blob(["uploaded"]));
    expect(created["new.txt"]).toBeDefined();
    expect(written).toBe("uploaded");
  });

  it("在可编辑工作区内支持重命名和移动", async () => {
    const workspace = mutableDirectory("workspace", {
      "old.txt": mutableFile("old.txt", "data"),
      target: mutableDirectory("target"),
    });
    const root = mutableDirectory("root", {
      agents: mutableDirectory("agents", { workspace }),
    });

    await renameEntry(root, ["agents", "workspace"], "old.txt", "new.txt");
    expect(workspace._children["old.txt"]).toBeUndefined();
    expect(workspace._children["new.txt"]).toBeDefined();

    await moveEntry(root, ["agents", "workspace"], "new.txt", ["agents", "workspace", "target"]);
    expect(workspace._children["new.txt"]).toBeUndefined();
    expect(workspace._children.target._children["new.txt"]).toBeDefined();
  });

  it("formatSize 按量级格式化", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("fileKind 按后缀分类", () => {
    expect(fileKind("a.json")).toBe("json");
    expect(fileKind("b.PNG")).toBe("img");
    expect(fileKind("c.md")).toBe("md");
    expect(fileKind("d.txt")).toBe("text");
    expect(fileKind("e.bin")).toBe("bin");
  });
});
