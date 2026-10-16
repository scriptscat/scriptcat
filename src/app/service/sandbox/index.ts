import { Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { getExtensionEnv } from "../offscreen/client";
import { Runtime } from "./runtime";

// sandbox环境的管理器
export class SandboxManager {
  api: Server;

  constructor(private message: Message) {
    this.api = new Server("sandbox", this.message);
  }

  initManager() {
    // MessagePort 会在 parent 接收 transfer 后开始交付；在此之前发出的请求由 channel 自身排队，
    // 因此可以先完成 Runtime wiring，再由 sandbox.ts transfer port 作为唯一 readiness 信号。
    const extensionEnvAsync = getExtensionEnv(this.message);
    const runtime = new Runtime(this.message, this.api, extensionEnvAsync);
    runtime.init();
  }
}
