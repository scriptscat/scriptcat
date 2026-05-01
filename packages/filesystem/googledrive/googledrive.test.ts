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
});
