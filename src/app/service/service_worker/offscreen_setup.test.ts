import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const OFFSCREEN_URL = "chrome-extension://mock-extension-id/src/offscreen.html";

let getContextsMock: ReturnType<typeof vi.fn>;
let createDocumentMock: ReturnType<typeof vi.fn>;

// setupOffscreenDocument 使用模块级 latch, 每个用例用全新模块实例避免状态串扰
async function importModule() {
  vi.resetModules();
  return await import("./offscreen_setup.ts");
}

beforeEach(() => {
  getContextsMock = vi.fn().mockResolvedValue([]);
  createDocumentMock = vi.fn().mockResolvedValue(undefined);
  (chrome.runtime as any).getContexts = getContextsMock;
  (chrome.runtime as any).ContextType = { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" };
  vi.spyOn(chrome.runtime, "getURL").mockReturnValue(OFFSCREEN_URL);
  (chrome as any).offscreen = {
    createDocument: createDocumentMock,
    Reason: { BLOBS: "BLOBS", CLIPBOARD: "CLIPBOARD", DOM_SCRAPING: "DOM_SCRAPING", LOCAL_STORAGE: "LOCAL_STORAGE" },
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (chrome as any).offscreen;
  delete (chrome.runtime as any).getContexts;
  delete (chrome.runtime as any).ContextType;
});

describe("setupOffscreenDocument", () => {
  it("文档已存在时不再调用 createDocument", async () => {
    getContextsMock.mockResolvedValue([{ contextType: "OFFSCREEN_DOCUMENT" }]);
    const { setupOffscreenDocument } = await importModule();

    await expect(setupOffscreenDocument()).resolves.toBe(true);
    expect(createDocumentMock).not.toHaveBeenCalled();
  });

  it("文档不存在时创建成功并返回 true", async () => {
    const { setupOffscreenDocument } = await importModule();

    await expect(setupOffscreenDocument()).resolves.toBe(true);
    expect(createDocumentMock).toHaveBeenCalledTimes(1);
  });

  it("并发调用共享同一次创建", async () => {
    const { setupOffscreenDocument } = await importModule();

    const [a, b] = await Promise.all([setupOffscreenDocument(), setupOffscreenDocument()]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(createDocumentMock).toHaveBeenCalledTimes(1);
  });

  it("createDocument 因文档已存在而失败时（TOCTOU 竞态）视为成功", async () => {
    createDocumentMock.mockRejectedValue(new Error("Only a single offscreen document may be created."));
    // 第一次检查（创建前）不存在, 失败后复查时已存在
    getContextsMock.mockResolvedValueOnce([]).mockResolvedValue([{ contextType: "OFFSCREEN_DOCUMENT" }]);
    const { setupOffscreenDocument } = await importModule();

    await expect(setupOffscreenDocument()).resolves.toBe(true);
  });

  it("createDocument 暂时性失败后应退避重试并最终成功", async () => {
    vi.useFakeTimers();
    createDocumentMock.mockRejectedValueOnce(new Error("transient failure")).mockResolvedValue(undefined);
    const { setupOffscreenDocument } = await importModule();

    const promise = setupOffscreenDocument();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toBe(true);
    expect(createDocumentMock).toHaveBeenCalledTimes(2);
  });

  it("createDocument 持续失败时返回 false, 且 latch 被重置允许后续重试成功", async () => {
    vi.useFakeTimers();
    createDocumentMock.mockRejectedValue(new Error("persistent failure"));
    const { setupOffscreenDocument } = await importModule();

    const promise = setupOffscreenDocument();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(promise).resolves.toBe(false);

    // 失败后 latch 必须重置: 下一次调用可重新尝试并成功
    createDocumentMock.mockResolvedValue(undefined);
    const retryPromise = setupOffscreenDocument();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(retryPromise).resolves.toBe(true);
  });

  it("浏览器不支持 chrome.offscreen 时返回 false 而不抛错（Firefox）", async () => {
    delete (chrome as any).offscreen;
    const { setupOffscreenDocument } = await importModule();

    await expect(setupOffscreenDocument()).resolves.toBe(false);
  });
});
