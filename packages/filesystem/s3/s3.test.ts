import { describe, it, expect, vi, beforeEach } from "vitest";
import S3FileSystem from "./s3";
import { S3Client, S3Error } from "./client";
import type { FileInfo } from "../filesystem";

/** 创建 mock S3Client 实例（通过 prototype 伪装为 S3Client 的实例） */
function createMockClient(overrides?: Partial<S3Client>): S3Client {
  const mock = {
    request: vi.fn(),
    getEndpointUrl: vi.fn().mockReturnValue("https://s3.us-east-1.amazonaws.com"),
    hasCustomEndpoint: vi.fn().mockReturnValue(false),
    getRegion: vi.fn().mockReturnValue("us-east-1"),
    isForcePathStyle: vi.fn().mockReturnValue(true),
    ...overrides,
  };
  // 让 instanceof S3Client 检查通过
  Object.setPrototypeOf(mock, S3Client.prototype);
  return mock as unknown as S3Client;
}

/** 创建 mock Response */
function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
  blob?: Blob;
}): Response {
  const { ok = true, status = 200, statusText = "OK", text = "" } = options;
  return {
    ok,
    status,
    statusText,
    headers: new Headers(),
    text: vi.fn().mockResolvedValue(text),
    blob: vi.fn().mockResolvedValue(options.blob ?? new Blob([text])),
  } as unknown as Response;
}

