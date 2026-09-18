import { describe, expect, it, vi } from "vitest";
import { ExtensionContentMessageSend, ExtensionMessage, ExtensionMessageConnect } from "./extension_message";

describe("ExtensionMessage USER_SCRIPT compatibility", () => {
  it("does not require unavailable runtime event listeners", () => {
    const runtime = chrome.runtime as unknown as {
      onConnect?: typeof chrome.runtime.onConnect;
      onMessage?: typeof chrome.runtime.onMessage;
    };
    const onConnect = runtime.onConnect;
    const onMessage = runtime.onMessage;

    try {
      runtime.onConnect = undefined;
      runtime.onMessage = undefined;
      const message = new ExtensionMessage();

      expect(() => message.onConnect(() => undefined)).not.toThrow();
      expect(() => message.onMessage(() => undefined)).not.toThrow();
    } finally {
      runtime.onConnect = onConnect;
      runtime.onMessage = onMessage;
    }
  });

  it("keeps native sendMessage and connect bindings after runtime mutation", async () => {
    const runtime = chrome.runtime as unknown as {
      sendMessage: unknown;
      connect: unknown;
    };
    const sendMessage = runtime.sendMessage;
    const connect = runtime.connect;
    const message = new ExtensionMessage();

    try {
      runtime.sendMessage = () => {
        throw new Error("patched sendMessage");
      };
      runtime.connect = () => {
        throw new Error("patched connect");
      };

      await expect(message.sendMessage({ action: "test" })).resolves.toMatchObject({ success: true });
      await expect(message.connect({ action: "test" })).resolves.toBeDefined();
    } finally {
      runtime.sendMessage = sendMessage;
      runtime.connect = connect;
    }
  });

  it("keeps a native port postMessage binding after port mutation", () => {
    const nativePostMessage = vi.fn();
    const port = {
      postMessage: nativePostMessage,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
      disconnect: vi.fn(),
    } as unknown as chrome.runtime.Port;
    const connection = new ExtensionMessageConnect(port);

    port.postMessage = vi.fn();
    connection.sendMessage({ action: "native" });

    expect(nativePostMessage).toHaveBeenCalledWith({ action: "native" });
    connection.disconnect(true);
  });

  it("preserves an explicit main-frame target when frameId is zero", async () => {
    const sendMessage = vi
      .spyOn(chrome.tabs, "sendMessage")
      .mockImplementation((_tabId, _message, optionsOrCallback, callback) => {
        const responseCallback = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
        responseCallback?.({ success: true });
        return Promise.resolve({ success: true });
      });
    try {
      await new ExtensionContentMessageSend(7, { frameId: 0 }).sendMessage({ action: "private" });

      expect(sendMessage).toHaveBeenCalledWith(7, { action: "private" }, { frameId: 0 }, expect.any(Function));
    } finally {
      sendMessage.mockRestore();
    }
  });
});
