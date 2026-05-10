import { describe, expect, it, vi, afterEach } from "vitest";
import BaiduFileSystem from "./baidu";

describe("BaiduFileSystem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("request should omit credentials without using global DNR rules", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ errno: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // 监视 updateDynamicRules，确保不再依赖全局 DNR 规则
    const updateDynamicRulesMock = vi.fn();
    (chrome as any).declarativeNetRequest.updateDynamicRules = updateDynamicRulesMock;

    const fs = new BaiduFileSystem("/apps", "token");

    await expect(fs.request("https://pan.baidu.com/rest/2.0/xpan/file?method=list")).resolves.toEqual({
      errno: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pan.baidu.com/rest/2.0/xpan/file?method=list",
      expect.objectContaining({
        credentials: "omit",
      })
    );
    expect(updateDynamicRulesMock).not.toHaveBeenCalled();
  });

  it("create should reject expectedVersion as unsupported", async () => {
    const fs = new BaiduFileSystem("/apps", "token");

    await expect(fs.create("test.txt", { expectedVersion: "version" })).rejects.toMatchObject({
      provider: "baidu",
      unsupported: true,
    });
  });

  it("writer should reject createOnly when target already exists", async () => {
    const fs = new BaiduFileSystem("/apps", "token");
    vi.spyOn(fs, "list").mockResolvedValue([
      {
        name: "test.txt",
        path: "/apps",
        size: 1,
        digest: "md5",
        createtime: 1,
        updatetime: 1,
      },
    ]);

    const writer = await fs.create("test.txt", { createOnly: true });

    await expect(writer.write("content")).rejects.toMatchObject({
      provider: "baidu",
      conflict: true,
    });
  });

  it("writer should reject expectedDigest when remote digest changed", async () => {
    const fs = new BaiduFileSystem("/apps", "token");
    vi.spyOn(fs, "list").mockResolvedValue([
      {
        name: "test.txt",
        path: "/apps",
        size: 1,
        digest: "new-md5",
        createtime: 1,
        updatetime: 1,
      },
    ]);

    const writer = await fs.create("test.txt", { expectedDigest: "old-md5" });

    await expect(writer.write("content")).rejects.toMatchObject({
      provider: "baidu",
      conflict: true,
    });
  });

  it("delete should be idempotent when Baidu reports file missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ errno: -9 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const fs = new BaiduFileSystem("/apps", "token");

    await expect(fs.delete("missing.txt")).resolves.toMatchObject({ errno: -9 });
  });
});
