import { describe, expect, it, vi } from "vitest";
import type FileSystem from "./filesystem";
import * as filesystemModule from "./filesystem";
import LimiterFileSystem from "./limiter";

const getFileSystemCapabilities = (filesystemModule as Record<string, unknown>).getFileSystemCapabilities as (
  fs: FileSystem
) => unknown;

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

describe("FileSystem capabilities", () => {
  it("未声明能力时应当默认不支持原子同步能力", () => {
    const fs = createFs();

    expect(getFileSystemCapabilities(fs)).toEqual({
      supportsAtomicCompareAndSwap: false,
      supportsCreateOnly: false,
      supportsConditionalDelete: false,
    });
  });

  it("应当合并 provider 显式声明的能力", () => {
    const fs = createFs({
      capabilities: {
        supportsCreateOnly: true,
      },
    } as Partial<FileSystem>);

    expect(getFileSystemCapabilities(fs)).toEqual({
      supportsAtomicCompareAndSwap: false,
      supportsCreateOnly: true,
      supportsConditionalDelete: false,
    });
  });

  it("LimiterFileSystem 应当透传底层 provider 能力", () => {
    const fs = createFs({
      capabilities: {
        supportsAtomicCompareAndSwap: true,
        supportsConditionalDelete: true,
      },
    } as Partial<FileSystem>);
    const limiter = new LimiterFileSystem(fs);

    expect(getFileSystemCapabilities(limiter)).toEqual({
      supportsAtomicCompareAndSwap: true,
      supportsCreateOnly: false,
      supportsConditionalDelete: true,
    });
  });
});
