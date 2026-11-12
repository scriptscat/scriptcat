import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageConnect, MessageSend, TMessage } from "@Packages/message/types";
import ScriptingValuePort from "./value_port";

class TestPort implements MessageConnect {
  sent: TMessage[] = [];
  private messageListener: (message: TMessage) => void = () => undefined;
  private disconnectListener: (self: boolean) => void = () => undefined;
  sendMessage(message: TMessage) {
    this.sent.push(message);
  }
  onMessage(callback: (message: TMessage) => void) {
    this.messageListener = callback;
  }
  onDisconnect(callback: (self: boolean) => void) {
    this.disconnectListener = callback;
  }
  disconnect() {
    this.disconnectListener(false);
  }
  receive(message: TMessage) {
    this.messageListener(message);
  }
}

const createSender = (...ports: TestPort[]) => {
  const connect = vi.fn().mockImplementation(async () => {
    const port = ports.shift();
    if (!port) throw new Error("no test port available");
    return port;
  });
  return { sender: { connect } as unknown as MessageSend, connect };
};

describe("ScriptingValuePort 生命周期", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("启动即连接，待 SW 确认订阅后才放行页面脚本，按 Port 接收值更新", async () => {
    const port = new TestPort();
    const { sender, connect } = createSender(port);
    const delivered = vi.fn();
    const channel = new ScriptingValuePort(sender, delivered);
    channel.start();
    const ready = channel.subscribe(["shared", "shared", "content"]);
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    expect(connect).toHaveBeenCalledWith({ action: "serviceWorker/runtime/valueUpdates" });
    port.receive({ code: 0, data: { ready: true } });
    expect(port.sent).toEqual([{ action: "runtime/subscribeValueUpdates", data: ["shared", "content"] }]);

    let subscribed = false;
    void ready.then(() => (subscribed = true));
    await Promise.resolve();
    expect(subscribed).toBe(false);
    port.receive({ action: "runtime/valueSubscriptionsReady" });
    await ready;
    expect(subscribed).toBe(true);

    const update = { storageName: "shared", entries: [] };
    port.receive({ action: "runtime/valueUpdate", data: update });
    expect(delivered).toHaveBeenCalledWith(update);
    channel.stop();
  });

  it("断连重建 Port 并恢复存储订阅，旧 Port 不再使用", async () => {
    vi.useFakeTimers();
    const oldPort = new TestPort();
    const newPort = new TestPort();
    const { sender, connect } = createSender(oldPort, newPort);
    const channel = new ScriptingValuePort(sender, vi.fn());
    channel.start();
    const ready = channel.subscribe(["a"]);
    await Promise.resolve();
    oldPort.receive({ code: 0, data: { ready: true } });
    oldPort.receive({ action: "runtime/valueSubscriptionsReady" });
    await ready;

    oldPort.disconnect();
    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(2);
    newPort.receive({ code: 0, data: { ready: true } });
    expect(newPort.sent).toEqual([{ action: "runtime/subscribeValueUpdates", data: ["a"] }]);
    newPort.receive({ action: "runtime/valueSubscriptionsReady" });
    channel.stop();
  });

  const subscribeAndAck = async (channel: ScriptingValuePort, port: TestPort) => {
    const ready = channel.subscribe(["a"]);
    await Promise.resolve();
    port.receive({ code: 0, data: { ready: true } });
    port.receive({ action: "runtime/valueSubscriptionsReady" });
    await ready;
  };

  it("已确认订阅的 Port 被动断开（SW 休眠或重启）后立即重连，不等待退避", async () => {
    vi.useFakeTimers();
    const oldPort = new TestPort();
    const newPort = new TestPort();
    const { sender, connect } = createSender(oldPort, newPort);
    const channel = new ScriptingValuePort(sender, vi.fn());
    channel.start();
    await subscribeAndAck(channel, oldPort);
    await vi.advanceTimersByTimeAsync(30_000);

    oldPort.disconnect();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(2);
    channel.stop();
  });

  it("确认订阅后很快又断开时按退避重试，避免 SW 反复崩溃时陷入重连死循环", async () => {
    vi.useFakeTimers();
    const oldPort = new TestPort();
    const newPort = new TestPort();
    const { sender, connect } = createSender(oldPort, newPort);
    const channel = new ScriptingValuePort(sender, vi.fn());
    channel.start();
    await subscribeAndAck(channel, oldPort);

    oldPort.disconnect();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(2);
    channel.stop();
  });

  describe("扩展上下文失效（扩展重载、更新或卸载）", () => {
    const runtime = chrome.runtime as { id?: string };
    const extensionId = runtime.id;
    afterEach(() => {
      runtime.id = extensionId;
    });

    it("连接失败后停止，不再设定重试", async () => {
      vi.useFakeTimers();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const { sender, connect } = createSender();
        const channel = new ScriptingValuePort(sender, vi.fn());
        runtime.id = undefined;
        channel.start();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(connect).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it("Port 断开后停止，不再重连", async () => {
      vi.useFakeTimers();
      const port = new TestPort();
      const { sender, connect } = createSender(port, new TestPort());
      const channel = new ScriptingValuePort(sender, vi.fn());
      channel.start();
      await subscribeAndAck(channel, port);
      await vi.advanceTimersByTimeAsync(30_000);

      runtime.id = undefined;
      port.disconnect();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("没有脚本的 frame 释放 Port，不再尝试重连", async () => {
    vi.useFakeTimers();
    const port = new TestPort();
    const { sender, connect } = createSender(port);
    const channel = new ScriptingValuePort(sender, vi.fn());
    channel.start();
    await Promise.resolve();
    await channel.subscribe([]);
    port.disconnect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(connect).toHaveBeenCalledOnce();
  });

  it("bfcache 恢复时主动重建 Port，确保新 SW 知道订阅", async () => {
    const oldPort = new TestPort();
    const newPort = new TestPort();
    const { sender, connect } = createSender(oldPort, newPort);
    const channel = new ScriptingValuePort(sender, vi.fn());
    channel.start();
    const ready = channel.subscribe(["a"]);
    await Promise.resolve();
    expect(connect).toHaveBeenCalledOnce();
    oldPort.receive({ code: 0, data: { ready: true } });
    oldPort.receive({ action: "runtime/valueSubscriptionsReady" });
    await ready;

    const pageshow = new PageTransitionEvent("pageshow");
    // happy-dom 未实现 PageTransitionEvent.persisted，补上浏览器会提供的字段。
    Object.defineProperty(pageshow, "persisted", { value: true });
    expect(pageshow.persisted).toBe(true);
    window.dispatchEvent(pageshow);
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(2);
    newPort.receive({ code: 0, data: { ready: true } });
    expect(newPort.sent).toEqual([{ action: "runtime/subscribeValueUpdates", data: ["a"] }]);
    channel.stop();
  });

  it("bfcache 恢复时旧连接仍在建立也能重连，迟到的旧 Port 不覆盖新 Port", async () => {
    let resolveOld!: (port: MessageConnect) => void;
    const oldPortPromise = new Promise<MessageConnect>((resolve) => (resolveOld = resolve));
    const newPort = new TestPort();
    const oldPort = new TestPort();
    const oldDisconnect = vi.spyOn(oldPort, "disconnect");
    const connect = vi.fn().mockReturnValueOnce(oldPortPromise).mockResolvedValueOnce(newPort);
    const channel = new ScriptingValuePort({ connect } as unknown as MessageSend, vi.fn());
    channel.start();
    const ready = channel.subscribe(["a"]);

    const pageshow = new PageTransitionEvent("pageshow");
    Object.defineProperty(pageshow, "persisted", { value: true });
    window.dispatchEvent(pageshow);
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2));

    resolveOld(oldPort);
    await Promise.resolve();
    newPort.receive({ code: 0, data: { ready: true } });
    expect(newPort.sent).toEqual([{ action: "runtime/subscribeValueUpdates", data: ["a"] }]);
    expect(oldPort.sent).toEqual([]);
    expect(oldDisconnect).toHaveBeenCalledOnce();
    newPort.receive({ action: "runtime/valueSubscriptionsReady" });
    await ready;
    channel.stop();
  });

  it("订阅发送时 Port 已经断开则重试，而非永久卡住 pageLoad", async () => {
    vi.useFakeTimers();
    const oldPort = new TestPort();
    const newPort = new TestPort();
    const { sender, connect } = createSender(oldPort, newPort);
    const channel = new ScriptingValuePort(sender, vi.fn());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      channel.start();
      const ready = channel.subscribe(["a"]);
      await Promise.resolve();
      oldPort.sendMessage = () => {
        throw new Error("closed");
      };
      oldPort.receive({ code: 0, data: { ready: true } });
      await vi.advanceTimersByTimeAsync(1000);
      expect(connect).toHaveBeenCalledTimes(2);
      newPort.receive({ code: 0, data: { ready: true } });
      newPort.receive({ action: "runtime/valueSubscriptionsReady" });
      await ready;
      expect(errorSpy).toHaveBeenCalledOnce();
      channel.stop();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
