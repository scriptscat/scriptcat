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
});
