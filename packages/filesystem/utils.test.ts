import { describe, expect, it } from "vitest";
import { joinPath } from "./utils";

describe("joinPath", () => {
  it("joins relative path segments as an absolute normalized path", () => {
    expect(joinPath("path1", "path2")).toBe("/path1/path2");
  });

  it("does not create duplicate slashes when segments already contain slashes", () => {
    expect(joinPath("/path1", "/path2")).toBe("/path1/path2");
    expect(joinPath("/path1/", "/path2/")).toBe("/path1/path2");
    expect(joinPath("path1/", "path2/")).toBe("/path1/path2");
    expect(joinPath("/path1/", "path2")).toBe("/path1/path2");
  });

  it("keeps root-relative behavior when the first segment is empty", () => {
    expect(joinPath("", "file.txt")).toBe("/file.txt");
    expect(joinPath("", "dir", "file.txt")).toBe("/dir/file.txt");
  });

  it("handles root path segments", () => {
    expect(joinPath("/", "file.txt")).toBe("/file.txt");
    expect(joinPath("/", "dir", "file.txt")).toBe("/dir/file.txt");
  });

  it("skips empty path segments", () => {
    expect(joinPath("dir", "", "file.txt")).toBe("/dir/file.txt");
    expect(joinPath("", "dir", "", "file.txt", "")).toBe("/dir/file.txt");
  });

  it("returns empty string when no meaningful path is provided", () => {
    expect(joinPath()).toBe("");
    expect(joinPath("")).toBe("");
    expect(joinPath("", "")).toBe("");
    expect(joinPath("/")).toBe("");
    expect(joinPath("/", "")).toBe("");
  });

  it("normalizes multiple adjacent slashes inside segments", () => {
    expect(joinPath("//path1//", "//path2//")).toBe("/path1/path2");
    expect(joinPath("path1//nested", "path2")).toBe("/path1/nested/path2");
  });
});
