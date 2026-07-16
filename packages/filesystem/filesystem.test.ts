import { describe, expect, it, vi } from "vitest";
import type FileSystem from "./filesystem";
import LimiterFileSystem from "./limiter";

function createFs(overrides: Partial<FileSystem> = {}): FileSystem {
  return {
    verify: vi.fn(async () => {}),
    open: vi.fn(async () => ({ read: vi.fn(async () => "") })),
    openDir: vi.fn(async () => createFs()),
    create: vi.fn(async () => ({ write: vi.fn(async () => {}) })),
    createDir: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    getDirUrl: vi.fn(async () => ""),
    ...overrides,
  };
}

describe("FileSystem 公共接口", () => {
  it("LimiterFileSystem 不应暴露已移除的条件操作能力", () => {
    const limiter = new LimiterFileSystem(createFs());

    expect("capabilities" in limiter).toBe(false);
  });
});
