import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOPFSTools, sanitizePath, setCreateBlobUrlFn } from "./opfs_tools";

// ---- In-memory OPFS mock ----

type FSNode = { kind: "file"; content: string } | { kind: "directory"; children: Map<string, FSNode> };

function createMockFS() {
  const root: FSNode = { kind: "directory", children: new Map() };

  function navigate(path: string[]): FSNode {
    let node = root;
    for (const seg of path) {
      if (node.kind !== "directory") throw new DOMException("Not a directory", "TypeMismatchError");
      const child = node.children.get(seg);
      if (!child) throw new DOMException(`"${seg}" not found`, "NotFoundError");
      node = child;
    }
    return node;
  }

  function makeDirectoryHandle(node: FSNode & { kind: "directory" }, name = ""): FileSystemDirectoryHandle {
    const handle: any = {
      kind: "directory",
      name,
      getDirectoryHandle(childName: string, opts?: { create?: boolean }) {
        let child = node.children.get(childName);
        if (!child) {
          if (opts?.create) {
            child = { kind: "directory", children: new Map() };
            node.children.set(childName, child);
          } else {
            throw new DOMException(`"${childName}" not found`, "NotFoundError");
          }
        }
        if (child.kind !== "directory") throw new DOMException("Not a directory", "TypeMismatchError");
        return makeDirectoryHandle(child, childName);
      },
      getFileHandle(childName: string, opts?: { create?: boolean }) {
        let child = node.children.get(childName);
        if (!child) {
          if (opts?.create) {
            child = { kind: "file", content: "" };
            node.children.set(childName, child);
          } else {
            throw new DOMException(`"${childName}" not found`, "NotFoundError");
          }
        }
        if (child.kind !== "file") throw new DOMException("Not a file", "TypeMismatchError");
        return makeFileHandle(child, childName);
      },
      removeEntry(childName: string) {
        if (!node.children.has(childName)) {
          throw new DOMException(`"${childName}" not found`, "NotFoundError");
        }
        node.children.delete(childName);
      },
      async *[Symbol.asyncIterator]() {
        for (const [n, c] of node.children) {
          if (c.kind === "file") {
            yield [n, makeFileHandle(c, n)];
          } else {
            yield [n, makeDirectoryHandle(c, n)];
          }
        }
      },
    };
    return handle;
  }

  function makeFileHandle(node: FSNode & { kind: "file" }, name: string): FileSystemFileHandle {
    const handle: any = {
      kind: "file",
      name,
      async getFile() {
        return new Blob([node.content], { type: "text/plain" });
      },
      async createWritable() {
        let buffer = "";
        return {
          async write(data: string) {
            buffer += data;
          },
          async close() {
            node.content = buffer;
          },
        };
      },
    };
    return handle;
  }

  return {
    root,
    navigate,
    rootHandle: makeDirectoryHandle(root, ""),
  };
}

// Extend Blob with text() for vitest (jsdom may not have it)
if (!Blob.prototype.text) {
  Blob.prototype.text = async function () {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(this);
    });
  };
}

describe("sanitizePath", () => {
  it("should strip leading slashes", () => {
    expect(sanitizePath("/foo/bar.txt")).toBe("foo/bar.txt");
    expect(sanitizePath("///a/b")).toBe("a/b");
  });

  it("should reject .. segments", () => {
    expect(() => sanitizePath("../etc/passwd")).toThrow('".." is not allowed');
    expect(() => sanitizePath("foo/../../bar")).toThrow('".." is not allowed');
  });

  it("should handle normal paths", () => {
    expect(sanitizePath("notes/todo.txt")).toBe("notes/todo.txt");
    expect(sanitizePath("file.txt")).toBe("file.txt");
  });

  it("should collapse empty segments", () => {
    expect(sanitizePath("a//b///c")).toBe("a/b/c");
  });
});

