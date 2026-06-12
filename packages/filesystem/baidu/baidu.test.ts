import { describe, expect, it, vi, afterEach } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { isNotFoundError } from "../error";
import { getFileSystemCapabilities } from "../filesystem";
import BaiduFileSystem from "./baidu";

initTestEnv();

describe("BaiduFileSystem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("不应声明原子条件写入能力", () => {
    const fs = new BaiduFileSystem("/apps", "token");

    expect(getFileSystemCapabilities(fs)).toEqual({
      supportsAtomicCompareAndSwap: false,
      supportsCreateOnly: false,
      supportsConditionalDelete: false,
    });
  });

  it("request should omit credentials without using global DNR rules", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ errno: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // 监视 updateDynamicRules，确保不再依赖全局 DNR 规则
    const updateDynamicRulesMock = vi.fn();
    vi.stubGlobal("chrome", {
      declarativeNetRequest: {
        updateDynamicRules: updateDynamicRulesMock,
      },
    });

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

  it("create should normalize double slashes in paths", async () => {
    const fs = new BaiduFileSystem("/apps//ScriptCat", "token");

    const writer = await fs.create("dir//file.user.js");

    expect((writer as any).path).toBe("/apps/ScriptCat/dir/file.user.js");
  });

  it("delete should normalize double slashes in filelist payload", async () => {
    const fs = new BaiduFileSystem("/apps//ScriptCat", "token");
    const request = vi.spyOn(fs, "request").mockResolvedValue({ errno: 0 });

    await fs.delete("dir//file.user.js");

    const [, config] = request.mock.calls[0];
    expect((config as RequestInit).body).toBe(
      `async=0&filelist=${encodeURIComponent(JSON.stringify(["/apps/ScriptCat/dir/file.user.js"]))}`
    );
  });

  it("创建目录遇到明确已存在 errno 时才标记为冲突", async () => {
    const fs = new BaiduFileSystem("/apps", "token");
    vi.spyOn(fs, "request").mockResolvedValue({ errno: 31061, errmsg: "file already exists" });

    await expect(fs.createDir("ScriptCat")).rejects.toMatchObject({
      provider: "baidu",
      code: "31061",
      conflict: true,
    });
  });

  it("创建目录遇到普通 errno 时不能误标记为冲突", async () => {
    const fs = new BaiduFileSystem("/apps", "token");
    vi.spyOn(fs, "request").mockResolvedValue({ errno: 2, errmsg: "access denied" });

    await expect(fs.createDir("ScriptCat")).rejects.toMatchObject({
      provider: "baidu",
      code: "2",
      conflict: false,
    });
  });

  it("写入预创建失败时保留普通 errno 的非冲突语义", async () => {
    const fs = new BaiduFileSystem("/apps", "token");
    vi.spyOn(fs, "request").mockResolvedValue({ errno: 2, errmsg: "access denied" });
    const writer = await fs.create("dir/file.user.js");

    await expect(writer.write("code")).rejects.toMatchObject({
      provider: "baidu",
      code: "2",
      conflict: false,
    });
  });

  it("读取文件元数据缺失时应抛出 typed not found 错误", async () => {
    const fs = new BaiduFileSystem("/apps", "token");
    vi.spyOn(fs, "request").mockResolvedValue({ errno: -9, errmsg: "file not found" });
    const reader = await fs.open({
      fsid: 123,
      name: "missing.user.js",
      path: "/apps",
      size: 0,
      digest: "",
      createtime: 0,
      updatetime: 0,
    });

    await expect(reader.read("string")).rejects.toSatisfy(isNotFoundError);
  });
});
