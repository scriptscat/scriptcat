import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthVerify } from "./auth";
import { LocalStorageDAO } from "@App/app/repo/localStorage";

describe("AuthVerify", () => {
  const localStorageDAO = new LocalStorageDAO();
  const key = "netdisk:token:onedrive";

  beforeEach(async () => {
    vi.clearAllMocks();
    await chrome.storage.local.clear();
  });

  it("expired token refresh network failure should reject, not fallback old token", async () => {
    await localStorageDAO.saveValue(key, {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      createtime: Date.now() - 3600000 - 1000,
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("refresh network failed")));

    await expect(AuthVerify("onedrive")).rejects.toThrow("refresh network failed");
  });

  it("non-expired token should return cached token without refresh", async () => {
    await localStorageDAO.saveValue(key, {
      accessToken: "cached-access",
      refreshToken: "cached-refresh",
      createtime: Date.now(),
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(AuthVerify("onedrive")).resolves.toBe("cached-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
