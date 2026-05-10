import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OneDriveFileSystem from "./onedrive";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import { FileSystemError, isAuthError, isConflictError, isNotFoundError, isRateLimitError } from "../error";

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

  it("createDir should strip ScriptCat prefix when called with sync root", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    await expect(fs.createDir("ScriptCat/sync")).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0]).toBe("https://graph.microsoft.com/v1.0/me/drive/special/approot/children");
    expect(JSON.parse((requestSpy.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      name: "sync",
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    });
  });

  it("createDir should continue when an intermediate directory already exists", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockRejectedValueOnce(
        new FileSystemError({
          provider: "onedrive",
          message: "already exists",
          status: 409,
          code: "nameAlreadyExists",
          conflict: true,
          raw: { error: { code: "nameAlreadyExists" } },
        })
      )
      .mockResolvedValueOnce({});

    await expect(fs.createDir("A/B")).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse((requestSpy.mock.calls[1][1] as RequestInit).body as string)).toMatchObject({
      name: "B",
    });
  });

  it("request should throw auth error when retry still gets 401", async () => {
    await localStorageDAO.saveValue("netdisk:token:onedrive", {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      createtime: Date.now(),
    });

    const fs = new OneDriveFileSystem("/", "expired-token");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(createMockResponse({ ok: false, status: 401, text: "expired" }))
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
        .mockResolvedValueOnce(createMockResponse({ ok: false, status: 401, text: "still expired" }))
    );

    try {
      await fs.request("https://graph.microsoft.com/v1.0/me/drive/special/approot/children");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isAuthError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "onedrive",
        status: 401,
        auth: true,
      });
    }
  });

  it("request should throw typed not found error", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 404,
          text: JSON.stringify({
            error: {
              code: "itemNotFound",
              message: "Item not found",
            },
          }),
        })
      )
    );

    try {
      await fs.request("https://graph.microsoft.com/v1.0/me/drive/special/approot:/missing");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isNotFoundError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "onedrive",
        status: 404,
        code: "itemNotFound",
        notFound: true,
      });
    }
  });

  it.each([
    [409, "nameAlreadyExists"],
    [412, "PreconditionFailed"],
  ])("request should throw typed conflict error for status %s", async (status, code) => {
    const fs = new OneDriveFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status,
          text: JSON.stringify({
            error: {
              code,
              message: "Conflict",
            },
          }),
        })
      )
    );

    try {
      await fs.request("https://graph.microsoft.com/v1.0/me/drive/special/approot:/conflict");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isConflictError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "onedrive",
        status,
        code,
        conflict: true,
      });
    }
  });

  it("request should throw typed rate-limit error", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 429,
          text: JSON.stringify({
            error: {
              code: "TooManyRequests",
              message: "Too many requests",
            },
          }),
        })
      )
    );

    try {
      await fs.request("https://graph.microsoft.com/v1.0/me/drive/special/approot/children");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isRateLimitError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "onedrive",
        status: 429,
        retryable: true,
        rateLimit: true,
      });
    }
  });

  it("writer should upload empty string with simple PUT", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    const writer = await fs.create("empty.txt");
    await writer.write("");

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/special/approot:/empty.txt:/content"
    );
    expect(requestSpy.mock.calls[0][1]).toMatchObject({
      method: "PUT",
      body: "",
    });
  });

  it("writer should send If-Match on simple PUT when expectedVersion is provided", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    const writer = await fs.create("empty.txt", { expectedVersion: "etag-1" });
    await writer.write("");

    const headers = (requestSpy.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get("If-Match")).toBe("etag-1");
  });

  it("writer should upload empty Blob with simple PUT", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});
    const emptyBlob = new Blob([]);

    const writer = await fs.create("empty.bin");
    await writer.write(emptyBlob);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/special/approot:/empty.bin:/content"
    );
    expect((requestSpy.mock.calls[0][1] as RequestInit).body).toBe(emptyBlob);
  });

  it("writer should keep upload session for non-empty content", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockResolvedValueOnce({ uploadUrl: "https://upload.example/session" })
      .mockResolvedValueOnce({});

    const writer = await fs.create("not-empty.txt");
    await writer.write("abc");

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(requestSpy.mock.calls[0][0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/special/approot:/not-empty.txt:/createUploadSession"
    );
    expect(requestSpy.mock.calls[1][0]).toBe("https://upload.example/session");
    const headers = (requestSpy.mock.calls[1][1] as RequestInit).headers as Headers;
    expect(headers.get("Content-Range")).toBe("bytes 0-2/3");
  });

  it("writer should send If-None-Match and fail conflict behavior for createOnly upload session", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockResolvedValueOnce({ uploadUrl: "https://upload.example/session" })
      .mockResolvedValueOnce({});

    const writer = await fs.create("not-empty.txt", { createOnly: true });
    await writer.write("abc");

    const headers = (requestSpy.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get("If-None-Match")).toBe("*");
    expect(JSON.parse((requestSpy.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      item: {
        "@microsoft.graph.conflictBehavior": "fail",
      },
    });
  });

  it("list should expose eTag as version", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue({
      value: [
        {
          name: "test.user.js",
          size: 1,
          eTag: "etag-1",
          createdDateTime: "2024-01-01T00:00:00.000Z",
          lastModifiedDateTime: "2024-01-02T00:00:00.000Z",
        },
      ],
    });

    await expect(fs.list()).resolves.toMatchObject([
      {
        name: "test.user.js",
        digest: "etag-1",
        version: "etag-1",
      },
    ]);
  });
});
