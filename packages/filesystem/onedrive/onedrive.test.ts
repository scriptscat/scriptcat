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

  it("应当声明支持原子条件写入和条件删除能力", () => {
    const fs = new OneDriveFileSystem("/", "token");

    expect((fs as any).capabilities).toMatchObject({
      supportsAtomicCompareAndSwap: true,
      supportsCreateOnly: true,
      supportsConditionalDelete: true,
    });
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

  it("删除文件遇到 raw 429 响应时抛出 typed 限流错误", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue(
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
    );

    await expect(fs.delete("limited.txt")).rejects.toMatchObject({
      provider: "onedrive",
      status: 429,
      rateLimit: true,
      retryable: true,
    });
  });

  it("读取文件遇到 raw 429 响应时抛出 typed 限流错误", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue(
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
    );
    const reader = await fs.open({ name: "limited.txt", path: "/", size: 0, digest: "", createtime: 0, updatetime: 0 });

    await expect(reader.read("string")).rejects.toMatchObject({
      provider: "onedrive",
      status: 429,
      rateLimit: true,
      retryable: true,
    });
  });

  it("create should normalize double slashes in paths", async () => {
    const fs = new OneDriveFileSystem("/ScriptCat//sync", "token");

    const writer = await fs.create("dir//file.user.js");

    expect((writer as any).path).toBe("/ScriptCat/sync/dir/file.user.js");
  });

  it("delete should normalize double slashes in URL paths", async () => {
    const fs = new OneDriveFileSystem("/ScriptCat//sync", "token");
    const request = vi.spyOn(fs, "request").mockResolvedValue({ status: 204 });

    await fs.delete("dir//file.user.js");

    expect(request).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/drive/special/approot:/ScriptCat/sync/dir/file.user.js",
      { method: "DELETE" },
      true
    );
  });

  it("条件删除应当将 expectedDigest 转成 If-Match", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const request = vi.spyOn(fs, "request").mockResolvedValue({ status: 204 });

    await (fs as any).delete("test.txt", { expectedDigest: "abc123" });

    expect(request).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/drive/special/approot:/test.txt",
      {
        method: "DELETE",
        headers: expect.objectContaining({
          "If-Match": "abc123",
        }),
      },
      true
    );
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

  it("条件写入应当将 expectedDigest 传给 upload session 的 If-Match", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockResolvedValueOnce({ uploadUrl: "https://upload.example/session" })
      .mockResolvedValueOnce({});

    const writer = await (fs as any).create("not-empty.txt", { expectedDigest: "abc123" });
    await writer.write("abc");

    const headers = (requestSpy.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get("If-Match")).toBe("abc123");
  });

  it("createOnly 写入应当将 If-None-Match 传给 upload session 并使用 fail 语义", async () => {
    const fs = new OneDriveFileSystem("/", "token");
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockResolvedValueOnce({ uploadUrl: "https://upload.example/session" })
      .mockResolvedValueOnce({});

    const writer = await (fs as any).create("not-empty.txt", { createOnly: true });
    await writer.write("abc");

    const headers = (requestSpy.mock.calls[0][1] as RequestInit).headers as Headers;
    const body = JSON.parse((requestSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(headers.get("If-None-Match")).toBe("*");
    expect(body.item["@microsoft.graph.conflictBehavior"]).toBe("fail");
  });
});
