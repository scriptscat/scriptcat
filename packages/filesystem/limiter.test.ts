import { afterEach, describe, expect, it, vi } from "vitest";
import type FileSystem from "./filesystem";
import type { FileInfo, FileReader, FileWriter } from "./filesystem";
import LimiterFileSystem from "./limiter";

function createFs(): FileSystem {
  return {
    verify: vi.fn(async () => {}),
    open: vi.fn(async () => {
      const reader: FileReader = {
        read: vi.fn(async () => "content"),
      };
      return reader;
    }),
    openDir: vi.fn(async () => createFs()),
    create: vi.fn(async () => {
      const writer: FileWriter = {
        write: vi.fn(async () => {}),
      };
      return writer;
    }),
    createDir: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    getDirUrl: vi.fn(async () => "url"),
  };
}

const file: FileInfo = {
  name: "test.user.js",
  path: "/test.user.js",
  size: 1,
  digest: "digest",
  createtime: 1,
  updatetime: 1,
};

describe("LimiterFileSystem", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should retry list on 429", async () => {
    vi.useFakeTimers();
    const fs = createFs();
    vi.mocked(fs.list).mockRejectedValueOnce(new Error("429 Too Many Requests")).mockResolvedValueOnce([]);
    const limiter = new LimiterFileSystem(fs);

    const promise = limiter.list();
    await vi.runOnlyPendingTimersAsync();

    await expect(promise).resolves.toEqual([]);
    expect(fs.list).toHaveBeenCalledTimes(2);
  });

  it("should retry verify on 429", async () => {
    vi.useFakeTimers();
    const fs = createFs();
    vi.mocked(fs.verify).mockRejectedValueOnce(new Error("429 Too Many Requests")).mockResolvedValueOnce(undefined);
    const limiter = new LimiterFileSystem(fs);

    const promise = limiter.verify();
    await vi.runOnlyPendingTimersAsync();

    await expect(promise).resolves.toBeUndefined();
    expect(fs.verify).toHaveBeenCalledTimes(2);
  });

  it("should retry open on 429", async () => {
    vi.useFakeTimers();
    const fs = createFs();
    const reader: FileReader = { read: vi.fn(async () => "content") };
    vi.mocked(fs.open).mockRejectedValueOnce(new Error("429 Too Many Requests")).mockResolvedValueOnce(reader);
    const limiter = new LimiterFileSystem(fs);

    const promise = limiter.open(file);
    await vi.runOnlyPendingTimersAsync();

    await expect(promise).resolves.toBeDefined();
    expect(fs.open).toHaveBeenCalledTimes(2);
  });

  it("should retry openDir on 429", async () => {
    vi.useFakeTimers();
    const fs = createFs();
    const inner = createFs();
    vi.mocked(fs.openDir).mockRejectedValueOnce(new Error("429 Too Many Requests")).mockResolvedValueOnce(inner);
    const limiter = new LimiterFileSystem(fs);

    const promise = limiter.openDir("/dir");
    await vi.runOnlyPendingTimersAsync();

    await expect(promise).resolves.toBeDefined();
    expect(fs.openDir).toHaveBeenCalledTimes(2);
  });

  it("should retry getDirUrl on 429", async () => {
    vi.useFakeTimers();
    const fs = createFs();
    vi.mocked(fs.getDirUrl).mockRejectedValueOnce(new Error("429 Too Many Requests")).mockResolvedValueOnce("url");
    const limiter = new LimiterFileSystem(fs);

    const promise = limiter.getDirUrl();
    await vi.runOnlyPendingTimersAsync();

    await expect(promise).resolves.toBe("url");
    expect(fs.getDirUrl).toHaveBeenCalledTimes(2);
  });

  it("should not retry create on 429", async () => {
    const fs = createFs();
    vi.mocked(fs.create).mockRejectedValueOnce(new Error("429 Too Many Requests"));
    const limiter = new LimiterFileSystem(fs);

    await expect(limiter.create(file.path)).rejects.toThrow("429 Too Many Requests");
    expect(fs.create).toHaveBeenCalledTimes(1);
  });

  it("should pass FileCreateOptions through create", async () => {
    const fs = createFs();
    const limiter = new LimiterFileSystem(fs);
    await limiter.create(file.path, { modifiedDate: 123 });
    expect(fs.create).toHaveBeenCalledWith(file.path, { modifiedDate: 123 });
  });

  it("should pass FileCreateOptions through createDir", async () => {
    const fs = createFs();
    const limiter = new LimiterFileSystem(fs);
    await limiter.createDir("/dir", { modifiedDate: 456 });
    expect(fs.createDir).toHaveBeenCalledWith("/dir", { modifiedDate: 456 });
  });

  it("should not retry delete on 429", async () => {
    const fs = createFs();
    vi.mocked(fs.delete).mockRejectedValueOnce(new Error("429 Too Many Requests"));
    const limiter = new LimiterFileSystem(fs);

    await expect(limiter.delete("/test.user.js")).rejects.toThrow("429 Too Many Requests");
    expect(fs.delete).toHaveBeenCalledTimes(1);
  });

  it("should not retry createDir on 429", async () => {
    const fs = createFs();
    vi.mocked(fs.createDir).mockRejectedValueOnce(new Error("429 Too Many Requests"));
    const limiter = new LimiterFileSystem(fs);

    await expect(limiter.createDir("/dir")).rejects.toThrow("429 Too Many Requests");
    expect(fs.createDir).toHaveBeenCalledTimes(1);
  });

  it("should not retry writer.write on 429", async () => {
    const fs = createFs();
    const write = vi.fn(async () => {});
    vi.mocked(fs.create).mockResolvedValueOnce({
      write,
    });
    write.mockRejectedValueOnce(new Error("429 Too Many Requests"));
    const limiter = new LimiterFileSystem(fs);
    const writer = await limiter.create(file.path);

    await expect(writer.write("content")).rejects.toThrow("429 Too Many Requests");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("should retry reader.read on 429", async () => {
    vi.useFakeTimers();
    const fs = createFs();
    const read = vi.fn(async () => "content");
    vi.mocked(fs.open).mockResolvedValueOnce({
      read,
    });
    read.mockRejectedValueOnce(new Error("429 Too Many Requests"));
    read.mockResolvedValueOnce("content");
    const limiter = new LimiterFileSystem(fs);
    const reader = await limiter.open(file);

    const promise = reader.read("string");
    await vi.runOnlyPendingTimersAsync();

    await expect(promise).resolves.toBe("content");
    expect(read).toHaveBeenCalledTimes(2);
  });
});
