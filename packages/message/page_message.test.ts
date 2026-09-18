import { afterEach, describe, expect, it, vi } from "vitest";
import { PageMessage } from "./page_message";

type FakeWindow = Window & {
  handlers: Set<(event: MessageEvent) => void>;
};

const createWindow = (): FakeWindow => {
  const handlers = new Set<(event: MessageEvent) => void>();
  const target = {
    handlers,
    addEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
      handlers.add(handler);
    }),
    removeEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
      handlers.delete(handler);
    }),
    postMessage: vi.fn((data: unknown) => {
      queueMicrotask(() => {
        for (const handler of handlers) handler({ source: target, data } as unknown as MessageEvent);
      });
    }),
  } as unknown as FakeWindow;
  return target;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PageMessage", () => {
  it("routes structured-clone messages only to the opposite role", async () => {
    const target = createWindow();
    const scripting = new PageMessage("page-message-test", "scripting", target);
    const inject = new PageMessage("page-message-test", "inject", target);
    const received = vi.fn((_data, sendResponse) => sendResponse({ code: 0, data: "pong" }));
    inject.onMessage(received);

    const response = await scripting.sendMessage({ action: "inject/ping", data: "ping" });

    expect(response).toEqual({ code: 0, data: "pong" });
    expect(received).toHaveBeenCalledWith(
      { action: "inject/ping", data: "ping" },
      expect.any(Function),
      expect.any(Object)
    );
    expect(target.postMessage).toHaveBeenCalledTimes(2);

    scripting.dispose();
    inject.dispose();
  });

  it("supports scoped connections and removes its listener on dispose", async () => {
    const target = createWindow();
    const scripting = new PageMessage("page-message-test", "scripting", target);
    const inject = new PageMessage("page-message-test", "inject", target);
    const received = vi.fn();
    inject.onConnect((_data, connection) => connection.onMessage(received));

    const connection = await scripting.connect({ action: "inject/connect" });
    connection.sendMessage({ action: "inject/message", data: 1 });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(received).toHaveBeenCalledWith({ action: "inject/message", data: 1 });
    const handlerCount = target.handlers.size;
    scripting.dispose();
    expect(target.handlers.size).toBe(handlerCount - 1);
    inject.dispose();
  });

  it("ignores envelopes with accessor fields without executing the accessor", () => {
    const target = createWindow();
    const inject = new PageMessage("page-message-test", "inject", target);
    const received = vi.fn();
    inject.onMessage(received);
    const envelope: Record<string, unknown> = {
      channel: "page-message-test",
      source: "scripting",
      target: "inject",
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

    const handler = [...target.handlers][0];
    expect(() => handler({ source: target, data: envelope } as unknown as MessageEvent)).not.toThrow();
    expect(accessed).toBe(false);
    expect(received).not.toHaveBeenCalled();
    inject.dispose();
  });

  it("ignores proxy envelopes whose own-key inspection is hostile", () => {
    const target = createWindow();
    const inject = new PageMessage("page-message-test", "inject", target);
    const received = vi.fn();
    inject.onMessage(received);
    const envelope = new Proxy(
      {
        channel: "page-message-test",
        source: "scripting",
        target: "inject",
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

    const handler = [...target.handlers][0];
    expect(() => handler({ source: target, data: envelope } as unknown as MessageEvent)).not.toThrow();
    expect(received).not.toHaveBeenCalled();
    inject.dispose();
  });
});
