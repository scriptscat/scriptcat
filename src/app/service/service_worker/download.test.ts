import chromeMock from "@Packages/chrome-extension-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detachDownloadCallback, startDownload, type DownloadCallback } from "./download";

const downloadsMock = chromeMock.downloads as unknown as {
  reset: () => void;
  items: Map<
    number,
    chrome.downloads.DownloadItem & {
      conflictAction?: `${chrome.downloads.FilenameConflictAction}`;
    }
  >;
  autoComplete: boolean;
  hook: { emit: (event: string, ...args: any[]) => boolean };
  complete: (downloadId: number) => void;
  interrupt: (downloadId: number, error?: `${chrome.downloads.InterruptReason}`) => void;
};

const waitForDownloadEvents = () => new Promise((resolve) => setTimeout(resolve, 20));
const waitForQueue = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("chrome-extension-mock downloads", () => {
  beforeEach(() => {
    downloadsMock.reset();
  });

  it("支持 Promise 风格 download/search/erase，并记录接近 Chrome DownloadItem 的状态", async () => {
    const id = await chrome.downloads.download({
      url: "https://example.com/files/report.txt",
      conflictAction: "overwrite",
    });

    expect(id).toBe(1);
    expect(await chrome.downloads.search({ id })).toMatchObject([
      {
        id,
        url: "https://example.com/files/report.txt",
        filename: "report.txt",
        state: "in_progress",
        byExtensionId: chrome.runtime.id,
      },
    ]);

    await waitForDownloadEvents();

    expect(await chrome.downloads.search({ id, state: "complete" })).toHaveLength(1);
    expect(await chrome.downloads.erase({ id })).toEqual([id]);
    expect(await chrome.downloads.search({ id })).toEqual([]);
  });

  it("支持 callback 风格下载，并按 Chrome 顺序先返回 id 再触发完成事件", async () => {
    const changed = vi.fn();
    chrome.downloads.onChanged.addListener(changed);

    const callback = vi.fn();
    chrome.downloads.download({ url: "https://example.com/a.user.js" }, callback);

    expect(callback).toHaveBeenCalledWith(1);
    expect(changed).not.toHaveBeenCalled();

    await waitForDownloadEvents();

    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        state: { previous: "in_progress", current: "complete" },
      })
    );
  });
});

describe("startDownload", () => {
  beforeEach(() => {
    downloadsMock.reset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await detachDownloadCallback();
    downloadsMock.reset();
    vi.restoreAllMocks();
  });

  it("启动下载后返回 id，并在完成时调用回调和卸载监听", async () => {
    const callback = vi.fn<(o: DownloadCallback) => void>();

    const id = await startDownload({ url: "blob:https://scriptcat.test/1", filename: "exports/a.zip" }, callback);

    expect(id).toBe(1);
    expect(chrome.downloads.onChanged.hasListeners()).toBe(true);
    expect(chrome.downloads.onDeterminingFilename.hasListeners()).toBe(true);

    await waitForDownloadEvents();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadId: id,
        state: "complete",
      })
    );

    expect(chrome.downloads.onChanged.hasListeners()).toBe(false);
    expect(chrome.downloads.onDeterminingFilename.hasListeners()).toBe(false);
  });

  it("通过 onDeterminingFilename 覆盖文件名，并保留指定 conflictAction", async () => {
    const id = await startDownload({
      url: "blob:https://scriptcat.test/2",
      filename: "脚本备份/backup.zip",
      conflictAction: "overwrite",
    });

    await waitForDownloadEvents();

    expect(downloadsMock.items.get(id!)?.filename).toBe("脚本备份/backup.zip");
    expect(downloadsMock.items.get(id!)?.conflictAction).toBe("overwrite");
  });

  it("未指定 conflictAction 时默认使用 uniquify", async () => {
    const id = await startDownload({
      url: "blob:https://scriptcat.test/3",
      filename: "backup.zip",
    });

    await waitForDownloadEvents();

    expect(downloadsMock.items.get(id!)?.filename).toBe("backup.zip");
    expect(downloadsMock.items.get(id!)?.conflictAction).toBe("uniquify");
  });

  it("没有 filename 时不覆盖浏览器推断的文件名", async () => {
    const id = await startDownload({
      url: "https://example.com/path/original.txt",
    });

    await waitForDownloadEvents();

    expect(downloadsMock.items.get(id!)?.filename).toBe("original.txt");
    expect(downloadsMock.items.get(id!)?.conflictAction).toBeUndefined();
  });

  it("下载中断时返回 interrupted 并清理监听", async () => {
    downloadsMock.autoComplete = false;
    const callback = vi.fn<(o: DownloadCallback) => void>();

    const id = await startDownload({ url: "blob:https://scriptcat.test/4", filename: "fail.zip" }, callback);
    downloadsMock.interrupt(id!, "NETWORK_FAILED");
    await waitForQueue();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadId: id,
        state: expect.stringMatching(/interrupted|save_cancelled/), // 仅模拟错误
      })
    );
    expect(chrome.downloads.onChanged.hasListeners()).toBe(false);
    expect(chrome.downloads.onDeterminingFilename.hasListeners()).toBe(false);
  });

  it("下载回调抛错时仍然清理监听并隔离异常", async () => {
    const callback = vi.fn(() => {
      throw new Error("callback failed");
    });

    await startDownload(
      {
        url: "blob:https://scriptcat.test/callback-error",
        filename: "error.zip",
      },
      callback
    );
    await waitForDownloadEvents();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("download callback error:", expect.any(Error));
    expect(chrome.downloads.onChanged.hasListeners()).toBe(false);
    expect(chrome.downloads.onDeterminingFilename.hasListeners()).toBe(false);
  });

  it("忽略其他扩展发起的 onDeterminingFilename 事件", async () => {
    downloadsMock.autoComplete = false;
    const id = await startDownload({
      url: "blob:https://scriptcat.test/5",
      filename: "expected.zip",
    });

    const suggest = vi.fn();
    const handled = chrome.downloads.onDeterminingFilename.hasListeners();
    downloadsMock.hook.emit(
      "onDeterminingFilename",
      {
        id,
        filename: "foreign.zip",
        byExtensionId: "other-extension-id",
      },
      suggest
    );
    await waitForQueue();

    expect(handled).toBe(true);
    expect(suggest).not.toHaveBeenCalledWith(expect.objectContaining({ filename: "foreign.zip" }));
    expect(downloadsMock.items.get(id!)?.filename).not.toBe("foreign.zip");

    downloadsMock.complete(id!);
    await waitForQueue();
  });

  it("download API 失败时返回 undefined、输出错误并卸载监听", async () => {
    const id = await startDownload({} as chrome.downloads.DownloadOptions);

    expect(id).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    expect(chrome.downloads.onChanged.hasListeners()).toBe(false);
    expect(chrome.downloads.onDeterminingFilename.hasListeners()).toBe(false);
  });
});
