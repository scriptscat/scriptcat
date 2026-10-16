/**
 * Node tests do not always expose the browser global. Rspack replaces this
 * `node:` import with `node-worker-threads-browser.ts` for browser bundles, so
 * the Node core module is never loaded by the extension at runtime.
 */
import { MessageChannel as NodeMessageChannel } from "node:worker_threads";

// 把 message channel 相關的都放在這裡處理
// 安全考慮和複雜度平衡：這裡做一個 NativeMessageChannel 但不做 NativeMessagePort
// 基於安全度考慮程度跟 Native 有不一致，故不放在 Native

/** Use the browser global when available and fall back to Node's implementation in Node environments. */
const nativeMessageChannel = typeof MessageChannel === "undefined" ? NodeMessageChannel : MessageChannel;

// Keep the constructor itself unchanged: reading browser MessageChannel.prototype.port1/port2
// invokes instance-only accessors and throws Illegal invocation during content/inject startup.
export const NativeMessageChannel = nativeMessageChannel;

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
