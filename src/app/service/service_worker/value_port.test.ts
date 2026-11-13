import { describe, expect, it, vi } from "vitest";
import type { IGetSender } from "@Packages/message/server";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import ValueUpdatePorts from "./value_port";

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

describe("ValueUpdatePorts 精准推送", () => {
  it("只向订阅指定 storageName 的 frame Port 推送，同名脚本不重复投递", () => {
    const ports = new ValueUpdatePorts(vi.fn());
    const first = new TestPort();
    const second = new TestPort();
    const unrelated = new TestPort();
    expect(ports.connect(senderOf(first))).toEqual({ ready: true });
    ports.connect(senderOf(second));
    ports.connect(senderOf(unrelated));
    first.receive({ action: "runtime/subscribeValueUpdates", data: ["a", "c", "a"] });
    second.receive({ action: "runtime/subscribeValueUpdates", data: ["b", "a"] });
    unrelated.receive({ action: "runtime/subscribeValueUpdates", data: ["b"] });

    ports.push("a", update);
    expect(first.sent).toEqual([
      { action: "runtime/valueSubscriptionsReady" },
      { action: "runtime/valueUpdate", data: update },
    ]);
    expect(second.sent).toEqual(first.sent);
    expect(unrelated.sent).toEqual([{ action: "runtime/valueSubscriptionsReady" }]);
  });

  it("改订阅和断连立刻清理索引，其他 Port 继续接收", () => {
    const ports = new ValueUpdatePorts(vi.fn());
    const first = new TestPort();
    const second = new TestPort();
    ports.connect(senderOf(first));
    ports.connect(senderOf(second));
    first.receive({ action: "runtime/subscribeValueUpdates", data: ["a"] });
    second.receive({ action: "runtime/subscribeValueUpdates", data: ["a"] });
    first.receive({ action: "runtime/subscribeValueUpdates", data: ["b"] });
    second.disconnect();

    first.sent = [];
    second.sent = [];
    ports.push("a", update);
    expect(first.sent).toEqual([]);
    expect(second.sent).toEqual([]);
    ports.push("b", update);
    expect(first.sent).toEqual([{ action: "runtime/valueUpdate", data: update }]);
  });

  it("坏 Port 发送失败后释放，且不会阻断其他收件方", () => {
    const onError = vi.fn();
    const ports = new ValueUpdatePorts(onError);
    const bad = new TestPort();
    const good = new TestPort();
    ports.connect(senderOf(bad));
    ports.connect(senderOf(good));
    bad.receive({ action: "runtime/subscribeValueUpdates", data: ["a"] });
    good.receive({ action: "runtime/subscribeValueUpdates", data: ["a"] });
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

  it("版本相同不复制 snapshot，版本不同仅发送变化的存储空间", async () => {
    const reader = vi.fn(async (storageName: string) => ({
      storageName,
      epoch: "generation-1",
      revision: 5,
      values: { k: 5 },
    }));
    const ports = new ValueUpdatePorts(vi.fn(), reader);
    const port = new TestPort();
    ports.connect(senderOf(port));
    port.receive({
      action: "runtime/subscribeValueUpdates",
      data: {
        names: ["matching", "changed"],
        requestId: 42,
        versions: {
          matching: { epoch: "generation-1", revision: 5 },
          changed: { epoch: "generation-1", revision: 4 },
        },
      },
    });
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(reader).toHaveBeenCalledTimes(2);
    expect(port.sent[0]).toEqual({
      action: "runtime/valueSubscriptionsReady",
      data: {
        requestId: 42,
        snapshots: [{ storageName: "changed", epoch: "generation-1", revision: 5, values: { k: 5 } }],
      },
    });
  });

  it("订阅确认发送失败时关闭 Port，不保留不能确认的订阅", () => {
    const onError = vi.fn();
    const ports = new ValueUpdatePorts(onError);
    const broken = new TestPort();
    const error = new Error("closed before acknowledgement");
    ports.connect(senderOf(broken));
    broken.sendMessage = () => {
      throw error;
    };
    const disconnect = vi.spyOn(broken, "disconnect");

    broken.receive({ action: "runtime/subscribeValueUpdates", data: ["a"] });
    ports.push("a", update);

    expect(disconnect).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledExactlyOnceWith({ kind: "subscribe" }, error);
  });
});
