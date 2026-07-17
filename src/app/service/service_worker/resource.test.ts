import { initTestEnv } from "@Tests/utils";
import { ResourceService } from "./resource";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { parseUrlSRI } from "./utils";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_RUN_STATUS_COMPLETE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { Resource } from "@App/app/repo/resource";

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

function normalScript(uuid: string, metadata: Script["metadata"]): Script {
  return {
    uuid,
    name: uuid,
    namespace: "test",
    metadata,
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    runStatus: SCRIPT_RUN_STATUS_COMPLETE,
    createtime: Date.now(),
    checktime: 0,
  } as Script;
}

function resourceModel(url: string, content: string, updatetime = Date.now()): Resource {
  return {
    url,
    content,
    contentType: "text/plain",
    hash: {
      md5: "mock-md5",
      sha1: "",
      sha256: "",
      sha384: "",
      sha512: "",
    },
    base64: btoa(content),
    link: { "old-script": true },
    type: "resource",
    createtime: updatetime,
    updatetime,
  };
}

describe("ResourceService - createResourceByUrlFetch", () => {
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

    const res = await service.createResourceByUrlFetch(parseUrlSRI("https://example.com/lib.js"), "require");

    expect(res.url).toBe("https://example.com/lib.js");
    expect(res.content).toBeTruthy();
    expect(res.contentType).toBe("application/javascript");
    expect(res.base64).toBeTruthy();
    expect(res.type).toBe("require");
    expect(res.updatetime).toEqual(expect.any(Number));
  });

  it("加载文本资源(resource)时应通过 blob.text() 设置 content", async () => {
    const text = "plain text content";
    mockFetch.mockResolvedValue(mockResponse(textBlob(text), 200, "text/plain"));

    const res = await service.createResourceByUrlFetch(parseUrlSRI("https://example.com/data.txt"), "resource");

    expect(res.content).toBe(text);
    expect(res.type).toBe("resource");
  });

  it("加载二进制资源时 content 应为空", async () => {
    // 包含 null 字节的二进制数据，isText 会返回 false
    const bytes = [0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00];
    mockFetch.mockResolvedValue(mockResponse(binaryBlob(bytes), 200, "image/png"));

    const res = await service.createResourceByUrlFetch(parseUrlSRI("https://example.com/img.png"), "resource");

    expect(res.content).toBe("");
    expect(res.base64).toBeTruthy();
    expect(res.contentType).toBe("image/png");
  });

  it("响应非200时应抛出异常", async () => {
    mockFetch.mockResolvedValue(mockResponse(textBlob(""), 404));

    await expect(service.createResourceByUrlFetch(parseUrlSRI("https://example.com/404"), "require")).rejects.toThrow(
      "resource response status not 200: 404"
    );
  });

  it("没有 content-type 时应默认为 application/octet-stream", async () => {
    mockFetch.mockResolvedValue(mockResponse(textBlob("data"), 200));

    const res = await service.createResourceByUrlFetch(parseUrlSRI("https://example.com/noct"), "resource");

    expect(res.contentType).toBe("application/octet-stream");
  });

  it("已下载成功的远程资源在24小时内不应重复 fetch", async () => {
    const url = "https://example.com/cache-ttl.js";
    const script = normalScript("resource-cache-ttl-test", { require: [url] });

    mockFetch.mockResolvedValue(mockResponse(textBlob("console.log('cache');"), 200, "application/javascript"));

    await service.updateResourceByTypes(script, ["require"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    await service.updateResourceByTypes(script, ["require"]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("多个脚本复用同一 URL 时, TTL 命中也应登记当前脚本的 link", async () => {
    const url = "https://example.com/shared-lib.js";
    const scriptA = normalScript("shared-script-a", { require: [url] });
    const scriptB = normalScript("shared-script-b", { require: [url] });

    mockFetch.mockResolvedValue(mockResponse(textBlob("console.log('shared');"), 200, "application/javascript"));

    // A 安装：实际下载并登记 link
    await service.updateResourceByTypes(scriptA, ["require"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // B 安装：24 小时内 TTL 命中，不应重新 fetch
    mockFetch.mockClear();
    await service.updateResourceByTypes(scriptB, ["require"]);
    expect(mockFetch).not.toHaveBeenCalled();

    // 但 B 仍应被登记到该资源的 link，否则删除 A 时会误删仍被 B 使用的资源
    const stored = await service.resourceDAO.get(url);
    expect(stored?.link).toMatchObject({
      "shared-script-a": true,
      "shared-script-b": true,
    });
  });

  it("已过期的远程资源应重新 fetch 并更新内容", async () => {
    const url = "https://example.com/expired.css";
    const script = normalScript("resource-expired-test", { resource: [`expired ${url}`] });
    const oldResource = resourceModel(url, "old", Date.now() - 86_400_000 - 1000);
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateResource = vi.spyOn(service, "updateResource").mockResolvedValue({
      ...oldResource,
      content: "new",
      updatetime: Date.now(),
    });

    await service.updateResourceByTypes(script, ["resource"]);

    expect(updateResource).toHaveBeenCalledWith(script.uuid, expect.objectContaining({ url }), "resource", oldResource);
  });

  it("file 协议资源即使未过期也应尝试更新", async () => {
    const url = "file:///tmp/scriptcat-resource.txt";
    const script = normalScript("resource-file-test", { resource: [`localFile ${url}`] });
    const oldResource = resourceModel(url, "old");
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateResource = vi.spyOn(service, "updateResource").mockResolvedValue({
      ...oldResource,
      content: "new",
      updatetime: Date.now(),
    });

    await service.updateResourceByTypes(script, ["resource"]);

    expect(updateResource).toHaveBeenCalledWith(script.uuid, expect.objectContaining({ url }), "resource", oldResource);
  });

  it("已有旧资源时下载失败应返回旧资源", async () => {
    const url = "https://example.com/fallback.css";
    const oldResource = resourceModel(url, "old-content");
    vi.spyOn(service, "createResourceByUrlFetch").mockRejectedValue(new Error("network failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const loggerError = vi.spyOn(service.logger, "error").mockImplementation(() => {});

    try {
      const res = await service.updateResource("resource-fallback-test", parseUrlSRI(url), "resource", oldResource);

      expect(res).toBe(oldResource);
    } finally {
      loggerError.mockRestore();
      consoleError.mockRestore();
    }
  });
});

describe("ResourceService - getResource", () => {
  let service: ResourceService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockGroup = {} as Group;
    const mockMQ = {} as IMessageQueue;
    service = new ResourceService(mockGroup, mockMQ);
  });

  it("缓存命中且未过期时应返回旧资源并不触发更新", async () => {
    const url = "https://example.com/cached.js";
    const oldResource = resourceModel(url, "cached");
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateResource = vi.spyOn(service, "updateResource");
    const resourceDAOUpdate = vi.spyOn(service.resourceDAO, "update").mockResolvedValue({
      ...oldResource,
      link: { ...oldResource.link, "new-script": true },
    });

    const res = await service.getResource("old-script", url, "require");

    expect(res).toBe(oldResource);
    expect(updateResource).not.toHaveBeenCalled();
    expect(resourceDAOUpdate).not.toHaveBeenCalled();
  });

  it("缓存命中且未过期时应补登记当前 uuid 的 link", async () => {
    const url = "https://example.com/shared.js";
    const oldResource = resourceModel(url, "shared");
    const updatedResource = {
      ...oldResource,
      link: { ...oldResource.link, "new-script": true },
    };
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const resourceDAOUpdate = vi.spyOn(service.resourceDAO, "update").mockResolvedValue(updatedResource);

    const res = await service.getResource("new-script", url, "require");

    expect(resourceDAOUpdate).toHaveBeenCalledWith(url, { link: updatedResource.link });
    expect(res).toBe(updatedResource);
  });

  it("缓存中为空资源记录时应返回 undefined 且不重复更新", async () => {
    const url = "https://example.com/failed.js";
    const oldResource = {
      ...resourceModel(url, ""),
      contentType: "",
    };
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateResource = vi.spyOn(service, "updateResource");

    const res = await service.getResource("new-script", url, "require");

    expect(res).toBeUndefined();
    expect(updateResource).not.toHaveBeenCalled();
  });

  it("forceUpdate 为 true 时应复用 updateResource 更新资源", async () => {
    const url = "https://example.com/force.js";
    const oldResource = resourceModel(url, "old");
    const updatedResource = {
      ...oldResource,
      content: "new",
      link: { ...oldResource.link, "new-script": true },
    };
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateResource = vi.spyOn(service, "updateResource").mockResolvedValue(updatedResource);

    const res = await service.getResource("new-script", url, "require", true);

    expect(updateResource).toHaveBeenCalledWith("new-script", expect.objectContaining({ url }), "require", oldResource);
    expect(res).toBe(updatedResource);
  });

  it("缓存缺失且非 forceUpdate 时应返回 undefined", async () => {
    const url = "https://example.com/missing.js";
    vi.spyOn(service, "getResourceModel").mockResolvedValue(undefined);
    const updateResource = vi.spyOn(service, "updateResource");

    const res = await service.getResource("new-script", url, "require");

    expect(res).toBeUndefined();
    expect(updateResource).not.toHaveBeenCalled();
  });

  it("缓存已过期时应复用 updateResource 更新资源", async () => {
    const url = "https://example.com/expired.js";
    const oldResource = resourceModel(url, "old", Date.now() - 86_400_000 - 1000);
    const updatedResource = {
      ...oldResource,
      content: "new",
      updatetime: Date.now(),
    };
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateResource = vi.spyOn(service, "updateResource").mockResolvedValue(updatedResource);

    const res = await service.getResource("new-script", url, "require");

    expect(updateResource).toHaveBeenCalledWith("new-script", expect.objectContaining({ url }), "require", oldResource);
    expect(res).toBe(updatedResource);
  });

  it("file 协议资源即使未过期也应复用 updateResource 更新资源", async () => {
    const url = "file:///tmp/require.js";
    const oldResource = resourceModel(url, "old");
    const updatedResource = {
      ...oldResource,
      content: "new",
      updatetime: Date.now(),
    };
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateResource = vi.spyOn(service, "updateResource").mockResolvedValue(updatedResource);

    const res = await service.getResource("new-script", url, "require");

    expect(updateResource).toHaveBeenCalledWith("new-script", expect.objectContaining({ url }), "require", oldResource);
    expect(res).toBe(updatedResource);
  });
});

describe("ResourceService - getResourceByTypes", () => {
  let service: ResourceService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockGroup = {} as Group;
    const mockMQ = {} as IMessageQueue;
    service = new ResourceService(mockGroup, mockMQ);
  });

  it("命名 @resource 的 file:/// path 应按 path 判断并立即更新", async () => {
    // @resource 两段式写法 "key file:///..."，mdValue 本身不以 file:/// 开头，
    // 必须按解析出的 path 判断，才能对本地文件走「每次读取都更新」而非命中缓存。
    const url = "file:///tmp/local.txt";
    const oldResource = resourceModel(url, "old");
    const freshResource = resourceModel(url, "local");
    vi.spyOn(service, "getResourceModel").mockResolvedValue(oldResource);
    const updateSpy = vi.spyOn(service, "updateResource").mockResolvedValue(freshResource);

    const [res] = await service.getResourceByTypes(normalScript("script-1", { resource: [`data ${url}`] }), [
      "resource",
    ]);

    expect(updateSpy).toHaveBeenCalledWith("script-1", expect.objectContaining({ url }), "resource", oldResource);
    expect(res.data).toBe(freshResource);
  });
});

describe("ResourceService - importResource", () => {
  let service: ResourceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ResourceService({} as Group, {} as IMessageQueue);
    vi.spyOn(service, "calculateHash").mockResolvedValue({
      md5: "mock-md5",
      sha1: "",
      sha256: "",
      sha384: "",
      sha512: "",
    });
  });

  it("二进制资源(仅 base64,无 source)也能导入", async () => {
    await service.importResource(
      "u1",
      {
        meta: { name: "img", url: "https://x/img.png", ts: 0, mimetype: "image/png" },
        base64: "data:image/png;base64,aGVsbG8=",
      },
      "resource"
    );
    const saved = await service.resourceDAO.get("https://x/img.png");
    expect(saved).toBeTruthy();
    expect(saved!.contentType).toBe("image/png");
    expect(saved!.link.u1).toBe(true);
  });

  it("文本资源仍按 source 导入", async () => {
    await service.importResource(
      "u2",
      {
        meta: { name: "js", url: "https://x/a.js", ts: 0, mimetype: "application/javascript" },
        source: "console.log(1)",
        base64: "data:application/javascript;base64,Y29uc29sZS5sb2coMSk=",
      },
      "require"
    );
    const saved = await service.resourceDAO.get("https://x/a.js");
    expect(saved!.content).toBe("console.log(1)");
  });
});
