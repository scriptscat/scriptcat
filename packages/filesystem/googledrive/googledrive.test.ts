import { beforeEach, describe, expect, it, vi } from "vitest";
import GoogleDriveFileSystem from "./googledrive";

describe("GoogleDriveFileSystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
