// 把 message channel 相關的都放在這裡處理
// 安全考慮和複雜度平衡：這裡做一個 NativeMessageChannel 但不做 NativeMessagePort
// 基於安全度考慮程度跟 Native 有不一致，故不放在 Native

const nativeMessageChannel = MessageChannel;
const nativeMessageChannelPort1 = MessageChannel.prototype.port1;
const nativeMessageChannelPort2 = MessageChannel.prototype.port2;

export const NativeMessageChannel = class extends nativeMessageChannel {
  public port1: MessagePort = null as unknown as MessagePort; // 假屬性，取代繼承的read-only
  public port2: MessagePort = null as unknown as MessagePort; // 假屬性，取代繼承的read-only
};
NativeMessageChannel.prototype.port1 = nativeMessageChannelPort1; // 重新把 port1 注入 prototype
NativeMessageChannel.prototype.port2 = nativeMessageChannelPort2; // 重新把 port2 注入 prototype
Object.freeze(NativeMessageChannel.prototype);

// ---- IDeferToNextTaskKernel ----

// 用途：取代 self.postMessage 避免 self.onmessage 的偵測
// 即時性考慮，不使用 setTimeout(..., 0)

export interface IDeferToNextTaskKernel {
  release(): void;
  nextMarcoTask(): Promise<void>;
}

export const createDeferToNextTaskKernel = (): IDeferToNextTaskKernel => {
  let deferredChannel: MessageChannel | undefined;
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
        deferredChannel = new NativeMessageChannel();
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
