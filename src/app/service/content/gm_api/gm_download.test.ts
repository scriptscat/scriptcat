import { describe, expect, it, vi } from "vitest";
import type { MessageConnect } from "@Packages/message/types";
import GMApi from "./gm_api";
import { GM_xmlhttpRequest } from "./gm_xhr";

vi.mock("./gm_xhr", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    GM_xmlhttpRequest: vi.fn((_a: unknown, xhrParams: any) => {
      queueMicrotask(() => {
        xhrParams.onerror?.();
      });
      return { retPromise: Promise.resolve(), abort: vi.fn() };
    }),
  };
});

async function flushMicrotasks(times = 10) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function createFakeConnect() {
  let messageHandler: ((data: any) => void) | undefined;
  const conn = {
    onMessage(cb: (data: any) => void) {
      messageHandler = cb;
    },
    sendMessage: vi.fn(),
    disconnect: vi.fn(),
    onDisconnect: vi.fn(),
  } as unknown as MessageConnect;
  return {
    conn,
    emit(data: any) {
      messageHandler?.(data);
    },
  };
}

function createFakeA(conn: MessageConnect) {
  return {
    isInvalidContext: () => false,
    connect: vi.fn().mockResolvedValue(conn),
  };
}

describe.concurrent("GM_download onloadend", () => {
  it.concurrent("downloadMode=browser：onload 触发后应同时调用 onloadend，且携带相同数据", async () => {
    const { conn, emit } = createFakeConnect();
    const fakeA = createFakeA(conn);
    const onload = vi.fn();
    const onloadend = vi.fn();
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "browser",
      onload,
      onloadend,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    const payload = { loaded: 10, total: 10, mode: "native" };
    emit({ action: "onload", data: payload });

    expect(onload).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledWith(expect.objectContaining(payload));
  });

  it.concurrent(
    "downloadMode=browser：save_cancelled 触发后应同时调用 onload 与 onloadend（TM 视为成功）",
    async () => {
      const { conn, emit } = createFakeConnect();
      const fakeA = createFakeA(conn);
      const onload = vi.fn();
      const onloadend = vi.fn();
      const details: GMTypes.DownloadDetails<string> = {
        url: "https://example.com/a.zip",
        name: "a.zip",
        downloadMode: "browser",
        onload,
        onloadend,
      };
      GMApi._GM_download(fakeA as any, details, false);
      await flushMicrotasks();

      emit({ action: "save_cancelled", data: { loaded: 5, total: 10 } });

      expect(onload).toHaveBeenCalledTimes(1);
      expect(onloadend).toHaveBeenCalledTimes(1);
    }
  );

  it.concurrent("downloadMode=browser：ontimeout 触发后应同时调用 ontimeout 与 onloadend", async () => {
    const { conn, emit } = createFakeConnect();
    const fakeA = createFakeA(conn);
    const ontimeout = vi.fn();
    const onloadend = vi.fn();
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "browser",
      ontimeout,
      onloadend,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    emit({ action: "ontimeout" });

    expect(ontimeout).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
  });

  it.concurrent("downloadMode=browser：onerror 触发后应同时调用 onerror 与 onloadend", async () => {
    const { conn, emit } = createFakeConnect();
    const fakeA = createFakeA(conn);
    const onerror = vi.fn();
    const onloadend = vi.fn();
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "browser",
      onerror,
      onloadend,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    emit({ action: "onerror" });

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
  });

  it.concurrent("downloadMode=native：xhr 阶段 onerror（未取得 blob）应同时调用 onerror 与 onloadend", async () => {
    const fakeA = {
      isInvalidContext: () => false,
      connect: vi.fn(),
    };
    const onerror = vi.fn();
    const onloadend = vi.fn();
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "native",
      onerror,
      onloadend,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
    expect(fakeA.connect).not.toHaveBeenCalled();
  });
});