describe("opfs_tools", () => {
  let mockFS: ReturnType<typeof createMockFS>;

  beforeEach(() => {
    mockFS = createMockFS();
    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: vi.fn().mockResolvedValue(mockFS.rootHandle),
      },
    });
    // opfs_read 总是返回 blobUrl，需要初始化 createBlobUrlFn
    setCreateBlobUrlFn(async () => "blob:mock-url");
  });

  function getTool(name: string) {
    const { tools } = createOPFSTools();
    return tools.find((t) => t.definition.name === name)!;
  }

  it("should create 4 tools", () => {
    const { tools } = createOPFSTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.definition.name)).toEqual(["opfs_write", "opfs_read", "opfs_list", "opfs_delete"]);
  });

  describe("opfs_write + opfs_read", () => {
    it("should write and read a file", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      const writeResult = JSON.parse(
        (await write.executor.execute({ path: "hello.txt", content: "Hello!" })) as string
      );
      expect(writeResult.path).toBe("hello.txt");
      expect(writeResult.size).toBe(6);

      const readResult = JSON.parse((await read.executor.execute({ path: "hello.txt" })) as string);
      expect(readResult.path).toBe("hello.txt");
      expect(readResult.blobUrl).toBe("blob:mock-url");
      expect(readResult.size).toBe(6);
    });

    it("should create nested directories automatically", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "a/b/c.txt", content: "deep" });
      const result = JSON.parse((await read.executor.execute({ path: "a/b/c.txt" })) as string);
      expect(result.blobUrl).toBe("blob:mock-url");
    });

    it("should overwrite existing file", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "f.txt", content: "v1" });
      await write.executor.execute({ path: "f.txt", content: "v2" });
      const result = JSON.parse((await read.executor.execute({ path: "f.txt" })) as string);
      expect(result.blobUrl).toBe("blob:mock-url");
    });

    it("should strip leading slashes from path", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "/leading.txt", content: "ok" });
      const result = JSON.parse((await read.executor.execute({ path: "leading.txt" })) as string);
      expect(result.blobUrl).toBe("blob:mock-url");
    });

    it("should reject .. in path", async () => {
      const write = getTool("opfs_write");
      await expect(write.executor.execute({ path: "../escape.txt", content: "bad" })).rejects.toThrow(
        '".." is not allowed'
      );
    });
  });

  describe("opfs_read errors", () => {
    it("should throw for non-existent file", async () => {
      const read = getTool("opfs_read");
      await expect(read.executor.execute({ path: "nope.txt" })).rejects.toThrow();
    });
  });

  describe("opfs_list", () => {
    it("should list files and directories", async () => {
      const write = getTool("opfs_write");
      const list = getTool("opfs_list");

      await write.executor.execute({ path: "file1.txt", content: "a" });
      await write.executor.execute({ path: "sub/file2.txt", content: "bb" });

      const result = JSON.parse((await list.executor.execute({})) as string);
      expect(result).toHaveLength(2);

      const fileEntry = result.find((e: any) => e.name === "file1.txt");
      expect(fileEntry).toEqual({ name: "file1.txt", type: "file", size: 1 });

      const dirEntry = result.find((e: any) => e.name === "sub");
      expect(dirEntry).toEqual({ name: "sub", type: "directory" });
    });

    it("should list subdirectory contents", async () => {
      const write = getTool("opfs_write");
      const list = getTool("opfs_list");

      await write.executor.execute({ path: "dir/a.txt", content: "aaa" });
      await write.executor.execute({ path: "dir/b.txt", content: "bb" });

      const result = JSON.parse((await list.executor.execute({ path: "dir" })) as string);
      expect(result).toHaveLength(2);
    });

    it("should return empty array for empty directory", async () => {
      const list = getTool("opfs_list");
      const result = JSON.parse((await list.executor.execute({})) as string);
      expect(result).toEqual([]);
    });
  });

  describe("opfs_delete", () => {
    it("should delete a file", async () => {
      const write = getTool("opfs_write");
      const del = getTool("opfs_delete");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "temp.txt", content: "bye" });
      const result = JSON.parse((await del.executor.execute({ path: "temp.txt" })) as string);
      expect(result).toEqual({ success: true });

      await expect(read.executor.execute({ path: "temp.txt" })).rejects.toThrow();
    });

    it("should throw for non-existent path", async () => {
      const del = getTool("opfs_delete");
      await expect(del.executor.execute({ path: "ghost.txt" })).rejects.toThrow();
    });

    it("should reject .. in path", async () => {
      const del = getTool("opfs_delete");
      await expect(del.executor.execute({ path: "a/../../b" })).rejects.toThrow('".." is not allowed');
    });
  });
});
