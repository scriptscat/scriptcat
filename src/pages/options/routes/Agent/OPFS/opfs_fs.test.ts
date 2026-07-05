import { describe, it, expect } from "vitest";
import { listDir, removeEntry, readFileText, writeFile, formatSize, fileKind } from "./opfs_fs";

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

describe("opfs_fs 文件系统封装", () => {
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
    const root = dirHandle("root", { "a.txt": fileHandle("a.txt"), "b.txt": fileHandle("b.txt") });
    await removeEntry(root, [], "a.txt", "file");
    const entries = await listDir(root, []);
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
    await writeFile(root, [], "new.txt", new Blob(["uploaded"]));
    expect(created["new.txt"]).toBeDefined();
    expect(written).toBe("uploaded");
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
