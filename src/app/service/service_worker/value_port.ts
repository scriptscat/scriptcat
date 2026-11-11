import type { IGetSender } from "@Packages/message/server";
import type { MessageConnect } from "@Packages/message/types";
import type { ValueSnapshot, ValueUpdateDataEncoded, ValueVersion } from "../content/types";

// 每个 Port 对应一个 frame，索引只保存该 frame 实际运行的 storageName。
export default class ValueUpdatePorts {
  private readonly byStorageName = new Map<string, Set<MessageConnect>>();
  private readonly byPort = new Map<MessageConnect, Set<string>>();

  constructor(
    private readonly onSendError: (
      context: { kind: "subscribe" } | { kind: "push"; storageName: string },
      error: unknown
    ) => void,
    private readonly readSnapshot?: (storageName: string) => Promise<ValueSnapshot>
  ) {}

  connect(sender: IGetSender) {
    const port = sender.getConnect();
    if (!port) throw new Error("valueUpdates requires a Port connection");
    this.byPort.set(port, new Set());
    port.onMessage((message) => {
      if (message.action !== "runtime/subscribeValueUpdates") return;
      const request = message.data as
        | string[]
        | { names: string[]; versions?: Record<string, ValueVersion> };
      const names = Array.isArray(request) ? request : request?.names;
      if (!Array.isArray(names)) return;
      const versions = Array.isArray(request) ? undefined : request.versions;
      const storageNames = new Set<string>(names.filter((name): name is string => typeof name === "string"));
      this.removeSubscriptions(port);
      this.byPort.set(port, storageNames);
      for (const name of storageNames) {
        let ports = this.byStorageName.get(name);
        if (!ports) this.byStorageName.set(name, (ports = new Set()));
        ports.add(port);
      }
      if (!this.readSnapshot || !versions) {
        try {
          port.sendMessage({ action: "runtime/valueSubscriptionsReady" });
        } catch (error) {
          this.removeSubscriptions(port);
          this.onSendError({ kind: "subscribe" }, error);
          port.disconnect(true);
        }
        return;
      }
      // Register first, then read. Concurrent pushes cannot be lost; older snapshots
      // are discarded by the receiver's version checks.
      void Promise.all(
        [...storageNames].map(async (name) => {
          if (!this.readSnapshot || !versions) return undefined;
          const snapshot = await this.readSnapshot(name);
          const known = versions[name];
          return known?.revision === snapshot.revision && known.epoch === snapshot.epoch ? undefined : snapshot;
        })
      )
        .then((snapshots) => {
          if (!this.byPort.has(port)) return;
          port.sendMessage({
            action: "runtime/valueSubscriptionsReady",
            data: { snapshots: snapshots.filter((snapshot): snapshot is ValueSnapshot => !!snapshot) },
          });
        })
        .catch((error: unknown) => {
          this.removeSubscriptions(port);
          this.onSendError({ kind: "subscribe" }, error);
          try {
            port.disconnect(true);
          } catch {
            // Port may already have been torn down by the browser.
          }
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
