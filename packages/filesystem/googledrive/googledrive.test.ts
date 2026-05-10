import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import { FileSystemError, isAuthError, isConflictError, isNotFoundError, isRateLimitError } from "../error";
import GoogleDriveFileSystem from "./googledrive";

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

describe("GoogleDriveFileSystem", () => {
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

  it("delete should be idempotent when file id is missing", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    vi.spyOn(fs, "getFileId").mockResolvedValue(null);
    const requestSpy = vi.spyOn(fs, "request");

    await expect(fs.delete("missing.txt")).resolves.toBeUndefined();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("delete should be idempotent on 404 response", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    vi.spyOn(fs, "getFileId").mockResolvedValue("file-1");
    vi.spyOn(fs, "request").mockResolvedValue({
      status: 404,
      text: vi.fn().mockResolvedValue("not found"),
    } as unknown as Response);

    await expect(fs.delete("missing.txt")).resolves.toBeUndefined();
  });

  it("delete should clear stale cached id on 404 response", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    (fs as any).pathToIdCache.set("/missing.txt", "stale-file-id");
    const notFoundError = new FileSystemError({
      provider: "googledrive",
      message: "File not found",
      status: 404,
      notFound: true,
    });
    vi.spyOn(fs, "request").mockRejectedValue(notFoundError);

    await expect(fs.delete("missing.txt")).resolves.toBeUndefined();

    expect((fs as any).pathToIdCache.has("/missing.txt")).toBe(false);
  });

  it("ensureDirExists should create missing nested directories and return final id", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const findSpy = vi.spyOn(fs, "findFolderByName").mockResolvedValue(null);
    const createSpy = vi
      .spyOn(fs, "createFolder")
      .mockResolvedValueOnce({ id: "id-A", name: "A" })
      .mockResolvedValueOnce({ id: "id-B", name: "B" });

    await expect(fs.ensureDirExists("/A/B")).resolves.toBe("id-B");

    expect(findSpy.mock.calls).toEqual([
      ["A", "appDataFolder"],
      ["B", "id-A"],
    ]);
    expect(createSpy.mock.calls).toEqual([
      ["A", "appDataFolder"],
      ["B", "id-A"],
    ]);
  });

  it("writer should ensure directory from root when filesystem is opened in subdir", async () => {
    const fs = new GoogleDriveFileSystem("/Base", "token");
    const writer = await fs.create("file.txt");
    const ensureSpy = vi.spyOn(fs, "ensureDirExists").mockResolvedValue("base-id");
    const findSpy = vi.spyOn(fs, "findFileInDirectory").mockResolvedValue(null);
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    await expect(writer.write("content")).resolves.toBeUndefined();

    expect(ensureSpy).toHaveBeenCalledWith("/Base");
    expect(findSpy).toHaveBeenCalledWith("file.txt", "base-id");
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it("writer should clear stale path cache and retry once on provider 404", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const notFoundError = new FileSystemError({
      provider: "googledrive",
      message: "Parent not found",
      status: 404,
      notFound: true,
    });
    const findFolderSpy = vi
      .spyOn(fs, "findFolderByName")
      .mockResolvedValueOnce({ id: "stale-base-id", name: "Base" })
      .mockResolvedValueOnce({ id: "fresh-base-id", name: "Base" });

    await fs.ensureDirExists("/Base");

    const writer = await fs.create("Base/file.txt");
    const findFileSpy = vi
      .spyOn(fs, "findFileInDirectory")
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce(null);
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    await expect(writer.write("content")).resolves.toBeUndefined();

    expect(findFolderSpy.mock.calls).toEqual([
      ["Base", "appDataFolder"],
      ["Base", "appDataFolder"],
    ]);
    expect(findFileSpy.mock.calls).toEqual([
      ["file.txt", "stale-base-id"],
      ["file.txt", "fresh-base-id"],
    ]);
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it("writer should not retry non-404 provider errors", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const conflictError = new FileSystemError({
      provider: "googledrive",
      message: "Conflict",
      status: 409,
      conflict: true,
    });
    const writer = await fs.create("Base/file.txt");
    const ensureSpy = vi.spyOn(fs, "ensureDirExists").mockResolvedValue("base-id");
    const findFileSpy = vi.spyOn(fs, "findFileInDirectory").mockRejectedValue(conflictError);

    await expect(writer.write("content")).rejects.toBe(conflictError);

    expect(ensureSpy).toHaveBeenCalledTimes(1);
    expect(findFileSpy).toHaveBeenCalledTimes(1);
  });

  it("writer should validate expected Google Drive version before update", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const writer = await fs.create("file.txt", {
      expectedVersion: "file-1:version-7",
    });
    const findSpy = vi.spyOn(fs, "findFileInDirectory");
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockResolvedValueOnce({ version: "version-7" })
      .mockResolvedValueOnce({});

    await expect(writer.write("content")).resolves.toBeUndefined();

    expect(findSpy).not.toHaveBeenCalled();
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(requestSpy.mock.calls[0][0]).toBe(
      "https://www.googleapis.com/drive/v3/files/file-1?fields=version&spaces=appDataFolder"
    );
    expect(requestSpy.mock.calls[1][0]).toBe(
      "https://www.googleapis.com/upload/drive/v3/files/file-1?uploadType=multipart&spaces=appDataFolder"
    );
    expect((requestSpy.mock.calls[1][1] as RequestInit).headers).toBeUndefined();
  });

  it("writer should reject update when Google Drive version changed", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const writer = await fs.create("file.txt", {
      expectedVersion: "file-1:version-7",
    });
    vi.spyOn(fs, "request").mockResolvedValueOnce({ version: "version-8" });

    await expect(writer.write("content")).rejects.toMatchObject({
      provider: "googledrive",
      conflict: true,
      status: 412,
    });
  });

  it("writer should reject createOnly when target already exists", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const writer = await fs.create("file.txt", { createOnly: true });
    vi.spyOn(fs, "findFileInDirectory").mockResolvedValue("file-1");

    await expect(writer.write("content")).rejects.toMatchObject({
      provider: "googledrive",
      conflict: true,
    });
  });

  it("findFileInDirectory should reject duplicate file names", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    vi.spyOn(fs, "findFilesInDirectory").mockResolvedValue([{ id: "file-1" }, { id: "file-2" }]);

    await expect(fs.findFileInDirectory("file.txt", "parent-id")).rejects.toMatchObject({
      provider: "googledrive",
      conflict: true,
    });
  });

  it("writer should create createOnly files with a generated Google Drive id", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const writer = await fs.create("file.txt", { createOnly: true });
    vi.spyOn(fs, "findFileInDirectory").mockResolvedValue(null);
    vi.spyOn(fs, "findFilesInDirectory").mockResolvedValue([{ id: "generated-file" }]);
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockResolvedValueOnce({ ids: ["generated-file"] })
      .mockResolvedValueOnce({ id: "generated-file" });

    await expect(writer.write("content")).resolves.toBeUndefined();

    expect(requestSpy.mock.calls[0][0]).toBe(
      "https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=appDataFolder&fields=ids"
    );
    const createOptions = requestSpy.mock.calls[1][1] as RequestInit;
    const headers = createOptions.headers as Headers;
    expect(headers.get("If-None-Match")).toBe("*");
    const formData = createOptions.body as FormData;
    expect(formData.get("metadata")).toBeTruthy();
  });

  it("writer should rollback and reject createOnly when Google Drive creates a duplicate name", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    const writer = await fs.create("file.txt", { createOnly: true });
    vi.spyOn(fs, "findFileInDirectory").mockResolvedValue(null);
    vi.spyOn(fs, "findFilesInDirectory").mockResolvedValue([{ id: "other-file" }, { id: "created-file" }]);
    const requestSpy = vi
      .spyOn(fs, "request")
      .mockResolvedValueOnce({ ids: ["generated-file"] })
      .mockResolvedValueOnce({ id: "created-file" })
      .mockResolvedValueOnce({});

    await expect(writer.write("content")).rejects.toMatchObject({
      provider: "googledrive",
      conflict: true,
    });

    expect(requestSpy).toHaveBeenCalledTimes(3);
    expect(requestSpy.mock.calls[2][0]).toBe(
      "https://www.googleapis.com/drive/v3/files/created-file?spaces=appDataFolder"
    );
    expect((requestSpy.mock.calls[2][1] as RequestInit).method).toBe("DELETE");
  });

  it("list should clear stale path cache and retry once on provider 404", async () => {
    const fs = new GoogleDriveFileSystem("/Base", "token");
    const notFoundError = new FileSystemError({
      provider: "googledrive",
      message: "Folder not found",
      status: 404,
      notFound: true,
    });
    const findFolderSpy = vi.spyOn(fs, "findFolderByName").mockResolvedValueOnce({ id: "stale-base-id", name: "Base" });

    await fs.ensureDirExists("/Base");

    const requestSpy = vi
      .spyOn(fs, "request")
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce({ files: [{ id: "fresh-base-id", name: "Base" }] })
      .mockResolvedValueOnce({ files: [] });

    await expect(fs.list()).resolves.toEqual([]);

    expect(findFolderSpy).toHaveBeenCalledTimes(1);
    expect(String(requestSpy.mock.calls[0][0])).toContain("stale-base-id");
    expect(String(requestSpy.mock.calls[1][0])).toContain("name%3D'Base'");
    expect(String(requestSpy.mock.calls[2][0])).toContain("fresh-base-id");
  });

  it("request should return retry result after token refresh", async () => {
    await localStorageDAO.saveValue("netdisk:token:googledrive", {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      createtime: Date.now(),
    });

    const fs = new GoogleDriveFileSystem("/", "expired-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 401,
          text: JSON.stringify({
            error: {
              code: 401,
              message: "Invalid Credentials",
              status: "UNAUTHENTICATED",
            },
          }),
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
          json: {
            files: [{ id: "ok" }],
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const data = await fs.request("https://www.googleapis.com/drive/v3/files");

    expect(data.files).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("request should throw auth error when retry still gets 401", async () => {
    await localStorageDAO.saveValue("netdisk:token:googledrive", {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      createtime: Date.now(),
    });

    const fs = new GoogleDriveFileSystem("/", "expired-token");
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
      await fs.request("https://www.googleapis.com/drive/v3/files");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isAuthError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "googledrive",
        status: 401,
        auth: true,
      });
    }
  });

  it("request should throw typed not found error", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 404,
          text: JSON.stringify({
            error: {
              code: 404,
              message: "File not found",
              status: "NOT_FOUND",
            },
          }),
        })
      )
    );

    try {
      await fs.request("https://www.googleapis.com/drive/v3/files/missing");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isNotFoundError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "googledrive",
        status: 404,
        code: "NOT_FOUND",
        notFound: true,
      });
    }
  });

  it.each([409, 412])("request should throw typed conflict error for status %s", async (status) => {
    const fs = new GoogleDriveFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status,
          text: JSON.stringify({
            error: {
              code: status,
              message: "Conflict",
              status: status === 409 ? "ABORTED" : "FAILED_PRECONDITION",
            },
          }),
        })
      )
    );

    try {
      await fs.request("https://www.googleapis.com/drive/v3/files/conflict");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isConflictError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "googledrive",
        status,
        conflict: true,
      });
    }
  });

  it("request should throw typed rate-limit error", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 429,
          text: JSON.stringify({
            error: {
              code: 429,
              message: "Quota exceeded",
              status: "RESOURCE_EXHAUSTED",
            },
          }),
        })
      )
    );

    try {
      await fs.request("https://www.googleapis.com/drive/v3/files");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileSystemError);
      expect(isRateLimitError(error)).toBe(true);
      expect(error).toMatchObject({
        provider: "googledrive",
        status: 429,
        retryable: true,
        rateLimit: true,
      });
    }
  });

  it("list should expose opaque Google Drive version token", async () => {
    const fs = new GoogleDriveFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue({
      files: [
        {
          id: "file-1",
          name: "test.user.js",
          size: "12",
          md5Checksum: "md5",
          createdTime: "2024-01-01T00:00:00.000Z",
          modifiedTime: "2024-01-02T00:00:00.000Z",
          version: "7",
        },
      ],
    });

    await expect(fs.list()).resolves.toMatchObject([
      {
        name: "test.user.js",
        digest: "md5",
        version: "file-1:7",
      },
    ]);
  });
});
