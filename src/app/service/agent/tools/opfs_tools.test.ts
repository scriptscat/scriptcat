import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOPFSTools, sanitizePath, setCreateBlobUrlFn, guessMimeType } from "./opfs_tools";
import { isText } from "@App/pkg/utils/istextorbinary";

// ---- In-memory OPFS mock ----

type FSNode = { kind: "file"; content: string | Uint8Array } | { kind: "directory"; children: Map<string, FSNode> };

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
        return new Blob([node.content as BlobPart]);
      },
      async createWritable() {
        const chunks: (string | Uint8Array)[] = [];
        return {
          async write(data: string | Uint8Array) {
            chunks.push(data);
          },
          async close() {
            // 合并所有 chunk，如果全是 string 就存 string，否则存 Uint8Array
            if (chunks.every((c) => typeof c === "string")) {
              node.content = chunks.join("");
            } else {
              const blob = new Blob(chunks as BlobPart[]);
              node.content = new Uint8Array(await blob.arrayBuffer());
            }
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

describe("guessMimeType", () => {
  it("常见文本扩展名返回正确 MIME", () => {
    expect(guessMimeType("readme.md")).toBe("text/markdown");
    expect(guessMimeType("data.csv")).toBe("text/csv");
    expect(guessMimeType("config.yaml")).toBe("text/yaml");
    expect(guessMimeType("config.yml")).toBe("text/yaml");
    expect(guessMimeType("index.html")).toBe("text/html");
    expect(guessMimeType("index.htm")).toBe("text/html");
    expect(guessMimeType("style.css")).toBe("text/css");
    expect(guessMimeType("data.xml")).toBe("text/xml");
    expect(guessMimeType("data.json")).toBe("application/json");
    expect(guessMimeType("app.js")).toBe("application/javascript");
    expect(guessMimeType("lib.mjs")).toBe("application/javascript");
  });

  it("常见二进制扩展名返回正确 MIME", () => {
    expect(guessMimeType("photo.png")).toBe("image/png");
    expect(guessMimeType("photo.jpg")).toBe("image/jpeg");
    expect(guessMimeType("song.mp3")).toBe("audio/mpeg");
    expect(guessMimeType("video.mp4")).toBe("video/mp4");
    expect(guessMimeType("doc.pdf")).toBe("application/pdf");
    expect(guessMimeType("archive.zip")).toBe("application/zip");
  });

  it("未知扩展名返回 octet-stream", () => {
    expect(guessMimeType("data.xyz")).toBe("application/octet-stream");
    expect(guessMimeType("Makefile")).toBe("application/octet-stream");
    expect(guessMimeType("file.rar")).toBe("application/octet-stream");
  });
});

describe("isText（内容检测）", () => {
  it("UTF-8 文本内容被识别为文本", () => {
    const textContent = new TextEncoder().encode("Hello, world!\nThis is a text file.");
    expect(isText(textContent)).toBe(true);
  });

  it("中文 UTF-8 文本被识别为文本", () => {
    const textContent = new TextEncoder().encode("你好，世界！这是一个文本文件。");
    expect(isText(textContent)).toBe(true);
  });

  it("含 null 字节的内容被识别为二进制", () => {
    // isText 检测 charCode <= 8 为二进制（null byte = 0x00）
    const binaryContent = new Uint8Array([0x00, 0x01, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00]);
    expect(isText(binaryContent)).toBe(false);
  });

  it("空内容返回 false", () => {
    expect(isText(null)).toBe(false);
    expect(isText(undefined)).toBe(false);
  });
});

describe("opfs_tools", () => {
  let mockFS: ReturnType<typeof createMockFS>;

  beforeEach(() => {
    mockFS = createMockFS();
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      storage: {
        getDirectory: vi.fn().mockResolvedValue(mockFS.rootHandle),
      },
    });
    // opfs_read 读取二进制文件时需要 createBlobUrlFn 生成 blob URL
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
    it("should write and read a text file", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      const writeResult = JSON.parse(
        (await write.executor.execute({ path: "hello.txt", content: "Hello!" })) as string
      );
      expect(writeResult.path).toBe("hello.txt");
      expect(writeResult.size).toBe(6);

      const readResult = JSON.parse((await read.executor.execute({ path: "hello.txt" })) as string);
      expect(readResult.path).toBe("hello.txt");
      expect(readResult.type).toBe("text");
      expect(readResult.content).toBe("Hello!");
    });

    it("should create nested directories automatically", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "a/b/c.txt", content: "deep" });
      const result = JSON.parse((await read.executor.execute({ path: "a/b/c.txt" })) as string);
      expect(result.type).toBe("text");
      expect(result.content).toBe("deep");
    });

    it("should overwrite existing file", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "f.txt", content: "v1" });
      await write.executor.execute({ path: "f.txt", content: "v2" });
      const result = JSON.parse((await read.executor.execute({ path: "f.txt" })) as string);
      expect(result.type).toBe("text");
      expect(result.content).toBe("v2");
    });

    it("should strip leading slashes from path", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "/leading.txt", content: "ok" });
      const result = JSON.parse((await read.executor.execute({ path: "leading.txt" })) as string);
      expect(result.type).toBe("text");
      expect(result.content).toBe("ok");
    });

    it("should reject .. in path", async () => {
      const write = getTool("opfs_write");
      await expect(write.executor.execute({ path: "../escape.txt", content: "bad" })).rejects.toThrow(
        '".." is not allowed'
      );
    });
  });

  describe("opfs_read 文本读取", () => {
    it("should return text content for text files", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "hello.txt", content: "line1\nline2\nline3" });
      const result = JSON.parse((await read.executor.execute({ path: "hello.txt" })) as string);
      expect(result.type).toBe("text");
      expect(result.content).toBe("line1\nline2\nline3");
      expect(result.totalLines).toBe(3);
      expect(result.startLine).toBe(1);
      expect(result.endLine).toBe(3);
      expect(result.blobUrl).toBeUndefined();
    });

    it("should return text content for json files", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "data.json", content: '{"key":"value"}' });
      const result = JSON.parse((await read.executor.execute({ path: "data.json" })) as string);
      expect(result.type).toBe("text");
      expect(result.content).toBe('{"key":"value"}');
    });

    it("should return blob URL for binary files (png)", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      // 先通过 write 创建文件（建立 workspace 目录结构），再替换为二进制内容
      await write.executor.execute({ path: "image.png", content: "placeholder" });
      const wsDir = mockFS.root.children.get("agents") as FSNode & { kind: "directory" };
      const workspace = wsDir.children.get("workspace") as FSNode & { kind: "directory" };
      workspace.children.set("image.png", {
        kind: "file",
        content: new Uint8Array([0x89, 0x50, 0x00, 0x47, 0x00, 0x0a, 0x00, 0x0a]),
      });

      const result = JSON.parse((await read.executor.execute({ path: "image.png" })) as string);
      expect(result.type).toBe("binary");
      expect(result.blobUrl).toBe("blob:mock-url");
      expect(result.content).toBeUndefined();
    });

    it("mode=blob 时文本文件也返回 blob URL", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "readme.txt", content: "hello" });
      const result = JSON.parse((await read.executor.execute({ path: "readme.txt", mode: "blob" })) as string);
      expect(result.type).toBe("binary");
      expect(result.blobUrl).toBe("blob:mock-url");
      expect(result.content).toBeUndefined();
    });

    it("mode=text 时二进制内容也强制返回文本", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      // 先创建文件，再替换为二进制内容
      await write.executor.execute({ path: "data.bin", content: "placeholder" });
      const wsDir = mockFS.root.children.get("agents") as FSNode & { kind: "directory" };
      const workspace = wsDir.children.get("workspace") as FSNode & { kind: "directory" };
      workspace.children.set("data.bin", {
        kind: "file",
        content: new Uint8Array([0x48, 0x00, 0x65, 0x00, 0x6c, 0x00]),
      });

      // auto 模式下内容检测为二进制，返回 blob
      const blobResult = JSON.parse((await read.executor.execute({ path: "data.bin" })) as string);
      expect(blobResult.type).toBe("binary");

      // mode=text 强制文本读取
      const textResult = JSON.parse((await read.executor.execute({ path: "data.bin", mode: "text" })) as string);
      expect(textResult.type).toBe("text");
    });

    it("should support offset and limit for line-based reading", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n");
      await write.executor.execute({ path: "multi.txt", content: lines });

      const result = JSON.parse((await read.executor.execute({ path: "multi.txt", offset: 3, limit: 4 })) as string);
      expect(result.content).toBe("line3\nline4\nline5\nline6");
      expect(result.startLine).toBe(3);
      expect(result.endLine).toBe(6);
      expect(result.totalLines).toBe(10);
    });

    it("should error when text file exceeds max lines without offset/limit", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      // 生成 201 行文本
      const lines = Array.from({ length: 201 }, (_, i) => `line${i + 1}`).join("\n");
      await write.executor.execute({ path: "big.txt", content: lines });

      await expect(read.executor.execute({ path: "big.txt" })).rejects.toThrow(/201/);
      await expect(read.executor.execute({ path: "big.txt" })).rejects.toThrow(/offset/);
    });

    it("should allow reading large file with offset/limit", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      const lines = Array.from({ length: 300 }, (_, i) => `line${i + 1}`).join("\n");
      await write.executor.execute({ path: "big.txt", content: lines });

      const result = JSON.parse((await read.executor.execute({ path: "big.txt", offset: 290, limit: 11 })) as string);
      expect(result.startLine).toBe(290);
      expect(result.endLine).toBe(300);
      expect(result.totalLines).toBe(300);
    });

    it("should clamp offset to valid range", async () => {
      const write = getTool("opfs_write");
      const read = getTool("opfs_read");

      await write.executor.execute({ path: "small.txt", content: "a\nb\nc" });

      // offset 超出范围
      const result = JSON.parse((await read.executor.execute({ path: "small.txt", offset: 100, limit: 5 })) as string);
      expect(result.content).toBe("");
      expect(result.startLine).toBe(100);
      expect(result.endLine).toBe(3);
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
