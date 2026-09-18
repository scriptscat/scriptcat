import { describe, expect, it, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { GM_xmlhttpRequest } from "./gm_xhr";

initTestEnv();

describe("GM_xmlhttpRequest callback cleanup", () => {
  it("settles and disconnects when an error callback throws", async () => {
    let onMessage!: (message: any) => void;
    const connection = {
      onMessage: vi.fn((callback: (message: any) => void) => {
        onMessage = callback;
      }),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const onloadend = vi.fn();
    const api = {
      isInvalidContext: () => false,
      connect: vi.fn().mockResolvedValue(connection),
      sendMessage: vi.fn(),
    };
    const request = GM_xmlhttpRequest(
      api as any,
      {
        url: "https://example.com/data",
        onerror: () => {
          throw new Error("user callback failed");
        },
        onloadend,
      },
      true
    );

    await vi.waitFor(() => expect(onMessage).toBeTypeOf("function"));
    onMessage({
      code: 0,
      action: "onerror",
      data: {
        finalUrl: "https://example.com/data",
        readyState: 4,
        status: 500,
        statusText: "",
        responseHeaders: "",
        useFetch: false,
        eventType: "onerror",
        ok: false,
        contentType: "text/plain",
        error: "network",
      },
    });
    onMessage({
      code: 0,
      action: "onloadend",
      data: {
        finalUrl: "https://example.com/data",
        readyState: 4,
        status: 500,
        statusText: "",
        responseHeaders: "",
        useFetch: false,
        eventType: "onloadend",
        ok: false,
        contentType: "text/plain",
      },
    });

    await expect(request.retPromise).rejects.toBe("network");
    expect(connection.disconnect).toHaveBeenCalledWith(true);
    expect(onloadend).toHaveBeenCalledTimes(1);
  });

  it("aborts and releases the connection even without an onabort callback", async () => {
    const connection = {
      onMessage: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const onloadend = vi.fn();
    const api = {
      isInvalidContext: () => false,
      connect: vi.fn().mockResolvedValue(connection),
      sendMessage: vi.fn(),
    };
    const request = GM_xmlhttpRequest(
      api as any,
      {
        url: "https://example.com/data",
        onloadend,
      },
      true
    );

    await vi.waitFor(() => expect(connection.onMessage).toHaveBeenCalled());
    request.abort();

    await expect(request.retPromise).rejects.toBe("AbortError");
    expect(connection.disconnect).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(onloadend).toHaveBeenCalledTimes(1));
  });

  it("honors abort requested before the native connection is ready", async () => {
    const connection = {
      onMessage: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const onloadend = vi.fn();
    const api = {
      isInvalidContext: () => false,
      connect: vi.fn().mockResolvedValue(connection),
      sendMessage: vi.fn(),
    };
    const request = GM_xmlhttpRequest(
      api as any,
      {
        url: "https://example.com/data",
        onloadend,
      },
      true
    );

    request.abort();

    await expect(request.retPromise).rejects.toBe("AbortError");
    expect(connection.disconnect).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(onloadend).toHaveBeenCalledTimes(1));
  });

  it("settles the request when connection setup rejects", async () => {
    const onerror = vi.fn();
    const onloadend = vi.fn();
    const api = {
      isInvalidContext: () => false,
      connect: vi.fn().mockRejectedValue(new Error("connection failed")),
      sendMessage: vi.fn(),
    };
    const request = GM_xmlhttpRequest(
      api as any,
      {
        url: "https://example.com/data",
        onerror,
        onloadend,
      },
      true
    );

    await expect(request.retPromise).rejects.toBe("connection failed");
    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
  });

  it("settles the request when data encoding rejects before connection setup", async () => {
    const onerror = vi.fn();
    const onloadend = vi.fn();
    const api = {
      isInvalidContext: () => false,
      connect: vi.fn(),
      sendMessage: vi.fn(),
    };
    const request = GM_xmlhttpRequest(
      api as any,
      {
        url: "https://example.com/data",
        data: Promise.reject(new Error("data failed")) as unknown as GMTypes.XHRDetails["data"],
        onerror,
        onloadend,
      },
      true
    );

    await expect(request.retPromise).rejects.toBe("data failed");
    expect(api.connect).not.toHaveBeenCalled();
    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
  });

  it("disconnects an established connection when listener setup throws", async () => {
    const onerror = vi.fn();
    const onloadend = vi.fn();
    const connection = {
      onMessage: vi.fn(() => {
        throw new Error("listener setup failed");
      }),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const api = {
      isInvalidContext: () => false,
      connect: vi.fn().mockResolvedValue(connection),
      sendMessage: vi.fn(),
    };
    const request = GM_xmlhttpRequest(
      api as any,
      {
        url: "https://example.com/data",
        onerror,
        onloadend,
      },
      true
    );

    await expect(request.retPromise).rejects.toBe("listener setup failed");
    expect(connection.disconnect).toHaveBeenCalledWith(true);
    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onloadend).toHaveBeenCalledTimes(1);
  });

  it("does not execute accessor headers while preparing the request", async () => {
    const getter = vi.fn(() => "forged");
    const headers = {} as Record<string, string>;
    Object.defineProperty(headers, "X-Hostile", { enumerable: true, configurable: true, get: getter });
    const connection = {
      onMessage: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const api = {
      isInvalidContext: () => false,
      connect: vi.fn().mockResolvedValue(connection),
      sendMessage: vi.fn(),
    };
    const request = GM_xmlhttpRequest(api as any, { url: "https://example.com/data", headers }, false);

    await vi.waitFor(() => expect(api.connect).toHaveBeenCalled());
    expect(getter).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(api.connect.mock.calls[0][1][0].headers, "X-Hostile")).toBeUndefined();
    request.abort();
  });
});
