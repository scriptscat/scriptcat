import { describe, expect, it, vi } from "vitest";
import type { IGetSender } from "@Packages/message/server";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import ValueUpdatePorts from "./value_port";
import type { ValueSubscription, ValueSubscriptionAck } from "../content/types";

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
    this.disconnectListener(true);
  }
  receive(message: TMessage) {
    this.messageListener(message);
  }
}

const senderOf = (port: TestPort) => ({ getConnect: () => port }) as unknown as IGetSender;
const update = {
  storageName: "a",
  uuid: "script-a",
  entries: [],
  sender: { runFlag: "", tabId: 1 },
  valueUpdated: true,
};

const sub = (storageName: string, revision = 0, uuids: string[] = []): ValueSubscription => ({
  storageName,
  revision,
  uuids,
});
// 默认按版本一致处理：只登记，不带快照
const registerOnly = (s: ValueSubscription, register: () => void): Promise<ValueSubscriptionAck> => {
  register();
  return Promise.resolve({ storageName: s.storageName, revision: s.revision });
};
const createPorts = (onError = vi.fn(), resolve = registerOnly) => new ValueUpdatePorts(onError, resolve);
const subscribe = async (port: TestPort, ...subs: ValueSubscription[]) => {
  port.receive({ action: "runtime/subscribeValueUpdates", data: subs });
  await vi.waitFor(() => expect(port.sent.some((m) => m.action === "runtime/valueSubscriptionsReady")).toBe(true));
};

describe("ValueUpdatePorts 精准推送", () => {
  it("只向订阅指定 storageName 的 frame Port 推送，同名订阅不重复投递", async () => {
    const ports = createPorts();
    const first = new TestPort();
    const second = new TestPort();
    const unrelated = new TestPort();
    expect(ports.connect(senderOf(first))).toEqual({ ready: true });
    ports.connect(senderOf(second));
    ports.connect(senderOf(unrelated));
    await subscribe(first, sub("a"), sub("c"), sub("a"));
    await subscribe(second, sub("b"), sub("a"));
    await subscribe(unrelated, sub("b"));

    ports.push("a", update);
    expect(first.sent).toEqual([
      { action: "runtime/valueSubscriptionsReady", data: [sub("a"), sub("c")].map(({ uuids: _, ...ack }) => ack) },
      { action: "runtime/valueUpdate", data: update },
    ]);
    expect(second.sent.at(-1)).toEqual({ action: "runtime/valueUpdate", data: update });
    expect(unrelated.sent).toHaveLength(1);
  });

  it("每个 storageName 交给写锁内的回调登记并取快照，确认里带上各自的版本和快照", async () => {
    const resolve = vi.fn(async (s: ValueSubscription, register: () => void): Promise<ValueSubscriptionAck> => {
      register();
      return s.storageName === "stale"
        ? { storageName: s.storageName, revision: 9, values: { u1: { k: "v" } } }
        : { storageName: s.storageName, revision: s.revision };
    });
    const ports = createPorts(vi.fn(), resolve);
    const port = new TestPort();
    ports.connect(senderOf(port));
    await subscribe(port, sub("stale", 3, ["u1"]), sub("fresh", 5, ["u2"]));

    expect(resolve).toHaveBeenCalledWith(sub("stale", 3, ["u1"]), expect.any(Function));
    expect(port.sent).toEqual([
      {
        action: "runtime/valueSubscriptionsReady",
        data: [
          { storageName: "stale", revision: 9, values: { u1: { k: "v" } } },
          { storageName: "fresh", revision: 5 },
        ],
      },
    ]);
    ports.push("fresh", update);
    expect(port.sent.at(-1)).toEqual({ action: "runtime/valueUpdate", data: update });
  });

  it("取快照期间 Port 已断开时，不再登记、不发确认", async () => {
    let finish!: () => void;
    const ports = createPorts(
      vi.fn(),
      (s, register) =>
        new Promise((resolve) => {
          finish = () => {
            register();
            resolve({ storageName: s.storageName, revision: 0 });
          };
        })
    );
    const port = new TestPort();
    ports.connect(senderOf(port));
    port.receive({ action: "runtime/subscribeValueUpdates", data: [sub("a")] });
    port.disconnect();
    port.sent = [];
    finish();
    await Promise.resolve();
    await Promise.resolve();
    ports.push("a", update);
    expect(port.sent).toEqual([]);
  });

  it("取快照失败时关闭 Port，让 frame 重连重试", async () => {
    const onError = vi.fn();
    const error = new Error("read failed");
    const ports = createPorts(onError, () => Promise.reject(error));
    const port = new TestPort();
    const disconnect = vi.spyOn(port, "disconnect");
    ports.connect(senderOf(port));
    port.receive({ action: "runtime/subscribeValueUpdates", data: [sub("a")] });
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledExactlyOnceWith({ kind: "subscribe" }, error);
  });

  it("改订阅和断连立刻清理索引，其他 Port 继续接收", async () => {
    const ports = createPorts();
    const first = new TestPort();
    const second = new TestPort();
    ports.connect(senderOf(first));
    ports.connect(senderOf(second));
    await subscribe(first, sub("a"));
    await subscribe(second, sub("a"));
    first.sent = [];
    await subscribe(first, sub("b"));
    second.disconnect();

    first.sent = [];
    second.sent = [];
    ports.push("a", update);
    expect(first.sent).toEqual([]);
    expect(second.sent).toEqual([]);
    ports.push("b", update);
    expect(first.sent).toEqual([{ action: "runtime/valueUpdate", data: update }]);
  });

  it("坏 Port 发送失败后释放，且不会阻断其他收件方", async () => {
    const onError = vi.fn();
    const ports = createPorts(onError);
    const bad = new TestPort();
    const good = new TestPort();
    ports.connect(senderOf(bad));
    ports.connect(senderOf(good));
    await subscribe(bad, sub("a"));
    await subscribe(good, sub("a"));
    const error = new Error("disconnected");
    bad.sendMessage = () => {
      throw error;
    };
    const disconnect = vi.spyOn(bad, "disconnect");
    good.sent = [];

    ports.push("a", update);
    ports.push("a", update);
    expect(good.sent).toEqual([
      { action: "runtime/valueUpdate", data: update },
      { action: "runtime/valueUpdate", data: update },
    ]);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith({ kind: "push", storageName: "a" }, error);
    // 只删除 SW 索引不够：客户端仍可能认为 Port 正常，无法自动重连并重新订阅。
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("订阅确认发送失败时关闭 Port，不保留不能确认的订阅", async () => {
    const onError = vi.fn();
    const ports = createPorts(onError);
    const broken = new TestPort();
    const error = new Error("closed before acknowledgement");
    ports.connect(senderOf(broken));
    broken.sendMessage = () => {
      throw error;
    };
    const disconnect = vi.spyOn(broken, "disconnect");

    broken.receive({ action: "runtime/subscribeValueUpdates", data: [sub("a")] });
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
    ports.push("a", update);

    expect(onError).toHaveBeenCalledExactlyOnceWith({ kind: "subscribe" }, error);
  });
});
