import { describe, expect, it, vi } from "vitest";
import type { OPFSApiRequest } from "@App/app/service/agent/core/types";

// 直接导入以触发装饰器注册
import CATAgentOPFSApi from "./cat_agent_opfs";
import { GMContextApiGet } from "./gm_context";

describe.concurrent("CATAgentOPFSApi", () => {
  it.concurrent("装饰器注册了 write/read/list/delete/readAttachment 五个方法到 CAT.agent.opfs grant", () => {
    void CATAgentOPFSApi;
    const apis = GMContextApiGet("CAT.agent.opfs");
    expect(apis).toBeDefined();
    const fnKeys = apis!.map((a) => a.fnKey);
    expect(fnKeys).toContain("CAT.agent.opfs.write");
    expect(fnKeys).toContain("CAT.agent.opfs.read");
    expect(fnKeys).toContain("CAT.agent.opfs.list");
    expect(fnKeys).toContain("CAT.agent.opfs.delete");
    expect(fnKeys).toContain("CAT.agent.opfs.readAttachment");
  });

  it.concurrent("write 方法调用 sendMessage 并传递正确的请求", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({ path: "hello.txt", size: 5 });
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const writeApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.write")!;
    const result = await writeApi.api.call(ctx, "hello.txt", "Hello");

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentOPFS", [
      { action: "write", path: "hello.txt", content: "Hello", scriptUuid: "test-uuid" } as OPFSApiRequest,
    ]);
    expect(result).toEqual({ path: "hello.txt", size: 5 });
  });

  it.concurrent("read 方法传递 path 参数", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({ path: "f.txt", content: "data", size: 4 });
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const readApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.read")!;
    const result = await readApi.api.call(ctx, "f.txt");

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentOPFS", [
      { action: "read", path: "f.txt", scriptUuid: "test-uuid" } as OPFSApiRequest,
    ]);
    expect((result as any).content).toBe("data");
  });

  it.concurrent("list 方法可选 path 参数", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue([{ name: "a.txt", type: "file", size: 1 }]);
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const listApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.list")!;

    // 不带 path
    await listApi.api.call(ctx);
    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentOPFS", [
      { action: "list", path: undefined, scriptUuid: "test-uuid" } as OPFSApiRequest,
    ]);

    // 带 path
    mockSendMessage.mockClear();
    await listApi.api.call(ctx, "sub");
    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentOPFS", [
      { action: "list", path: "sub", scriptUuid: "test-uuid" } as OPFSApiRequest,
    ]);
  });

  it.concurrent("delete 方法传递 path 参数", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({ success: true });
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const deleteApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.delete")!;
    const result = await deleteApi.api.call(ctx, "old.txt");

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentOPFS", [
      { action: "delete", path: "old.txt", scriptUuid: "test-uuid" } as OPFSApiRequest,
    ]);
    expect(result).toEqual({ success: true });
  });

  it.concurrent("scriptRes 为空时使用空字符串作为 scriptUuid", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue([]);
    const ctx = { sendMessage: mockSendMessage, scriptRes: undefined };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const listApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.list")!;
    await listApi.api.call(ctx);

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentOPFS", [
      { action: "list", path: undefined, scriptUuid: "" } as OPFSApiRequest,
    ]);
  });

  // ---- postMessage 通道：SW 直接返回 Blob ----

  it.concurrent("readAttachment postMessage 通道直接返回 Blob", async () => {
    const testBlob = new Blob(["image data"], { type: "image/png" });
    const mockSendMessage = vi.fn().mockResolvedValue({
      id: "att-1",
      data: testBlob,
      size: 10,
      mimeType: "image/png",
    });
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const readAttachmentApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.readAttachment")!;
    const result = await readAttachmentApi.api.call(ctx, "att-1");

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect((result as any).data).toBe(testBlob);
  });

  it.concurrent("read blob postMessage 通道直接返回 Blob", async () => {
    const testBlob = new Blob(["file data"], { type: "image/png" });
    const mockSendMessage = vi.fn().mockResolvedValue({
      path: "img.png",
      data: testBlob,
      size: 9,
      mimeType: "image/png",
    });
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const readApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.read")!;
    const result = await readApi.api.call(ctx, "img.png", "blob");

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect((result as any).data).toBe(testBlob);
  });

  // ---- chrome.runtime 通道：SW 返回 blobUrl，客户端 CAT_fetchBlob 还原 ----

  it.concurrent("readAttachment chrome.runtime 通道通过 CAT_fetchBlob 还原 Blob", async () => {
    const testBlob = new Blob(["image data"], { type: "image/png" });
    const mockSendMessage = vi.fn().mockImplementation((api: string) => {
      if (api === "CAT_agentOPFS") {
        return Promise.resolve({
          id: "att-1",
          blobUrl: "blob:chrome-extension://test/123",
          size: 10,
          mimeType: "image/png",
        });
      }
      if (api === "CAT_fetchBlob") {
        return Promise.resolve(testBlob);
      }
      return Promise.resolve(undefined);
    });
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const readAttachmentApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.readAttachment")!;
    const result = await readAttachmentApi.api.call(ctx, "att-1");

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_fetchBlob", ["blob:chrome-extension://test/123"]);
    expect((result as any).data).toBe(testBlob);
    expect((result as any).blobUrl).toBeUndefined();
  });

  it.concurrent("read blob chrome.runtime 通道通过 CAT_fetchBlob 还原 Blob", async () => {
    const testBlob = new Blob(["file data"], { type: "image/png" });
    const mockSendMessage = vi.fn().mockImplementation((api: string) => {
      if (api === "CAT_agentOPFS") {
        return Promise.resolve({
          path: "img.png",
          blobUrl: "blob:chrome-extension://test/456",
          size: 9,
          mimeType: "image/png",
        });
      }
      if (api === "CAT_fetchBlob") {
        return Promise.resolve(testBlob);
      }
      return Promise.resolve(undefined);
    });
    const ctx = { sendMessage: mockSendMessage, scriptRes: { uuid: "test-uuid" } };

    const apis = GMContextApiGet("CAT.agent.opfs")!;
    const readApi = apis.find((a) => a.fnKey === "CAT.agent.opfs.read")!;
    const result = await readApi.api.call(ctx, "img.png", "blob");

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_fetchBlob", ["blob:chrome-extension://test/456"]);
    expect((result as any).data).toBe(testBlob);
    expect((result as any).blobUrl).toBeUndefined();
  });
});
