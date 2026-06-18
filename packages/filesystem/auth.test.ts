// can be tested with vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthVerify } from "./auth";
import { LocalStorageDAO } from "@App/app/repo/localStorage";

describe("AuthVerify", () => {
  const localStorageDAO = new LocalStorageDAO();
  const key = "netdisk:token:onedrive";
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    await chrome.storage.local.clear();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
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

  it("concurrent expired token verification should share one refresh request", async () => {
    await localStorageDAO.saveValue(key, {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      createtime: Date.now() - 3600000 - 1000,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        code: 0,
        data: {
          token: {
            access_token: "new-access",
            refresh_token: "new-refresh",
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      Promise.all([AuthVerify("onedrive"), AuthVerify("onedrive"), AuthVerify("onedrive")])
    ).resolves.toEqual(["new-access", "new-access", "new-access"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("concurrent initial token verification should share one auth request and save once", async () => {
    vi.useFakeTimers();
    const createSpy = vi.spyOn(chrome.tabs, "create").mockImplementation(() => Promise.resolve({ id: 1 }) as any);
    const originalGet = (chrome.tabs as any).get;
    (chrome.tabs as any).get = vi.fn().mockRejectedValue(new Error("closed"));
    const saveSpy = vi.spyOn(LocalStorageDAO.prototype, "saveValue");
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        code: 0,
        data: {
          token: {
            access_token: "initial-access",
            refresh_token: "initial-refresh",
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    try {
      const auth = Promise.all([AuthVerify("onedrive"), AuthVerify("onedrive"), AuthVerify("onedrive")]);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(auth).resolves.toEqual(["initial-access", "initial-access", "initial-access"]);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(key, expect.objectContaining({ accessToken: "initial-access" }));
    } finally {
      (chrome.tabs as any).get = originalGet;
      vi.useRealTimers();
    }
  });
});
