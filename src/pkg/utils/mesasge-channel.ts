import { MessageChannel as NodeMessageChannel } from "node:worker_threads";

// 把 message channel 相關的都放在這裡處理
// 安全考慮和複雜度平衡：這裡做一個 NativeMessageChannel 但不做 NativeMessagePort
// 基於安全度考慮程度跟 Native 有不一致，故不放在 Native

const nativeMessageChannel = typeof MessageChannel === "undefined" ? NodeMessageChannel : MessageChannel;

export const NativeMessageChannel =
  typeof MessageChannel === "undefined"
    ? nativeMessageChannel
    : class extends nativeMessageChannel {
        declare public port1: MessagePort;
        declare public port2: MessagePort;
      };

if (NativeMessageChannel !== NodeMessageChannel) {
  const nativeMessageChannelPort1 = nativeMessageChannel.prototype.port1;
  const nativeMessageChannelPort2 = nativeMessageChannel.prototype.port2;
  const nativeMessageChannelPrototype = NativeMessageChannel.prototype as unknown as {
    port1: MessagePort;
    port2: MessagePort;
  };
  nativeMessageChannelPrototype.port1 = nativeMessageChannelPort1 as MessagePort; // 重新把 port1 注入 prototype
  nativeMessageChannelPrototype.port2 = nativeMessageChannelPort2 as MessagePort; // 重新把 port2 注入 prototype
  Object.freeze(NativeMessageChannel.prototype);
}

// ---- IDeferToNextTaskKernel ----

// 用途：取代 self.postMessage 避免 self.onmessage 的偵測
// 即時性考慮，不使用 setTimeout(..., 0)

export interface IDeferToNextTaskKernel {
  release(): void;
  nextMarcoTask(): Promise<void>;
}

interface MessagePortLike {
  close(): void;
  postMessage(message: null): void;
  onmessage: (() => void) | null;
}

interface MessageChannelLike {
  port1: MessagePortLike;
  port2: MessagePortLike;
}

export const createDeferToNextTaskKernel = (): IDeferToNextTaskKernel => {
  let deferredChannel: MessageChannelLike | undefined;
  let deferredTask: Promise<void> | undefined;
  let resolveDeferredTask: (() => void) | undefined;
  return {
    release() {
      deferredChannel?.port1.close();
      deferredChannel?.port2.close();
      deferredChannel = undefined;
      deferredTask = undefined;
      resolveDeferredTask = undefined;
    },
    nextMarcoTask() {
      if (deferredTask) return deferredTask;
      if (!deferredChannel) {
        // init
        deferredChannel = new NativeMessageChannel() as unknown as MessageChannelLike;
        // onmessage 自動 start port
        deferredChannel.port1.onmessage = () => {
          const resolve = resolveDeferredTask;
          resolveDeferredTask = undefined;
          deferredTask = undefined;
          resolve?.();
        };
      }
      deferredTask = new Promise<void>((resolve) => {
        resolveDeferredTask = resolve;
        deferredChannel!.port2.postMessage(null); // 即時 resolve
      });
      return deferredTask;
    },
  } satisfies IDeferToNextTaskKernel;
};
