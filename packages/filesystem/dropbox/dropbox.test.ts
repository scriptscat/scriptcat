// can be tested with vitest-environment node
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
});
