import type { IGetSender } from "@Packages/message/server";
import type { MessageConnect } from "@Packages/message/types";
import type { ValueSubscription, ValueSubscriptionAck, ValueUpdateDataEncoded } from "../content/types";

// 在该 storageName 的写锁内调用 register 登记订阅，并返回当前版本（版本不一致时附快照）
export type ResolveValueSubscription = (sub: ValueSubscription, register: () => void) => Promise<ValueSubscriptionAck>;

const isSubscription = (item: unknown): item is ValueSubscription => {
  const sub = item as ValueSubscription;
  return (
    !!sub &&
    typeof sub.storageName === "string" &&
    typeof sub.revision === "number" &&
    Array.isArray(sub.uuids) &&
    sub.uuids.every((uuid) => typeof uuid === "string")
  );
};

// 每个 Port 对应一个 frame，索引只保存该 frame 实际运行的 storageName。
export default class ValueUpdatePorts {
  private readonly byStorageName = new Map<string, Set<MessageConnect>>();
  private readonly byPort = new Map<MessageConnect, Set<string>>();

  constructor(
    private readonly onSendError: (
      context: { kind: "subscribe" } | { kind: "push"; storageName: string },
      error: unknown
    ) => void,
    private readonly resolveSubscription: ResolveValueSubscription
  ) {}

  connect(sender: IGetSender) {
    const port = sender.getConnect();
    if (!port) throw new Error("valueUpdates requires a Port connection");
    this.byPort.set(port, new Set());
    port.onMessage((message) => {
      if (message.action !== "runtime/subscribeValueUpdates" || !Array.isArray(message.data)) return;
      const subs = new Map<string, ValueSubscription>();
      for (const item of message.data) if (isSubscription(item)) subs.set(item.storageName, item);
      this.removeSubscriptions(port);
      this.byPort.set(port, new Set());
      Promise.all([...subs.values()].map((sub) => this.resolveSubscription(sub, () => this.addSubscription(port, sub))))
        .then((acks) => {
          // 取快照期间 Port 已断开
          if (!this.byPort.has(port)) return;
          port.sendMessage({ action: "runtime/valueSubscriptionsReady", data: acks });
        })
        .catch((error) => {
          if (!this.byPort.has(port)) return;
          this.removeSubscriptions(port);
          this.onSendError({ kind: "subscribe" }, error);
          port.disconnect(true);
        });
    });
    port.onDisconnect(() => this.removeSubscriptions(port));
    return { ready: true };
  }

  push(storageName: string, data: ValueUpdateDataEncoded) {
    const ports = this.byStorageName.get(storageName);
    if (!ports) return;
    for (const port of ports) {
      try {
        port.sendMessage({ action: "runtime/valueUpdate", data });
      } catch (error) {
        // Port 关闭可能先于 onDisconnect 事件；一次失败不影响其他 frame。
        this.removeSubscriptions(port);
        // 连接仍可能存活（如 postMessage 序列化失败），必须通知 frame 重连。
        try {
          port.disconnect(true);
        } catch {
          // 清理索引已完成；断开失败也不能阻碍其他 frame。
        }
        this.onSendError({ kind: "push", storageName }, error);
      }
    }
  }

  private addSubscription(port: MessageConnect, sub: ValueSubscription) {
    const names = this.byPort.get(port);
    if (!names) return;
    names.add(sub.storageName);
    let ports = this.byStorageName.get(sub.storageName);
    if (!ports) this.byStorageName.set(sub.storageName, (ports = new Set()));
    ports.add(port);
  }

  private removeSubscriptions(port: MessageConnect) {
    const names = this.byPort.get(port);
    if (!names) return;
    this.byPort.delete(port);
    for (const name of names) {
      const ports = this.byStorageName.get(name);
      ports?.delete(port);
      if (ports?.size === 0) this.byStorageName.delete(name);
    }
  }
}
