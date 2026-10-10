import { describe, expect, it, vi } from "vitest";
import { MessagePortMessage } from "./message_port_message";
import { createSandboxChannelClient, SandboxChannelHost } from "./sandbox_message_channel";

class FakePort {
  peer?: FakePort;
  private listeners = new Set<EventListenerOrEventListenerObject>();
  closed = false;

  postMessage = (data: unknown) => {
    if (this.closed) throw new Error("closed");
    const event = new MessageEvent("message", { data });
    queueMicrotask(() => this.peer?.dispatch(event));
  };

  addEventListener = (_type: string, listener: EventListenerOrEventListenerObject) => {
    this.listeners.add(listener);
  };

  removeEventListener = (_type: string, listener: EventListenerOrEventListenerObject) => {
    this.listeners.delete(listener);
  };

  start = vi.fn();

  close = () => {
    this.closed = true;
  };

  private dispatch(event: MessageEvent) {
    for (const listener of this.listeners) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
  }
}

const makePortPair = () => {
  const a = new FakePort();
  const b = new FakePort();
  a.peer = b;
  b.peer = a;
  return [a as unknown as MessagePort, b as unknown as MessagePort] as const;
};

class FakeWindow {
  private listeners = new Set<EventListenerOrEventListenerObject>();

  addEventListener = (_type: string, listener: EventListenerOrEventListenerObject) => {
    this.listeners.add(listener);
  };

  removeEventListener = (_type: string, listener: EventListenerOrEventListenerObject) => {
    this.listeners.delete(listener);
  };

  dispatchMessage(event: MessageEvent) {
    for (const listener of this.listeners) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
  }

  listenerCount() {
    return this.listeners.size;
  }
}

describe("MessagePortMessage", () => {
  it("preserves request/response semantics without a Window message bus", async () => {
    const [leftPort, rightPort] = makePortPair();
    const left = new MessagePortMessage(leftPort);
    const right = new MessagePortMessage(rightPort);
    right.onMessage((data, sendResponse) => {
      sendResponse({ code: 0, data: data.data });
    });

    await expect(left.sendMessage({ action: "sandbox/ping", data: "pong" })).resolves.toEqual({
      code: 0,
      data: "pong",
    });

    left.dispose();
    right.dispose();
  });

  it("does not consult a userscript-poisoned MessageEvent.prototype.data getter", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
    // happy-dom currently models MessageEvent.data as an own field rather than a WebIDL
    // prototype getter. Real-browser poisoning is covered by sandbox-message-port.spec.ts.
    if (!descriptor?.get || descriptor.configurable !== true) return;

    let poisonedReads = 0;
    Object.defineProperty(MessageEvent.prototype, "data", {
      ...descriptor,
      get() {
        poisonedReads += 1;
        return descriptor!.get!.call(this);
      },
    });

    const [leftPort, rightPort] = makePortPair();
    const left = new MessagePortMessage(leftPort);
    const right = new MessagePortMessage(rightPort);
    right.onMessage((data, sendResponse) => {
      sendResponse({ code: 0, data: data.data });
    });

    try {
      await expect(left.sendMessage({ action: "sandbox/ping", data: "private" })).resolves.toEqual({
        code: 0,
        data: "private",
      });
      expect(poisonedReads).toBe(0);
    } finally {
      left.dispose();
      right.dispose();
      Object.defineProperty(MessageEvent.prototype, "data", descriptor!);
    }
  });

  it("preserves scoped MessageConnect traffic", async () => {
    const [leftPort, rightPort] = makePortPair();
    const left = new MessagePortMessage(leftPort);
    const right = new MessagePortMessage(rightPort);
    const received = vi.fn();
    right.onConnect((_data, connection) => connection.onMessage(received));

    const connection = await left.connect({ action: "sandbox/connect" });
    connection.sendMessage({ action: "sandbox/chunk", data: 1 });
    await Promise.resolve();

    expect(received).toHaveBeenCalledWith({ action: "sandbox/chunk", data: 1 });

    left.dispose();
    right.dispose();
  });
});

describe("SandboxChannelHost", () => {
  it("accepts exactly one port from the expected sandbox Window and removes the global listener", async () => {
    const parentWindow = new FakeWindow();
    const expectedSandbox = {} as Window;
    const hostileSandbox = {} as Window;
    const host = new SandboxChannelHost(parentWindow as unknown as Window, expectedSandbox);
    const [sandboxPort, parentPort] = makePortPair();
    const sandboxMessage = new MessagePortMessage(sandboxPort);

    parentWindow.dispatchMessage({
      source: hostileSandbox,
      data: "scriptcat/sandbox-message-port/v1",
      ports: [parentPort],
    } as unknown as MessageEvent);
    expect(host.isReady()).toBe(false);

    parentWindow.dispatchMessage({
      source: expectedSandbox,
      data: "scriptcat/sandbox-message-port/v1",
      ports: [parentPort],
    } as unknown as MessageEvent);

    await host.ready();
    expect(host.isReady()).toBe(true);
    expect(parentWindow.listenerCount()).toBe(0);

    const received = vi.fn((_data, sendResponse) => sendResponse({ code: 0, data: "ok" }));
    host.onMessage(received);
    await expect(sandboxMessage.sendMessage({ action: "offscreen/ping" })).resolves.toEqual({
      code: 0,
      data: "ok",
    });

    host.dispose();
    sandboxMessage.dispose();
  });

  it("rejects object bootstrap values without inspecting them", () => {
    const parentWindow = new FakeWindow();
    const expectedSandbox = {} as Window;
    const host = new SandboxChannelHost(parentWindow as unknown as Window, expectedSandbox);
    let getterExecuted = false;
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "type", {
      enumerable: true,
      configurable: true,
      get() {
        getterExecuted = true;
        return "scriptcat/sandbox-message-port/v1";
      },
    });
    let proxyInspected = false;
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          proxyInspected = true;
          throw new Error("hostile proxy");
        },
      }
    );

    const [accessorPort] = makePortPair();
    parentWindow.dispatchMessage({
      source: expectedSandbox,
      data: accessor,
      ports: [accessorPort],
    } as unknown as MessageEvent);
    expect(getterExecuted).toBe(false);
    expect(host.isReady()).toBe(false);

    const [proxyPort] = makePortPair();
    parentWindow.dispatchMessage({
      source: expectedSandbox,
      data: proxy,
      ports: [proxyPort],
    } as unknown as MessageEvent);
    expect(proxyInspected).toBe(false);
    expect(host.isReady()).toBe(false);
    expect(parentWindow.listenerCount()).toBe(1);
    host.dispose();
  });

  it("transfers the private port with one versioned primitive marker exactly once", () => {
    const postMessage = vi.fn();
    const parentWindow = { postMessage } as unknown as Window;
    const [port1, port2] = makePortPair();
    const channel = { port1, port2 } as MessageChannel;
    const client = createSandboxChannelClient(parentWindow, channel);

    client.transferToParent();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith("scriptcat/sandbox-message-port/v1", "*", [channel.port2]);
    expect(() => client.transferToParent()).toThrow("Sandbox channel has already been transferred.");
    expect(postMessage).toHaveBeenCalledTimes(1);
    client.message.dispose();
  });
});
