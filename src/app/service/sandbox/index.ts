import { Server } from "@Packages/message/server";
import { WindowMessage } from "@Packages/message/window_message";
import { preparationSandbox } from "../offscreen/client";
import { Runtime } from "./runtime";

// sandbox环境的管理器
export class SandboxManager {
  api: Server = new Server("sandbox", this.windowMessage);

  constructor(private windowMessage: WindowMessage) {}

  initManager() {
    const runtime = new Runtime(this.windowMessage, this.api);
    runtime.init();
    // 通知初始化好环境了
    preparationSandbox(this.windowMessage);
  }
}
