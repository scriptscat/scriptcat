import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSystemError } from "../error";
import DropboxFileSystem from "./dropbox";

describe("DropboxFileSystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("request should throw typed not found error", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            error_summary: "path_lookup/not_found/...",
            error: { ".tag": "path_lookup", path_lookup: { ".tag": "not_found" } },
          }),
      })
    );

    await expect(fs.request("https://api.dropboxapi.com/2/files/get_metadata")).rejects.toMatchObject({
      provider: "dropbox",
      status: 409,
      code: "path_lookup/not_found/...",
      notFound: true,
      conflict: false,
    });
  });

  it("request should classify structured path_lookup not_found without error_summary", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            error: { ".tag": "path_lookup", path_lookup: { ".tag": "not_found" } },
          }),
      })
    );

    await expect(fs.request("https://api.dropboxapi.com/2/files/get_metadata")).rejects.toMatchObject({
      provider: "dropbox",
      status: 409,
      notFound: true,
      conflict: false,
    });
  });

  it("request should throw typed conflict error", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            error_summary: "path/conflict/folder/...",
            error: { ".tag": "path", path: { ".tag": "conflict" } },
          }),
      })
    );

    await expect(fs.request("https://api.dropboxapi.com/2/files/create_folder_v2")).rejects.toMatchObject({
      provider: "dropbox",
      status: 409,
      code: "path/conflict/folder/...",
      conflict: true,
      notFound: false,
    });
  });

  it("request should throw typed rate-limit error", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error_summary: "too_many_requests/..." }),
      })
    );

    await expect(fs.request("https://api.dropboxapi.com/2/files/list_folder")).rejects.toMatchObject({
      provider: "dropbox",
      status: 429,
      code: "too_many_requests/...",
      rateLimit: true,
      retryable: true,
    });
  });

  it("读取文件遇到 raw 429 响应时抛出 typed 限流错误", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue({
      status: 429,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error_summary: "too_many_requests/..." })),
    } as unknown as Response);
    const reader = await fs.open({
      name: "limited.user.js",
      path: "/",
      size: 1,
      digest: "digest",
      createtime: 1,
      updatetime: 1,
    });

    await expect(reader.read("string")).rejects.toMatchObject({
      provider: "dropbox",
      status: 429,
      code: "too_many_requests/...",
      rateLimit: true,
      retryable: true,
    });
  });

  it("delete should be idempotent on path not found", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockRejectedValue(
      new FileSystemError({
        provider: "dropbox",
        message: "not found",
        status: 409,
        code: "path_lookup/not_found/...",
        notFound: true,
      })
    );

    await expect(fs.delete("missing.txt")).resolves.toBeUndefined();
  });

  it("exists should return false on path not found", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockRejectedValue(
      new FileSystemError({
        provider: "dropbox",
        message: "not found",
        status: 409,
        code: "path/not_found/...",
        notFound: true,
      })
    );

    await expect(fs.exists("/missing.txt")).resolves.toBe(false);
  });

  it("exists should rethrow auth and network errors", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockRejectedValue(new Error("Dropbox API Error: 401 - invalid_access_token"));

    await expect(fs.exists("/test.txt")).rejects.toThrow("invalid_access_token");
  });

  it("list should preserve Dropbox content_hash as opaque digest", async () => {
    const fs = new DropboxFileSystem("/ScriptCat/sync", "token");
    vi.spyOn(fs, "request").mockResolvedValue({
      entries: [
        {
          ".tag": "file",
          name: "script.user.js",
          size: 10,
          content_hash: "dropbox-content-hash",
          client_modified: "2026-01-01T00:00:00Z",
          server_modified: "2026-01-01T00:00:01Z",
        },
      ],
      has_more: false,
    });

    await expect(fs.list()).resolves.toMatchObject([
      {
        name: "script.user.js",
        path: "/sync",
        digest: "dropbox-content-hash",
      },
    ]);
  });

  it("create should normalize double slashes after the Dropbox app root", async () => {
    const fs = new DropboxFileSystem("/ScriptCat//sync", "token");

    const writer = await fs.create("dir//file.user.js");

    expect((writer as any).path).toBe("/sync/dir/file.user.js");
  });

  it("delete should normalize double slashes after the Dropbox app root", async () => {
    const fs = new DropboxFileSystem("/ScriptCat//sync", "token");
    const request = vi.spyOn(fs, "request").mockResolvedValue({});

    await fs.delete("dir//file.user.js");

    expect(request).toHaveBeenCalledWith(
      "https://api.dropboxapi.com/2/files/delete_v2",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          path: "/sync/dir/file.user.js",
        }),
      })
    );
  });
});
