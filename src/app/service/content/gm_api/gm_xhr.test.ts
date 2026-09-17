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
});