// 非 concurrent：以下用例通过 mockImplementationOnce 定制 GM_xmlhttpRequest 的行为，
// 与 describe.concurrent 中并发触发的默认 mock 共享同一队列会有竞态，因此单独放在顺序执行的 describe 中。
describe("GM_download 补充回归测试（native 部分下载 / browser connect 失败 / onloadend 抛错）", () => {
  it("native 模式：onerror 后 xhr onloadend 携带非空 Blob，不应触发浏览器下载", async () => {
    const fakeA = {
      isInvalidContext: () => false,
      connect: vi.fn(),
    };
    const onerror = vi.fn();
    const onloadend = vi.fn();
    vi.mocked(GM_xmlhttpRequest).mockImplementationOnce((_a: unknown, xhrParams: any) => {
      queueMicrotask(() => {
        xhrParams.onerror?.();
        xhrParams.onloadend?.({ response: new Blob(["partial data"]) });
      });
      return { retPromise: Promise.resolve(), abort: vi.fn() };
    });
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "native",
      onerror,
      onloadend,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
    expect(fakeA.connect).not.toHaveBeenCalled();
  });

  it("native 模式：ontimeout 后 xhr onloadend 携带非空 Blob，不应触发浏览器下载", async () => {
    const fakeA = {
      isInvalidContext: () => false,
      connect: vi.fn(),
    };
    const ontimeout = vi.fn();
    const onloadend = vi.fn();
    vi.mocked(GM_xmlhttpRequest).mockImplementationOnce((_a: unknown, xhrParams: any) => {
      queueMicrotask(() => {
        xhrParams.ontimeout?.();
        xhrParams.onloadend?.({ response: new Blob(["partial data"]) });
      });
      return { retPromise: Promise.resolve(), abort: vi.fn() };
    });
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "native",
      ontimeout,
      onloadend,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    expect(ontimeout).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
    expect(fakeA.connect).not.toHaveBeenCalled();
  });

  it("downloadMode=browser：a.connect 失败应触发 onerror/onloadend 并 reject retPromise", async () => {
    const onerror = vi.fn();
    const onloadend = vi.fn();
    const connectError = new Error("connect failed");
    const fakeA = {
      isInvalidContext: () => false,
      connect: vi.fn().mockRejectedValue(connectError),
    };
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "browser",
      onerror,
      onloadend,
    };
    const { retPromise } = GMApi._GM_download(fakeA as any, details, true);
    await flushMicrotasks();

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
    await expect(retPromise).rejects.toBe(connectError);
  });

  it("downloadMode=browser：onload 触发时 onloadend 抛错，不应阻止 retPromise resolve", async () => {
    const { conn, emit } = createFakeConnect();
    const fakeA = createFakeA(conn);
    const onloadend = vi.fn(() => {
      throw new Error("boom");
    });
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "browser",
      onloadend,
    };
    const { retPromise } = GMApi._GM_download(fakeA as any, details, true);
    await flushMicrotasks();

    const payload = { loaded: 10, total: 10 };
    expect(() => emit({ action: "onload", data: payload })).toThrow("boom");

    await expect(retPromise).resolves.toEqual(expect.objectContaining(payload));
  });

  it("downloadMode=native：下载成功后 onloadend 抛错，不应阻止 retPromise resolve 与 releaseResources（revokeObjectURL）", async () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
    const { conn, emit } = createFakeConnect();
    const fakeA = createFakeA(conn);
    vi.mocked(GM_xmlhttpRequest).mockImplementationOnce((_a: unknown, xhrParams: any) => {
      queueMicrotask(() => {
        xhrParams.onloadend?.({ response: new Blob(["full data"]) });
      });
      return { retPromise: Promise.resolve(), abort: vi.fn() };
    });
    const onloadend = vi.fn(() => {
      throw new Error("boom");
    });
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "native",
      onloadend,
    };
    const { retPromise } = GMApi._GM_download(fakeA as any, details, true);
    await flushMicrotasks();

    const payload = { loaded: 10, total: 10 };
    expect(() => emit({ action: "onload", data: payload })).toThrow("boom");
    await expect(retPromise).resolves.toEqual(payload);

    await new Promise((r) => setTimeout(r, 5));
    expect(revokeSpy).toHaveBeenCalled();
  });

  it("downloadMode=native：完整成功流程只触发一次 onload/onloadend，并释放 blob URL", async () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
    const { conn, emit } = createFakeConnect();
    const fakeA = createFakeA(conn);
    vi.mocked(GM_xmlhttpRequest).mockImplementationOnce((_a: unknown, xhrParams: any) => {
      queueMicrotask(() => {
        xhrParams.onloadend?.({ response: new Blob(["full data"]) });
      });
      return { retPromise: Promise.resolve(), abort: vi.fn() };
    });
    const onload = vi.fn();
    const onloadend = vi.fn();
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "native",
      onload,
      onloadend,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    expect(fakeA.connect).toHaveBeenCalledTimes(1);
    const payload = { loaded: 20, total: 20 };
    emit({ action: "onload", data: payload });

    expect(onload).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 5));
    expect(revokeSpy).toHaveBeenCalled();
  });

  it("downloadMode=browser：onerror 主回调抛错，仍应调用 onloadend 并 reject retPromise", async () => {
    const { conn, emit } = createFakeConnect();
    const fakeA = createFakeA(conn);
    const onerror = vi.fn(() => {
      throw new Error("boom");
    });
    const onloadend = vi.fn();
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "browser",
      onerror,
      onloadend,
    };
    const { retPromise } = GMApi._GM_download(fakeA as any, details, true);
    await flushMicrotasks();

    expect(() => emit({ action: "onerror" })).toThrow("boom");
    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
    await expect(retPromise).rejects.toThrow("Unknown ERROR");
  });

  it("native 模式：xhr 阶段失败后于用户 onloadend 内呼叫 abort()，retPromise 仍应 reject 而非永久 pending，且不应中断内部 XHR", async () => {
    const fakeA = {
      isInvalidContext: () => false,
      connect: vi.fn(),
    };
    const innerAbort = vi.fn();
    vi.mocked(GM_xmlhttpRequest).mockImplementationOnce((_a: unknown, xhrParams: any) => {
      queueMicrotask(() => {
        xhrParams.onerror?.();
      });
      // 模拟真实 GM_xmlhttpRequest：内部 retPromise 最终也会 reject（比 xhrParams.onerror 更晚触发）。
      return { retPromise: Promise.reject(new Error("mock xhr error")), abort: innerAbort };
    });
    const abortHolder: { fn?: () => void } = {};
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "native",
      onloadend: () => {
        abortHolder.fn?.();
      },
    };
    const { retPromise, abort } = GMApi._GM_download(fakeA as any, details, true);
    abortHolder.fn = abort;

    await expect(retPromise).rejects.toThrow();
    // XHR 阶段已失败：呼叫外层 abort() 不应再中断内部 XHR（否则内部 XHR 收不到
    // 自己真正的 onloadend 消息，其自身生命周期会永久卡住、无法完成清理）。
    expect(innerAbort).not.toHaveBeenCalled();
  });

  it("native 模式：xhr 阶段用户回调抛错不应同步向上传播（避免打断 GM_xmlhttpRequest 内部状态机）", async () => {
    const fakeA = {
      isInvalidContext: () => false,
      connect: vi.fn(),
    };
    const capturedHandlers: { onerror?: () => void; ontimeout?: () => void } = {};
    vi.mocked(GM_xmlhttpRequest).mockImplementationOnce((_a: unknown, xhrParams: any) => {
      capturedHandlers.onerror = xhrParams.onerror;
      capturedHandlers.ontimeout = xhrParams.ontimeout;
      return { retPromise: Promise.reject(new Error("mock xhr error")), abort: vi.fn() };
    });
    // 拦截 queueMicrotask：避免测试环境中真的抛出未捕获例外，同时保留对其排程内容的断言能力。
    const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});
    const onerror = vi.fn(() => {
      throw new Error("boom");
    });
    const details: GMTypes.DownloadDetails<string> = {
      url: "https://example.com/a.zip",
      name: "a.zip",
      downloadMode: "native",
      onerror,
    };
    GMApi._GM_download(fakeA as any, details, false);
    await flushMicrotasks();

    // 模拟 GM_xmlhttpRequest 内部（例如 code===-1 协议错误分支）同步呼叫 xhrParams.onerror()：
    // 若此处同步抛出，会中断该分支后续的 reqDone 置位与合成 onloadend 排程。
    expect(() => capturedHandlers.onerror?.()).not.toThrow();
    expect(onerror).toHaveBeenCalledTimes(1);
    expect(queueMicrotaskSpy).toHaveBeenCalledTimes(1);
    const deferredThrow = queueMicrotaskSpy.mock.calls[0][0] as () => void;
    expect(deferredThrow).toThrow("boom");

    queueMicrotaskSpy.mockRestore();
  });
});
