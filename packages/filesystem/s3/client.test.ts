import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { S3Client, S3Error } from "./client";
import type { S3ClientConfig } from "./client";

// ---- S3Error ----
describe("S3Error", () => {
  it("应当正确设置 code、message、statusCode 属性", () => {
    const err = new S3Error("NoSuchKey", "The specified key does not exist", 404);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(S3Error);
    expect(err.code).toBe("NoSuchKey");
    expect(err.name).toBe("NoSuchKey"); // 兼容 SDK error.name 检查
    expect(err.message).toBe("The specified key does not exist");
    expect(err.statusCode).toBe(404);
  });

  it("应当可被 try/catch 捕获并通过 instanceof 判断", () => {
    try {
      throw new S3Error("AccessDenied", "Access Denied", 403);
    } catch (e) {
      expect(e).toBeInstanceOf(S3Error);
      if (e instanceof S3Error) {
        expect(e.code).toBe("AccessDenied");
        expect(e.statusCode).toBe(403);
      }
    }
  });
});

// ---- S3Client 构造函数与 getter 方法 ----
describe("S3Client", () => {
  const defaultConfig: S3ClientConfig = {
    region: "us-west-2",
    credentials: {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
  };

  describe("constructor", () => {
    it("应当使用默认 AWS endpoint 当未指定 endpoint 时", () => {
      const client = new S3Client(defaultConfig);

      expect(client.getEndpointUrl()).toBe("https://s3.us-west-2.amazonaws.com");
      expect(client.hasCustomEndpoint()).toBe(false);
    });

    it("应当使用自定义 endpoint", () => {
      const client = new S3Client({
        ...defaultConfig,
        endpoint: "https://minio.example.com:9000",
      });

      expect(client.getEndpointUrl()).toBe("https://minio.example.com:9000");
      expect(client.hasCustomEndpoint()).toBe(true);
    });

    it("应当为无协议前缀的 endpoint 自动添加 https://", () => {
      const client = new S3Client({
        ...defaultConfig,
        endpoint: "s3.custom.com",
      });

      expect(client.getEndpointUrl()).toBe("https://s3.custom.com");
    });

    it("应当去除 endpoint 末尾的斜杠", () => {
      const client = new S3Client({
        ...defaultConfig,
        endpoint: "https://minio.example.com///",
      });

      expect(client.getEndpointUrl()).toBe("https://minio.example.com");
    });

    it("应当支持 http:// 协议的 endpoint", () => {
      const client = new S3Client({
        ...defaultConfig,
        endpoint: "http://localhost:9000",
      });

      expect(client.getEndpointUrl()).toBe("http://localhost:9000");
    });

    it("应当默认 forcePathStyle 为 true", () => {
      const client = new S3Client(defaultConfig);

      expect(client.isForcePathStyle()).toBe(true);
    });

    it("应当允许设置 forcePathStyle 为 false", () => {
      const client = new S3Client({
        ...defaultConfig,
        forcePathStyle: false,
      });

      expect(client.isForcePathStyle()).toBe(false);
    });

    it("应当正确返回 region", () => {
      const client = new S3Client(defaultConfig);
      expect(client.getRegion()).toBe("us-west-2");
    });

    it("应当在 region 为空字符串时默认使用 us-east-1", () => {
      const client = new S3Client({
        ...defaultConfig,
        region: "",
      });

      expect(client.getRegion()).toBe("us-east-1");
    });
  });

  // ---- request 方法 ----
  describe("request", () => {
    let client: S3Client;
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      client = new S3Client({
        ...defaultConfig,
        endpoint: "https://s3.us-west-2.amazonaws.com",
      });
      fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("应当发送 GET 请求并返回 Response", async () => {
      const mockResponse = new Response("hello", { status: 200, statusText: "OK" });
      fetchSpy.mockResolvedValue(mockResponse);

      const resp = await client.request("GET", "my-bucket", "test-key.txt");

      expect(resp).toBe(mockResponse);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // 验证 URL（path-style）
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain("/my-bucket/test-key.txt");
      expect(options.method).toBe("GET");
    });

    it("应当在 path-style 模式下构建正确的 URL", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("GET", "my-bucket", "folder/file.txt");

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://s3.us-west-2.amazonaws.com/my-bucket/folder/file.txt");
    });

    it("应当在 virtual-hosted 模式下构建正确的 URL", async () => {
      const vhClient = new S3Client({
        ...defaultConfig,
        forcePathStyle: false,
      });
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await vhClient.request("GET", "my-bucket", "file.txt");

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://my-bucket.s3.us-west-2.amazonaws.com/file.txt");
    });

    it("应当在请求头中包含 AWS Signature V4 签名", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("GET", "my-bucket", "test.txt");

      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;

      // 验证签名头存在
      expect(headers["authorization"]).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\//);
      expect(headers["authorization"]).toContain("SignedHeaders=");
      expect(headers["authorization"]).toContain("Signature=");
      expect(headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
      expect(headers["x-amz-content-sha256"]).toBeDefined();
    });

    it("应当正确传递 query parameters", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("GET", "my-bucket", undefined, {
        queryParams: { "list-type": "2", prefix: "docs/" },
      });

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain("list-type=2");
      expect(url).toContain("prefix=docs%2F");
    });

    it("应当正确传递 string body 的 PUT 请求", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("PUT", "my-bucket", "file.txt", {
        body: "file content",
        headers: { "Content-Type": "text/plain" },
      });

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.method).toBe("PUT");
      expect(options.body).toBe("file content");
    });

    it("应当正确传递 Uint8Array body", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      const body = new TextEncoder().encode("binary data");
      await client.request("PUT", "my-bucket", "binary.bin", { body });

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain("/my-bucket/binary.bin");
      expect(options.method).toBe("PUT");
      // body 应当是 Uint8Array.buffer（ArrayBuffer 或兼容类型）
      expect(options.body).toBeDefined();
      expect(options.body).not.toBeTypeOf("string");
    });

    it("应当在非 2xx 响应时抛出 S3Error（XML 错误体）", async () => {
      const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
        <Error>
          <Code>NoSuchKey</Code>
          <Message>The specified key does not exist.</Message>
        </Error>`;
      fetchSpy.mockResolvedValue(new Response(errorXml, { status: 404, statusText: "Not Found" }));

      try {
        await client.request("GET", "my-bucket", "nonexistent.txt");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(S3Error);
        if (e instanceof S3Error) {
          expect(e.code).toBe("NoSuchKey");
          expect(e.statusCode).toBe(404);
          expect(e.message).toBe("The specified key does not exist.");
        }
      }
    });

    it("应当在无 XML 体的错误响应时使用状态码映射", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));

      await expect(client.request("HEAD", "my-bucket")).rejects.toSatisfy((e: S3Error) => {
        return e instanceof S3Error && e.statusCode === 403;
      });
    });

    it("应当在 DELETE 请求成功时返回 Response", async () => {
      // jsdom 不支持 204 状态码构造 Response，使用 200 代替验证 DELETE 请求逻辑
      fetchSpy.mockResolvedValue(new Response(null, { status: 200, statusText: "OK" }));

      const resp = await client.request("DELETE", "my-bucket", "file.txt");
      expect(resp.status).toBe(200);
    });

    it("应当不在 fetch headers 中包含 host 头", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("GET", "my-bucket", "test.txt");

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers["host"]).toBeUndefined();
    });

    it("应当将自定义 headers 的 key 转为小写", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("PUT", "my-bucket", "test.txt", {
        body: "data",
        headers: { "Content-Type": "text/plain", "X-Custom-Header": "value" },
      });

      const [, options] = fetchSpy.mock.calls[0];
      // authorization 中 SignedHeaders 应包含小写 key
      expect(options.headers["authorization"]).toContain("content-type");
      expect(options.headers["authorization"]).toContain("x-custom-header");
    });

    it("应当在不传 key 时只使用 bucket 路径", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("HEAD", "my-bucket");

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://s3.us-west-2.amazonaws.com/my-bucket");
    });

    it("应当正确处理包含特殊字符的 key", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

      await client.request("GET", "my-bucket", "path/to/file with spaces.txt");

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain("file%20with%20spaces.txt");
    });
  });
});
