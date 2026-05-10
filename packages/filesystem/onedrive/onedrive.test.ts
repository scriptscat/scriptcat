import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OneDriveFileSystem from "./onedrive";
import { LocalStorageDAO } from "@App/app/repo/localStorage";

function createMockResponse(options: { ok?: boolean; status?: number; text?: string; json?: any }): Response {
  const { ok = true, status = 200, text = "", json = {} } = options;
  return {
    ok,
    status,
    text: vi.fn().mockResolvedValue(text),
    json: vi.fn().mockResolvedValue(json),
    headers: new Headers(),
  } as unknown as Response;
}

describe("OneDriveFileSystem", () => {
  const localStorageDAO = new LocalStorageDAO();
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    await chrome.storage.local.clear();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
  });

  it("request should return retry result after token refresh", async () => {
    await localStorageDAO.saveValue("netdisk:token:onedrive", {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      createtime: Date.now(),
    });

    const fs = new OneDriveFileSystem("/", "expired-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          status: 200,
          json: {
            error: {
              code: "InvalidAuthenticationToken",
            },
          },
        })
      )
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          code: 0,
          data: {
            token: {
              access_token: "fresh-token",
              refresh_token: "fresh-refresh-token",
            },
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          status: 200,
          json: {
            value: [
              {
                name: "ok.txt",
                size: 1,
                eTag: "tag",
                createdDateTime: new Date().toISOString(),
                lastModifiedDateTime: new Date().toISOString(),
              },
            ],
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const data = await fs.request("https://graph.microsoft.com/v1.0/me/drive/special/approot/children");

    expect(data.value).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("delete should be idempotent on 404", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue({
      status: 404,
      text: vi.fn().mockResolvedValue("not found"),
    } as unknown as Response);

    await expect(fs.delete("missing.txt")).resolves.toBeUndefined();
  });

  it("createDir should create nested directories from root", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    await expect(fs.createDir("A/B/C")).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalledTimes(3);
    expect(requestSpy.mock.calls[0][0]).toBe("https://graph.microsoft.com/v1.0/me/drive/special/approot/children");
    expect(requestSpy.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/me/drive/special/approot:/A:/children");
    expect(requestSpy.mock.calls[2][0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/special/approot:/A/B:/children"
    );
    expect(JSON.parse((requestSpy.mock.calls[2][1] as RequestInit).body as string)).toMatchObject({
      name: "C",
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    });
  });

  it("createDir should continue when an intermediate directory already exists", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockRejectedValueOnce(new Error('{"error":{"code":"nameAlreadyExists"}}'))
      .mockResolvedValueOnce({});

    await expect(fs.createDir("A/B")).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse((requestSpy.mock.calls[1][1] as RequestInit).body as string)).toMatchObject({
      name: "B",
    });
  });
});
