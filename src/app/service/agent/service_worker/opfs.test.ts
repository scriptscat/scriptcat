import { describe, it, expect, vi } from "vitest";
import { createTestService } from "./test-helpers";

// ---- handleOPFSApi 测试 ----

describe("handleOPFSApi", () => {
  // mock sender: getSender() 返回 truthy → supportBlob = false → 使用 blobUrl（chrome.runtime 通道）
  const mockOPFSSender = { getSender: () => ({ id: "test" }) } as any;

  // 构建内存 OPFS mock（与 opfs_tools.test.ts 相同逻辑）
  type FSNode = { kind: "file"; content: string } | { kind: "directory"; children: Map<string, FSNode> };

  function createMockFS() {
    const root: FSNode = { kind: "directory", children: new Map() };

    function makeDirectoryHandle(node: FSNode & { kind: "directory" }, name = ""): any {
      return {
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
          if (!node.children.has(childName)) throw new DOMException(`"${childName}" not found`, "NotFoundError");
          node.children.delete(childName);
        },
        async *[Symbol.asyncIterator]() {
          for (const [n, c] of node.children) {
            if (c.kind === "file") yield [n, makeFileHandle(c as FSNode & { kind: "file" }, n)];
            else yield [n, makeDirectoryHandle(c as FSNode & { kind: "directory" }, n)];
          }
        },
      };
    }

    function makeFileHandle(node: FSNode & { kind: "file" }, name: string): any {
      return {
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
    }

    return { rootHandle: makeDirectoryHandle(root, "") };
  }

  function setupOPFS() {
    const mockFS = createMockFS();
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      storage: { getDirectory: vi.fn().mockResolvedValue(mockFS.rootHandle) },
    });
    return mockFS;
  }

  it("write + read 应正确写入和读取文件", async () => {
    setupOPFS();
    const { service } = createTestService();

    const writeResult = (await service.handleOPFSApi(
      {
        action: "write",
        path: "test.txt",
        content: "Hello OPFS",
        scriptUuid: "s1",
      },
      mockOPFSSender
    )) as any;
    expect(writeResult.path).toBe("test.txt");
    expect(writeResult.size).toBe(10);

    const readResult = (await service.handleOPFSApi(
      {
        action: "read",
        path: "test.txt",
        scriptUuid: "s1",
      },
      mockOPFSSender
    )) as any;
    expect(readResult.content).toBe("Hello OPFS");
  });

  it("list 应返回目录内容", async () => {
    setupOPFS();
    const { service } = createTestService();

    await service.handleOPFSApi({ action: "write", path: "a.txt", content: "a", scriptUuid: "s1" }, mockOPFSSender);
    await service.handleOPFSApi(
      { action: "write", path: "dir/b.txt", content: "bb", scriptUuid: "s1" },
      mockOPFSSender
    );

    const listResult = (await service.handleOPFSApi({ action: "list", scriptUuid: "s1" }, mockOPFSSender)) as any[];
    expect(listResult).toHaveLength(2);
    expect(listResult.find((e: any) => e.name === "a.txt")).toBeDefined();
    expect(listResult.find((e: any) => e.name === "dir")).toBeDefined();
  });

  it("delete 应删除文件", async () => {
    setupOPFS();
    const { service } = createTestService();

    await service.handleOPFSApi({ action: "write", path: "tmp.txt", content: "x", scriptUuid: "s1" }, mockOPFSSender);
    const delResult = (await service.handleOPFSApi(
      { action: "delete", path: "tmp.txt", scriptUuid: "s1" },
      mockOPFSSender
    )) as any;
    expect(delResult.success).toBe(true);

    await expect(
      service.handleOPFSApi({ action: "read", path: "tmp.txt", scriptUuid: "s1" }, mockOPFSSender)
    ).rejects.toThrow();
  });

  it("未知 action 应抛出错误", async () => {
    const { service } = createTestService();
    await expect(service.handleOPFSApi({ action: "unknown" as any, scriptUuid: "s1" }, mockOPFSSender)).rejects.toThrow(
      "Unknown OPFS action"
    );
  });

  it("readAttachment 应返回 blobUrl", async () => {
    const { service, mockRepo } = createTestService();
    const testBlob = new Blob(["test image data"], { type: "image/png" });
    mockRepo.getAttachment = vi.fn().mockResolvedValue(testBlob);

    const result = (await service.handleOPFSApi(
      {
        action: "readAttachment",
        id: "att-123",
        scriptUuid: "s1",
      },
      mockOPFSSender
    )) as any;

    expect(result.id).toBe("att-123");
    expect(result.blobUrl).toBe("blob:chrome-extension://test/mock-blob-url");
    expect(result.size).toBe(testBlob.size);
    expect(result.mimeType).toBe("image/png");
    expect(mockRepo.getAttachment).toHaveBeenCalledWith("att-123");
  });

  it("readAttachment 附件不存在时应抛出错误", async () => {
    const { service, mockRepo } = createTestService();
    mockRepo.getAttachment = vi.fn().mockResolvedValue(null);

    await expect(
      service.handleOPFSApi({ action: "readAttachment", id: "not-exist", scriptUuid: "s1" }, mockOPFSSender)
    ).rejects.toThrow("Attachment not found: not-exist");
  });

  it("read blob 格式应返回 blobUrl", async () => {
    setupOPFS();
    const { service } = createTestService();

    await service.handleOPFSApi(
      { action: "write", path: "img.png", content: "fake png", scriptUuid: "s1" },
      mockOPFSSender
    );

    const result = (await service.handleOPFSApi(
      {
        action: "read",
        path: "img.png",
        format: "blob",
        scriptUuid: "s1",
      },
      mockOPFSSender
    )) as any;

    expect(result.path).toBe("img.png");
    expect(result.blobUrl).toBe("blob:chrome-extension://test/mock-blob-url");
    expect(result.mimeType).toBe("image/png");
    expect(result.size).toBeGreaterThan(0);
  });
});
