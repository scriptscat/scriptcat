import { Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { SandboxChannelHost } from "@Packages/message/sandbox_message_channel";
import { ServiceWorkerClient } from "../service_worker/client";
import { BackgroundEnvManagerBase } from "./base";

// offscreen环境的管理器
export class OffscreenManager extends BackgroundEnvManagerBase {
  private readonly sandboxFrame: HTMLIFrameElement;
  private sandboxAttached = false;

  constructor(extMsgSender: Message) {
    // Chromium 也改为动态创建 iframe：先安装一次性 bootstrap listener，再挂载 sandbox，
    // 避免静态 iframe 提前启动导致 transferred MessagePort 在 parent listener 建立前丢失。
    const sandboxFrame = document.createElement("iframe");
    sandboxFrame.src = chrome.runtime.getURL("/src/sandbox.html");
    sandboxFrame.name = "sandbox";
    sandboxFrame.style.display = "none";

    const sandboxChannel = new SandboxChannelHost(window, () => {
      const win = sandboxFrame.contentWindow;
      if (!win) {
        throw new Error("OffscreenManager: sandbox iframe has no contentWindow (removed from DOM?).");
      }
      return win;
    });

    // SW↔Offscreen 仍使用 ServiceWorkerClientMessage；Offscreen↔Sandbox 改走 private MessagePort。
    const offscreenServer = new Server("offscreen", [extMsgSender, sandboxChannel]);
    const serviceWorker = new ServiceWorkerClient(extMsgSender);
    super(extMsgSender, sandboxChannel, offscreenServer, serviceWorker);
    this.sandboxFrame = sandboxFrame;
  }

  override initManager() {
    const initialized = super.initManager();
    if (!this.sandboxAttached) {
      this.sandboxAttached = true;
      document.documentElement.appendChild(this.sandboxFrame);
    }
    return initialized;
  }
}
