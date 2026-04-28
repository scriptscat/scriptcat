import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WebDAVClient } from "webdav";
import { getPatcher } from "webdav";
import WebDAVFileSystem from "./webdav";
import { WarpTokenError } from "../error";

/** 创建 mock WebDAVClient */
function createMockClient(overrides?: Partial<WebDAVClient>): WebDAVClient {
  return {
    getQuota: vi.fn().mockResolvedValue({}),
    getDirectoryContents: vi.fn().mockResolvedValue([]),
    getFileContents: vi.fn().mockResolvedValue("content"),
    putFileContents: vi.fn().mockResolvedValue(true),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as WebDAVClient;
}

/** 创建可测试的 WebDAVFileSystem 实例（替换 client 为 mock） */
function createTestFS(mockClient: WebDAVClient, url = "https://dav.example.com"): WebDAVFileSystem {
  const fs = WebDAVFileSystem.fromCredentials(url, {});
  fs.client = mockClient;
  return fs;
}

describe("WebDAVFileSystem", () => {
  let mockClient: WebDAVClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  describe("initWebDAVPatch", () => {
    it("应当通过 getPatcher 注册 fetch patch，设置 credentials 为 omit", () => {
      // fromCredentials 内部调用 initWebDAVPatch，验证 patcher 已注册 fetch
      WebDAVFileSystem.fromCredentials("https://dav.example.com", {});

      const patcher = getPatcher();
      // 验证 fetch 已被 patch（patcher 内部有 fetch 注册）
      expect(patcher.isPatched("fetch")).toBe(true);
    });
  });

  describe("fromCredentials", () => {
    it("应当创建 WebDAVFileSystem 实例并设置 url 和 basePath", () => {
      const fs = WebDAVFileSystem.fromCredentials("https://dav.example.com", {
        authType: "password" as any,
        username: "user",
        password: "pass",
      });

      expect(fs).toBeInstanceOf(WebDAVFileSystem);
      expect(fs.url).toBe("https://dav.example.com");
      expect(fs.basePath).toBe("/");
    });
  });

  describe("fromSameClient", () => {
    it("应当复用已有 client 并设置新 basePath", () => {
      const fs = createTestFS(mockClient);
      const subFs = WebDAVFileSystem.fromSameClient(fs, "/subdir");

      expect(subFs).toBeInstanceOf(WebDAVFileSystem);
      expect(subFs.url).toBe("https://dav.example.com");
      expect(subFs.basePath).toBe("/subdir");
      expect(subFs.client).toBe(mockClient);
    });
  });

  describe("verify", () => {
    it("应当成功验证", async () => {
      const fs = createTestFS(mockClient);

      await expect(fs.verify()).resolves.toBeUndefined();
      expect(mockClient.getQuota).toHaveBeenCalled();
    });

    it("应当在 401 时抛出 WarpTokenError", async () => {
      (mockClient.getQuota as ReturnType<typeof vi.fn>).mockRejectedValue({
        response: { status: 401 },
        message: "Unauthorized",
      });
      const fs = createTestFS(mockClient);

      await expect(fs.verify()).rejects.toBeInstanceOf(WarpTokenError);
    });

    it("应当在其他错误时抛出包含原始信息的 Error", async () => {
      (mockClient.getQuota as ReturnType<typeof vi.fn>).mockRejectedValue({
        message: "Network error",
      });
      const fs = createTestFS(mockClient);

      await expect(fs.verify()).rejects.toThrow("WebDAV verify failed: Network error");
    });
  });

  describe("openDir", () => {
    it("应当返回新实例并拼接路径", async () => {
      const fs = createTestFS(mockClient);
      const subFs = (await fs.openDir("docs")) as WebDAVFileSystem;

      expect(subFs).toBeInstanceOf(WebDAVFileSystem);
      expect(subFs.basePath).toBe("/docs");
      expect(subFs.client).toBe(mockClient);
    });

    it("应当支持嵌套 openDir", async () => {
      const fs = createTestFS(mockClient);
      const sub1 = (await fs.openDir("a")) as WebDAVFileSystem;
      const sub2 = (await sub1.openDir("b")) as WebDAVFileSystem;

      expect(sub2.basePath).toBe("/a/b");
    });
  });

  describe("createDir", () => {
    it("应当调用 createDirectory", async () => {
      const fs = createTestFS(mockClient);

      await fs.createDir("new-folder");

      expect(mockClient.createDirectory).toHaveBeenCalledWith("/new-folder");
    });

    it("应当在 405 错误时静默成功（目录已存在）", async () => {
      (mockClient.createDirectory as ReturnType<typeof vi.fn>).mockRejectedValue({
        response: { status: 405 },
        message: "405 Method Not Allowed",
      });
      const fs = createTestFS(mockClient);

      await expect(fs.createDir("existing")).resolves.toBeUndefined();
    });

    it("应当在 message 包含 405 时也静默成功", async () => {
      (mockClient.createDirectory as ReturnType<typeof vi.fn>).mockRejectedValue({
        message: "Request failed with status code 405",
      });
      const fs = createTestFS(mockClient);

      await expect(fs.createDir("existing")).resolves.toBeUndefined();
    });

    it("应当在其他错误时抛出异常", async () => {
      const err = new Error("Forbidden");
      (mockClient.createDirectory as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      const fs = createTestFS(mockClient);

      await expect(fs.createDir("denied")).rejects.toThrow("Forbidden");
    });
  });

  describe("delete", () => {
    it("应当调用 deleteFile", async () => {
      const fs = createTestFS(mockClient);

      await fs.delete("test.txt");

      expect(mockClient.deleteFile).toHaveBeenCalledWith("/test.txt");
    });

    it("应当在 404 时静默成功（幂等删除）", async () => {
      (mockClient.deleteFile as ReturnType<typeof vi.fn>).mockRejectedValue({
        response: { status: 404 },
        message: "404 Not Found",
      });
      const fs = createTestFS(mockClient);

      await expect(fs.delete("missing.txt")).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    it("应当列出文件并过滤目录", async () => {
      (mockClient.getDirectoryContents as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          type: "file",
          basename: "test.txt",
          lastmod: "2024-01-01T00:00:00Z",
          etag: '"abc"',
          size: 1024,
        },
        {
          type: "directory",
          basename: "subdir",
          lastmod: "2024-01-01T00:00:00Z",
          etag: "",
          size: 0,
        },
      ]);
      const fs = createTestFS(mockClient);

      const files = await fs.list();

      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        name: "test.txt",
        path: "/",
        digest: '"abc"',
        size: 1024,
      });
    });

    it("应当在 404 时返回空数组", async () => {
      (mockClient.getDirectoryContents as ReturnType<typeof vi.fn>).mockRejectedValue({
        response: { status: 404 },
      });
      const fs = createTestFS(mockClient);

      const files = await fs.list();
      expect(files).toHaveLength(0);
    });

    it("应当在其他错误时抛出异常", async () => {
      const err = new Error("Server Error");
      (err as any).response = { status: 500 };
      (mockClient.getDirectoryContents as ReturnType<typeof vi.fn>).mockRejectedValue(err);
      const fs = createTestFS(mockClient);

      await expect(fs.list()).rejects.toThrow("Server Error");
    });
  });

  describe("getDirUrl", () => {
    it("应当返回 url + basePath", async () => {
      const fs = createTestFS(mockClient);
      const subFs = (await fs.openDir("docs")) as WebDAVFileSystem;

      expect(await subFs.getDirUrl()).toBe("https://dav.example.com/docs");
    });

    it("根路径应返回 url + /", async () => {
      const fs = createTestFS(mockClient);

      expect(await fs.getDirUrl()).toBe("https://dav.example.com/");
    });
  });
});
