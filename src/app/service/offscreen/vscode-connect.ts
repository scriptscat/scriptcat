import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { type Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptClient } from "../service_worker/client";
import { v5 as uuidv5 } from "uuid";

// 在offscreen下与scriptcat-vscode建立websocket连接
// 需要在vscode中安装scriptcat-vscode插件
export class VSCodeConnect {
  logger: Logger = LoggerCore.logger().with({ service: "VSCodeConnect" });

  reconnect: boolean = false;

  wsConnect: WebSocket | undefined;

  connectVSCodeTimer: any;

  scriptClient: ScriptClient;

  constructor(
    private group: Group,
    private send: MessageSend
  ) {
    this.scriptClient = new ScriptClient(this.send);
  }

  connect({ url, reconnect }: { url: string; reconnect: boolean }) {
    // 如果已经连接，断开重连
    if (this.wsConnect) {
      this.wsConnect.close();
    }
    // 清理老的定时器
    if (this.connectVSCodeTimer) {
      clearInterval(this.connectVSCodeTimer);
      this.connectVSCodeTimer = undefined;
    }
    const handler = () => {
      if (!this.wsConnect) {
        return this.connectVSCode({ url });
      }
      return Promise.resolve();
    };
    if (reconnect) {
      this.connectVSCodeTimer = setInterval(() => {
        handler();
      }, 30 * 1000);
    }
    return handler();
  }

  // 连接到vscode
  connectVSCode({ url }: { url: string }) {
    return new Promise<void>((resolve, reject) => {
      // 如果已经连接，断开重连
      if (this.wsConnect) {
        this.wsConnect.close();
      }
      try {
        this.wsConnect = new WebSocket(url);
      } catch (e: any) {
        this.logger.debug("connect vscode faild", Logger.E(e));
        reject(e);
        return;
      }
      let ok = false;
      this.wsConnect.addEventListener("open", () => {
        this.wsConnect!.send('{"action":"hello"}');
        ok = true;
        resolve();
      });
      this.wsConnect.addEventListener("message", async (ev) => {
        const data = JSON.parse(ev.data);
        switch (data.action) {
          case "onchange": {
            // 调用安装脚本接口
            const code = data.data.script;
            this.scriptClient.installByCode(uuidv5(data.data.uri, uuidv5.URL), code, "vscode");
            break;
          }
          default:
        }
      });

      this.wsConnect.addEventListener("error", (e) => {
        this.wsConnect = undefined;
        this.logger.debug("connect vscode faild", Logger.E(e));
        if (!ok) {
          reject(new Error("connect fail"));
        }
      });

      this.wsConnect.addEventListener("close", () => {
        this.wsConnect = undefined;
        this.logger.debug("vscode connection closed");
      });
    });
  }

  init() {
    this.group.on("connect", this.connect.bind(this));
  }
}
