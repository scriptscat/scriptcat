import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Server, Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptClient } from "../service_worker/client";
import { v5 as uuidv5 } from "uuid";

/* ---------- Types ---------- */
export type VSCodeConnectParam = { url: string; reconnect: boolean };

/** Actions received from VSCode WebSocket */
enum VSCodeAction {
  Hello = "hello",
  OnChange = "onchange",
}

/* ---------- Main Class ---------- */
// 在offscreen下与scriptcat-vscode建立websocket连接
// 需要在vscode中安装scriptcat-vscode插件
export class VSCodeConnect {
  private readonly logger: Logger = LoggerCore.logger().with({ service: "VSCodeConnect" });

  private ws: WebSocket | undefined;

  private timerId: number | NodeJS.Timeout | undefined;

  private readonly scriptClient: ScriptClient;

  private readonly vscodeConnectGroup: Group;

  constructor(windowServer: Server, msgSender: MessageSend) {
    this.vscodeConnectGroup = windowServer.group("vscodeConnect");
    this.scriptClient = new ScriptClient(msgSender);
  }

  init() {
    this.vscodeConnectGroup.on("connect", (param: VSCodeConnectParam) => this.connect(param));
  }

  /* ---------- Public API ---------- */
  /** 启动（或重新启动）与 VSCode 的连接 */
  public connect({ url, reconnect }: VSCodeConnectParam): Promise<void> {
    const doReconnect = () => {
      // 如果已经连接，断开重连
      this.closeExisting();
      this.clearTimer();
      this.timerId = setTimeout(connectVSCode, 100);
    };
    const connectVSCode: () => Promise<void> = () => {
      if (this.ws) return Promise.resolve(); // 已连接则忽略
      return new Promise<void>((resolve, reject) => {
        let ws;
        try {
          ws = new WebSocket(url);
        } catch (e: any) {
          this.logger.debug("connect vscode faild", Logger.E(e));
          reject(e);
          return;
        }
        let connectOK = false;
        ws.addEventListener("open", () => {
          ws.send('{"action":"hello"}');
          connectOK = true;
          // 如重复连接，则清除之前的
          if (this.ws) {
            this.closeExisting();
          }
          this.ws = ws;
          resolve();
          this.clearTimer();
        });
        ws.addEventListener("message", (ev) => {
          this.handleMessage(ev).catch((err) => {
            this.logger.error("message handler error", Logger.E(err));
          });
        });

        ws.addEventListener("error", (e) => {
          this.ws = undefined;
          this.logger.debug("connect vscode faild", Logger.E(e));
          if (!connectOK) {
            reject(new Error("connect fail"));
          }
          if (reconnect) doReconnect();
        });

        ws.addEventListener("close", () => {
          this.ws = undefined;
          this.logger.debug("vscode connection closed");
          if (reconnect) doReconnect();
        });
        // 如 open, close, error 都不发生，30 秒后reject
        this.clearTimer();
        this.timerId = setTimeout(() => {
          if (!connectOK) {
            reject(new Error("Timeout"));
            try {
              ws.close();
            } catch (e) {
              console.error(e);
            }
            if (reconnect) doReconnect();
          }
        }, 30_000);
      });
    };
    // 如果已经连接，断开重连
    this.closeExisting();
    // 清理老的定时器
    this.clearTimer();
    return Promise.resolve().then(() => connectVSCode());
  }

  /* ---------- Message Handling ---------- */
  private async handleMessage(ev: MessageEvent): Promise<void> {
    let data: any;
    try {
      data = JSON.parse(ev.data as string);
    } catch {
      return; // ignore malformed JSON
    }
    switch (data.action as VSCodeAction) {
      case VSCodeAction.OnChange: {
        // 调用安装脚本接口
        const { script, uri } = data.data;
        const id = uuidv5(uri, uuidv5.URL);
        await this.scriptClient.installByCode(id, script, "vscode");
        break;
      }
      default:
      // ignore unknown actions
    }
  }

  /* ---------- Helpers ---------- */
  private closeExisting(): void {
    try {
      this.ws?.close();
    } catch (e: any) {
      console.error(e);
    }
    this.ws = undefined;
  }
  private clearTimer(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }
}