describe("S3FileSystem", () => {
  let mockClient: S3Client;
  let fs: S3FileSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    fs = new S3FileSystem("test-bucket", mockClient);
  });

  // ---- verify ----
  describe("verify", () => {
    it("应当成功验证 bucket", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ ok: true }));

      await expect(fs.verify()).resolves.toBeUndefined();
      expect(mockClient.request).toHaveBeenCalledWith("HEAD", "test-bucket");
    });

    it("应当在 bucket 不存在时抛出 NotFound 错误", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("NoSuchBucket", "The specified bucket does not exist", 404)
      );

      await expect(fs.verify()).rejects.toThrow("NotFound");
    });

    it("应当在 404 状态码时抛出 NotFound 错误", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(new S3Error("NotFound", "Not Found", 404));

      await expect(fs.verify()).rejects.toThrow("NotFound");
    });

    it("应当在认证失败时抛出 WarpTokenError", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("InvalidAccessKeyId", "The AWS Access Key Id you provided does not exist", 403)
      );

      await expect(fs.verify()).rejects.toMatchObject({
        error: expect.any(S3Error),
      });
    });

    it("应当在 SignatureDoesNotMatch 时抛出 WarpTokenError", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("SignatureDoesNotMatch", "Signature does not match", 403)
      );

      await expect(fs.verify()).rejects.toMatchObject({
        error: expect.any(S3Error),
      });
    });

    it("应当在 AccessDenied 时抛出 Access Denied 错误", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("AccessDenied", "Access Denied", 403)
      );

      await expect(fs.verify()).rejects.toThrow("Access Denied");
    });

    it("应当在 PermanentRedirect (301) 时抛出 Access Denied 错误", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("PermanentRedirect", "Permanent Redirect", 301)
      );

      await expect(fs.verify()).rejects.toThrow("Access Denied");
    });

    it("应当在网络错误时抛出网络连接失败错误", async () => {
      const networkError = new Error("fetch failed");
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(networkError);

      await expect(fs.verify()).rejects.toThrow("Network connection failed");
    });

    it("应当将未知错误原样抛出", async () => {
      const unknownError = new Error("unknown error");
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(unknownError);

      await expect(fs.verify()).rejects.toThrow("unknown error");
    });
  });

  // ---- open ----
  describe("open", () => {
    it("应当返回 S3FileReader", async () => {
      const fileInfo: FileInfo = {
        name: "test.txt",
        path: "/docs",
        size: 100,
        digest: "abc",
        createtime: 1000,
        updatetime: 2000,
      };
      const reader = await fs.open(fileInfo);

      expect(reader).toBeDefined();
      expect(reader.read).toBeTypeOf("function");
    });

    it("S3FileReader.read 应调用 client.request GET", async () => {
      const fileInfo: FileInfo = {
        name: "hello.txt",
        path: "/data",
        size: 50,
        digest: "xyz",
        createtime: 1000,
        updatetime: 2000,
      };
      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ text: "file content" }));

      const reader = await fs.open(fileInfo);
      const content = await reader.read("string");

      expect(mockClient.request).toHaveBeenCalledWith("GET", "test-bucket", "data/hello.txt");
      expect(content).toBe("file content");
    });
  });

  // ---- create ----
  describe("create", () => {
    it("应当返回 S3FileWriter", async () => {
      const writer = await fs.create("test.txt");

      expect(writer).toBeDefined();
      expect(writer.write).toBeTypeOf("function");
    });

    it("S3FileWriter.write 应调用 client.request PUT", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ ok: true }));

      const writer = await fs.create("output.txt");
      await writer.write("hello world");

      expect(mockClient.request).toHaveBeenCalledWith(
        "PUT",
        "test-bucket",
        "output.txt",
        expect.objectContaining({
          body: "hello world",
          headers: expect.objectContaining({
            "content-type": "application/octet-stream",
          }),
        })
      );
    });
  });

  // ---- createDir ----
  describe("createDir", () => {
    it("应当静默成功（S3 中目录是隐式的）", async () => {
      await expect(fs.createDir("new-dir")).resolves.toBeUndefined();
    });
  });

  // ---- delete ----
  describe("delete", () => {
    it("应当成功删除文件", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ ok: true, status: 204 }));

      await expect(fs.delete("test.txt")).resolves.toBeUndefined();
      expect(mockClient.request).toHaveBeenCalledWith("DELETE", "test-bucket", "test.txt");
    });

    it("应当在 NoSuchKey 时静默成功（幂等删除）", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("NoSuchKey", "The specified key does not exist", 404)
      );

      await expect(fs.delete("nonexistent.txt")).resolves.toBeUndefined();
    });

    it("应当在其它 S3 错误时抛出异常", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("AccessDenied", "Access Denied", 403)
      );

      await expect(fs.delete("test.txt")).rejects.toThrow();
    });
  });

  // ---- list ----
  describe("list", () => {
    it("应当列出当前目录下的文件", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>file1.txt</Key>
            <LastModified>2024-01-01T00:00:00.000Z</LastModified>
            <ETag>"abc123"</ETag>
            <Size>1024</Size>
          </Contents>
          <Contents>
            <Key>file2.txt</Key>
            <LastModified>2024-01-02T00:00:00.000Z</LastModified>
            <ETag>"def456"</ETag>
            <Size>2048</Size>
          </Contents>
        </ListBucketResult>`;

      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ text: xml }));

      const files = await fs.list();

      expect(files).toHaveLength(2);
      expect(files[0]).toMatchObject({
        name: "file1.txt",
        path: "/",
        size: 1024,
        digest: "abc123",
      });
      expect(files[1]).toMatchObject({
        name: "file2.txt",
        path: "/",
        size: 2048,
        digest: "def456",
      });
    });

    it("应当正确处理带 basePath 的目录列表", async () => {
      const subFs = new S3FileSystem("test-bucket", mockClient, "/docs");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>docs/readme.md</Key>
            <LastModified>2024-06-15T12:00:00.000Z</LastModified>
            <ETag>"aaa"</ETag>
            <Size>512</Size>
          </Contents>
        </ListBucketResult>`;

      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ text: xml }));

      const files = await subFs.list();

      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        name: "readme.md",
        path: "/docs",
        size: 512,
      });
    });

    it("应当跳过目录占位符（以 / 结尾的 key）", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>subdir/</Key>
            <LastModified>2024-01-01T00:00:00.000Z</LastModified>
            <ETag>""</ETag>
            <Size>0</Size>
          </Contents>
          <Contents>
            <Key>file.txt</Key>
            <LastModified>2024-01-01T00:00:00.000Z</LastModified>
            <ETag>"xyz"</ETag>
            <Size>100</Size>
          </Contents>
        </ListBucketResult>`;

      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ text: xml }));

      const files = await fs.list();

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("file.txt");
    });

    it("应当处理分页（isTruncated + continuationToken）", async () => {
      const xmlPage1 = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>true</IsTruncated>
          <NextContinuationToken>token123</NextContinuationToken>
          <Contents>
            <Key>file1.txt</Key>
            <LastModified>2024-01-01T00:00:00.000Z</LastModified>
            <ETag>"aaa"</ETag>
            <Size>100</Size>
          </Contents>
        </ListBucketResult>`;

      const xmlPage2 = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>file2.txt</Key>
            <LastModified>2024-01-02T00:00:00.000Z</LastModified>
            <ETag>"bbb"</ETag>
            <Size>200</Size>
          </Contents>
        </ListBucketResult>`;

      (mockClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockResponse({ text: xmlPage1 }))
        .mockResolvedValueOnce(createMockResponse({ text: xmlPage2 }));

      const files = await fs.list();

      expect(files).toHaveLength(2);
      expect(files[0].name).toBe("file1.txt");
      expect(files[1].name).toBe("file2.txt");
      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });

    it("应当返回空数组当目录为空时", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
        </ListBucketResult>`;

      (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ text: xml }));

      const files = await fs.list();
      expect(files).toHaveLength(0);
    });

    it("应当在 AccessDenied 时抛出权限错误", async () => {
      (mockClient.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new S3Error("AccessDenied", "Access Denied", 403)
      );

      await expect(fs.list()).rejects.toThrow("Permission denied");
    });
  });

  // ---- openDir ----
  describe("openDir", () => {
    it("应当返回新的 S3FileSystem 实例并拼接路径", async () => {
      const subFs = (await fs.openDir("subdir")) as S3FileSystem;

      expect(subFs).toBeInstanceOf(S3FileSystem);
      expect(subFs.bucket).toBe("test-bucket");
      expect(subFs.basePath).toBe("/subdir");
    });

    it("应当支持嵌套 openDir", async () => {
      const sub1 = (await fs.openDir("a")) as S3FileSystem;
      const sub2 = (await sub1.openDir("b")) as S3FileSystem;

      expect(sub2.basePath).toBe("/a/b");
    });
  });

  // ---- getDirUrl ----
  describe("getDirUrl", () => {
    it("自定义 endpoint 应当返回 endpoint + bucket/prefix 路径", async () => {
      const customClient = createMockClient({
        hasCustomEndpoint: vi.fn().mockReturnValue(true),
        getEndpointUrl: vi.fn().mockReturnValue("https://minio.example.com"),
      });
      const customFs = new S3FileSystem("my-bucket", customClient, "/data");

      const url = await customFs.getDirUrl();
      expect(url).toBe("https://minio.example.com/my-bucket/data");
    });

    it("AWS S3 应当返回控制台 URL", async () => {
      const url = await fs.getDirUrl();
      expect(url).toContain("s3.console.aws.amazon.com");
      expect(url).toContain("test-bucket");
      expect(url).toContain("us-east-1");
    });

    it("根目录时 prefix 应为空", async () => {
      const url = await fs.getDirUrl();
      expect(url).toContain("prefix=&");
    });
  });
});
