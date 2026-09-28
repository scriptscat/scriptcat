import { afterEach, describe, expect, it, vi } from "vitest";
import { PageEventMessage } from "./page_event_message";
import { pageDispatchCustomEvent } from "./common";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PageEventMessage", () => {
  it("routes messages only to the opposite role over a keyed performance event", async () => {
    const scripting = new PageEventMessage("page-message-test", "scripting");
    const inject = new PageEventMessage("page-message-test", "inject");
    const received = vi.fn((_data, sendResponse) => sendResponse({ code: 0, data: "pong" }));
    inject.onMessage(received);

    const response = await scripting.sendMessage({ action: "inject/ping", data: "ping" });

    expect(response).toEqual({ code: 0, data: "pong" });
    expect(received).toHaveBeenCalledWith(
      { action: "inject/ping", data: "ping" },
      expect.any(Function),
      expect.any(Object)
    );

    scripting.dispose();
    inject.dispose();
  });

  it("does not publish bridge payloads on window message", async () => {
    const onWindowMessage = vi.fn();
    window.addEventListener("message", onWindowMessage);
    const scripting = new PageEventMessage("page-message-no-window", "scripting");
    const inject = new PageEventMessage("page-message-no-window", "inject");
    inject.onMessage((_data, sendResponse) => sendResponse({ code: 0 }));

    await scripting.sendMessage({ action: "inject/ping" });
    await Promise.resolve();

    expect(onWindowMessage).not.toHaveBeenCalled();

    window.removeEventListener("message", onWindowMessage);
    scripting.dispose();
    inject.dispose();
  });

  it("supports scoped connections and removes its keyed listener on dispose", async () => {
    const scripting = new PageEventMessage("page-message-connect", "scripting");
    const inject = new PageEventMessage("page-message-connect", "inject");
    const received = vi.fn();
    inject.onConnect((_data, connection) => connection.onMessage(received));

    const connection = await scripting.connect({ action: "inject/connect" });
    connection.sendMessage({ action: "inject/message", data: 1 });

    expect(received).toHaveBeenCalledWith({ action: "inject/message", data: 1 });

    scripting.dispose();
    inject.dispose();

    expect(() =>
      pageDispatchCustomEvent("page-message-connect.pageEventMessage.scripting.inject", {
        messageId: "after-dispose",
        type: "connectMessage",
        data: { action: "inject/message", data: 2 },
      })
    ).not.toThrow();
    expect(received).toHaveBeenCalledTimes(1);
  });

  it("preserves local and peer disconnect notifications", async () => {
    const scripting = new PageEventMessage("page-message-disconnect", "scripting");
    const inject = new PageEventMessage("page-message-disconnect", "inject");
    const localDisconnect = vi.fn();
    const peerDisconnect = vi.fn();
    inject.onConnect((_data, connection) => connection.onDisconnect(peerDisconnect));

    const connection = await scripting.connect({ action: "inject/connect" });
    connection.onDisconnect(localDisconnect);
    connection.disconnect();

    expect(localDisconnect).toHaveBeenCalledWith(true);
    expect(peerDisconnect).toHaveBeenCalledWith(false);
    expect(() => connection.disconnect(true)).not.toThrow();
    expect(() => connection.sendMessage({ action: "inject/message" })).toThrow();
    scripting.dispose();
    inject.dispose();
  });

  it("ignores events on a different channel or role route", () => {
    const inject = new PageEventMessage("page-message-route", "inject");
    const received = vi.fn();
    inject.onMessage(received);
    const body = { messageId: "wrong-route", type: "sendMessage", data: { action: "inject/ping" } } as const;

    pageDispatchCustomEvent("other-channel.pageEventMessage.scripting.inject", body);
    pageDispatchCustomEvent("page-message-route.pageEventMessage.inject.inject", body);

    expect(received).not.toHaveBeenCalled();
    inject.dispose();
  });

  it("ignores envelopes with accessor fields without executing the accessor", () => {
    const inject = new PageEventMessage("page-message-accessor", "inject");
    const received = vi.fn();
    inject.onMessage(received);
    const envelope: Record<string, unknown> = {
      messageId: "hostile",
      type: "sendMessage",
      data: { action: "inject/ping" },
    };
    let accessed = false;
    Object.defineProperty(envelope, "data", {
      configurable: true,
      enumerable: true,
      get() {
        accessed = true;
        throw new Error("page getter executed");
      },
    });

    expect(() =>
      pageDispatchCustomEvent("page-message-accessor.pageEventMessage.scripting.inject", envelope)
    ).not.toThrow();
    expect(accessed).toBe(false);
    expect(received).not.toHaveBeenCalled();
    inject.dispose();
  });

  it("ignores proxy envelopes whose own-key inspection is hostile", () => {
    const inject = new PageEventMessage("page-message-proxy", "inject");
    const received = vi.fn();
    inject.onMessage(received);
    const envelope = new Proxy(
      {
        messageId: "hostile",
        type: "sendMessage",
        data: { action: "inject/ping" },
      },
      {
        ownKeys() {
          throw new Error("page proxy executed");
        },
      }
    );

    expect(() =>
      pageDispatchCustomEvent("page-message-proxy.pageEventMessage.scripting.inject", envelope)
    ).not.toThrow();
    expect(received).not.toHaveBeenCalled();
    inject.dispose();
  });

  it("rejects envelopes with unexpected own keys", () => {
    const inject = new PageEventMessage("page-message-extra-key", "inject");
    const received = vi.fn();
    inject.onMessage(received);

    pageDispatchCustomEvent("page-message-extra-key.pageEventMessage.scripting.inject", {
      messageId: "hostile",
      type: "sendMessage",
      data: { action: "inject/ping" },
      extra: true,
    });

    expect(received).not.toHaveBeenCalled();
    inject.dispose();
  });
});
