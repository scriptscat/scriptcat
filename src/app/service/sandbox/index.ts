import { Server } from "@Packages/message/server";
import { type WindowMessage } from "@Packages/message/window_message";
import { getExtensionEnv, preparationSandbox, reportSandboxChannelHealth } from "../offscreen/client";
import { withTimeout } from "@App/pkg/utils/with_timeout";
import { Runtime } from "./runtime";

// 通道自检的超时时间：只影响自检结果的上报，不阻塞 sandbox 自身的初始化或就绪通知
const SANDBOX_CHANNEL_CHECK_TIMEOUT_MS = 5000;

// sandbox环境的管理器
export class SandboxManager {
  api: Server;

  constructor(private windowMessage: WindowMessage) {
    this.api = new Server("sandbox", this.windowMessage);
  }

  initManager() {
    const extensionEnvAsync = getExtensionEnv(this.windowMessage);
    const runtime = new Runtime(this.windowMessage, this.api, extensionEnvAsync);
    runtime.init();
    // 通知初始化好环境了：由 sandbox 自己主动上报，因为只有 sandbox 自己知道它何时就绪，
    // 父层(offscreen 文档 / Firefox event page)不应该、也没办法去猜测或轮询这一点。
    preparationSandbox(this.windowMessage);
    // 非阻塞地对刚发起的 getExtensionEnv 请求做一次连通性自检并上报结果——不额外发起新的往返
    // 请求，只是给这次已经在途的请求包一层超时观察；结果交由父层记录/打印，因为 sandbox 自身
    // 的控制台通常不便查看。
    this.reportChannelHealth(extensionEnvAsync);
  }

  private reportChannelHealth(extensionEnvAsync: Promise<unknown>) {
    const start = Date.now();
    withTimeout(
      extensionEnvAsync,
      SANDBOX_CHANNEL_CHECK_TIMEOUT_MS,
      () => new Error(`getExtensionEnv timed out after ${SANDBOX_CHANNEL_CHECK_TIMEOUT_MS}ms`)
    )
      .then(() => reportSandboxChannelHealth(this.windowMessage, { ok: true, roundTripMs: Date.now() - start }))
      .catch((e) =>
        reportSandboxChannelHealth(this.windowMessage, {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        })
      )
      .catch(() => {
        // 若连上报本身都发不出去(通道确实不通)，父层的兜底超时会接手，这里不需要再做什么
      });
  }
}
