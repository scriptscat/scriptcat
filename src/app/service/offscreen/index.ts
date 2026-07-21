import { Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { WindowMessage } from "@Packages/message/window_message";
import { ServiceWorkerClient } from "../service_worker/client";
import { BackgroundEnvManagerBase } from "./base";

// offscreen环境的管理器
export class OffscreenManager extends BackgroundEnvManagerBase {
  constructor(extMsgSender: MessageSend) {
    // `sandbox` 是 offscreen.html 中具名 iframe 的全局绑定(见 src/types/main.d.ts)。
    // 传入函数而非直接传值，与 Firefox 的 EventPageOffscreenManager 保持一致，
    // 避免早于导航完成时缓存的 WindowProxy 引用带来的潜在身份不一致问题。
    // `sandbox` 的类型声明断言为非 null，但这只是编译期断言，运行时仍需校验。
    const windowMessage = new WindowMessage(
      window,
      () => {
        if (!sandbox) {
          throw new Error("OffscreenManager: named sandbox iframe is not available.");
        }
        return sandbox;
      },
      true
    );
    const windowServer = new Server("offscreen", windowMessage);
    const serviceWorker = new ServiceWorkerClient(extMsgSender);
    super(extMsgSender, windowMessage, windowServer, serviceWorker);
  }
}
