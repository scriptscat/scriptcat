import { describe, expect, it, vi } from "vitest";
import type { MessageConnect } from "@Packages/message/types";
import GMApi from "./gm_api";

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
