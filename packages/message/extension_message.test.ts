import { describe, expect, it, vi } from "vitest";
import { ExtensionContentMessageSend, ExtensionMessage, ExtensionMessageConnect } from "./extension_message";

describe("ExtensionMessage USER_SCRIPT compatibility", () => {
  it("reports a failed dedicated listener registration so USER_SCRIPT can use the regular-port fallback", () => {
    const runtime = chrome.runtime as unknown as {
      onUserScriptConnect?: { addListener: (callback: (...args: any[]) => void) => void };
      onUserScriptMessage?: { addListener: (callback: (...args: any[]) => void) => void };
      messageListener?: Array<(message: any, sender: any, sendResponse: (response: any) => void) => void>;
      connectListener?: Array<(port: chrome.runtime.Port) => void>;
    };
    const originalConnect = runtime.onUserScriptConnect;
    const originalMessage = runtime.onUserScriptMessage;
    const initialMessageListenerCount = runtime.messageListener?.length ?? 0;
    const initialConnectListenerCount = runtime.connectListener?.length ?? 0;
    try {
      runtime.onUserScriptConnect = {
        addListener: () => {
          throw new Error("userScripts permission unavailable");
        },
      };
      runtime.onUserScriptMessage = {
        addListener: () => {
          throw new Error("userScripts permission unavailable");
        },
      };
      const message = new ExtensionMessage(true);
      message.onConnect(() => undefined);
      message.onMessage(() => undefined);

      const response = vi.fn();
      const listeners = runtime.messageListener ?? [];
      listeners.at(-1)?.({ type: "userScripts.LISTEN_CONNECTIONS" }, {}, response);

      expect(response).toHaveBeenCalledWith(false);
    } finally {
      if (runtime.messageListener) runtime.messageListener.length = initialMessageListenerCount;
      if (runtime.connectListener) runtime.connectListener.length = initialConnectListenerCount;
      runtime.onUserScriptConnect = originalConnect;
      runtime.onUserScriptMessage = originalMessage;
    }
  });

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
