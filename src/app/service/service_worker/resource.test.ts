import { initTestEnv } from "@Tests/utils";
import { ResourceService } from "./resource";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";

initTestEnv();

// mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// 创建文本 blob 和二进制 blob 的辅助函数
function textBlob(content: string, contentType = "text/plain") {
  return new Blob([content], { type: contentType });
}

function binaryBlob(bytes: number[]) {
  return new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
}

function mockResponse(blob: Blob, status = 200, contentType?: string) {
  return {
    status,
    blob: () => Promise.resolve(blob),
    headers: new Headers(contentType ? { "content-type": contentType } : {}),
  } as unknown as Response;
}

describe("ResourceService - loadByUrl", () => {
  let service: ResourceService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockGroup = {} as Group;
    const mockMQ = {} as IMessageQueue;
    service = new ResourceService(mockGroup, mockMQ);
    // calculateHash 不影响核心逻辑，直接 mock
    vi.spyOn(service, "calculateHash").mockResolvedValue({
      md5: "mock-md5",
      sha1: "",
      sha256: "",
      sha384: "",
      sha512: "",
    });
  });

  it("加载文本资源(require)时应设置 content", async () => {
    const jsCode = "console.log('hello');";
    mockFetch.mockResolvedValue(mockResponse(textBlob(jsCode), 200, "application/javascript; charset=utf-8"));

    const res = await service.loadByUrl("https://example.com/lib.js", "require");

    expect(res.url).toBe("https://example.com/lib.js");
    expect(res.content).toBeTruthy();
    expect(res.contentType).toBe("application/javascript");
    expect(res.base64).toBeTruthy();
    expect(res.type).toBe("require");
  });

  it("加载文本资源(resource)时应通过 blob.text() 设置 content", async () => {
    const text = "plain text content";
    mockFetch.mockResolvedValue(mockResponse(textBlob(text), 200, "text/plain"));

    const res = await service.loadByUrl("https://example.com/data.txt", "resource");

    expect(res.content).toBe(text);
    expect(res.type).toBe("resource");
  });

  it("加载二进制资源时 content 应为空", async () => {
    // 包含 null 字节的二进制数据，isText 会返回 false
    const bytes = [0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00];
    mockFetch.mockResolvedValue(mockResponse(binaryBlob(bytes), 200, "image/png"));

    const res = await service.loadByUrl("https://example.com/img.png", "resource");

    expect(res.content).toBe("");
    expect(res.base64).toBeTruthy();
    expect(res.contentType).toBe("image/png");
  });

  it("响应非200时应抛出异常", async () => {
    mockFetch.mockResolvedValue(mockResponse(textBlob(""), 404));

    await expect(service.loadByUrl("https://example.com/404", "require")).rejects.toThrow(
      "resource response status not 200: 404"
    );
  });

  it("没有 content-type 时应默认为 application/octet-stream", async () => {
    mockFetch.mockResolvedValue(mockResponse(textBlob("data"), 200));

    const res = await service.loadByUrl("https://example.com/noct", "resource");

    expect(res.contentType).toBe("application/octet-stream");
  });
});
