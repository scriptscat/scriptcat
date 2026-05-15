import { beforeEach, describe, expect, it, vi } from "vitest";
import DropboxFileSystem from "./dropbox";

describe("DropboxFileSystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delete should be idempotent on path not found", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockRejectedValue(
      new Error('Dropbox API Error: 409 - {"error_summary":"path_lookup/not_found/..."}')
    );

    await expect(fs.delete("missing.txt")).resolves.toBeUndefined();
  });

  it("delete should check rev before conditional delete", async () => {
    const fs = new DropboxFileSystem("/", "token");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValueOnce({ rev: "rev-1" }).mockResolvedValueOnce({});

    await expect(fs.delete("test.txt", { expectedVersion: "rev-1" })).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(requestSpy.mock.calls[0][0]).toBe("https://api.dropboxapi.com/2/files/get_metadata");
    expect(requestSpy.mock.calls[1][0]).toBe("https://api.dropboxapi.com/2/files/delete_v2");
  });

  it("delete should reject when conditional rev changed", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue({ rev: "rev-2" });

    await expect(fs.delete("test.txt", { expectedVersion: "rev-1" })).rejects.toMatchObject({
      provider: "dropbox",
      conflict: true,
    });
  });

  it("exists should return false on path not found", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockRejectedValue(
      new Error('Dropbox API Error: 409 - {"error_summary":"path/not_found/..."}')
    );

    await expect(fs.exists("/missing.txt")).resolves.toBe(false);
  });

  it("exists should rethrow auth and network errors", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockRejectedValue(new Error("Dropbox API Error: 401 - invalid_access_token"));

    await expect(fs.exists("/test.txt")).rejects.toThrow("invalid_access_token");
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

  it("list should expose Dropbox rev as version", async () => {
    const fs = new DropboxFileSystem("/", "token");
    vi.spyOn(fs, "request").mockResolvedValue({
      entries: [
        {
          ".tag": "file",
          name: "test.user.js",
          size: 1,
          content_hash: "hash-1",
          rev: "rev-1",
          client_modified: "2024-01-01T00:00:00.000Z",
          server_modified: "2024-01-02T00:00:00.000Z",
        },
      ],
      has_more: false,
    });

    await expect(fs.list()).resolves.toMatchObject([
      {
        name: "test.user.js",
        digest: "hash-1",
        version: "rev-1",
      },
    ]);
  });

  it("writer should use Dropbox update mode when expectedVersion is provided", async () => {
    const fs = new DropboxFileSystem("/", "token");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    const writer = await fs.create("test.txt", { expectedVersion: "rev-1" });
    await writer.write("content");

    const headers = (requestSpy.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(JSON.parse(headers.get("Dropbox-API-Arg")!)).toEqual({
      path: "/test.txt",
      mode: { ".tag": "update", update: "rev-1" },
      autorename: false,
    });
  });

  it("writer should use add mode for createOnly without metadata preflight", async () => {
    const fs = new DropboxFileSystem("/", "token");
    const existsSpy = vi.spyOn(fs, "exists");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    const writer = await fs.create("test.txt", { createOnly: true });
    await writer.write("content");

    expect(existsSpy).not.toHaveBeenCalled();
    const headers = (requestSpy.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(JSON.parse(headers.get("Dropbox-API-Arg")!)).toMatchObject({
      path: "/test.txt",
      mode: "add",
    });
  });

  it("writer should use overwrite mode for normal writes without metadata preflight", async () => {
    const fs = new DropboxFileSystem("/", "token");
    const existsSpy = vi.spyOn(fs, "exists");
    const requestSpy = vi.spyOn(fs, "request").mockResolvedValue({});

    const writer = await fs.create("test.txt");
    await writer.write("content");

    expect(existsSpy).not.toHaveBeenCalled();
    const headers = (requestSpy.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(JSON.parse(headers.get("Dropbox-API-Arg")!)).toMatchObject({
      path: "/test.txt",
      mode: "overwrite",
    });
  });

  it("writer should reject expectedDigest without Dropbox rev", async () => {
    const fs = new DropboxFileSystem("/", "token");
    const writer = await fs.create("test.txt", { expectedDigest: "content-hash" });

    await expect(writer.write("content")).rejects.toMatchObject({
      provider: "dropbox",
      unsupported: true,
    });
  });
});
