import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptClient } from "../service_worker/client";
import { v5 as uuidv5 } from "uuid";

/* ---------- 类型定义 ---------- */
export type VSCodeConnectParam = { url: string; reconnect: boolean }; // 连接参数：WebSocket地址和是否自动重连

/** 从VSCode WebSocket接收的动作类型 */
enum VSCodeAction {
  Hello = "hello", // VSCode问候消息
  OnChange = "onchange", // 文件变更通知
}

class WebSocketExtended extends WebSocket {
  _handlers: Record<string, (...args: any) => void> = {};
  _isConnected: boolean = false;
  addEventListeners() {
    for (const [eventName, handler] of Object.entries(this._handlers)) {
      this.addEventListener(eventName, handler);
    }
  }
  removeEventListeners() {
    for (const [eventName, handler] of Object.entries(this._handlers)) {
      this.removeEventListener(eventName, handler);
    }
  }
}

/* ---------- 主类 ---------- */
// 在offscreen文档中与scriptcat-vscode插件建立WebSocket连接
// 前提：VSCode需安装scriptcat-vscode扩展
export class VSCodeConnect {
  private readonly logger: Logger = LoggerCore.logger().with({ service: "VSCodeConnect" });

  private ws: WebSocketExtended | undefined; // 当前WebSocket实例

  private timerId: ReturnType<typeof setTimeout> | undefined; // 连接超时定时器

  private readonly scriptClient: ScriptClient; // 用于安装脚本的客户端

  private readonly vscodeConnectGroup: Group; // 消息分组，用于接收连接指令

  private mParam: VSCodeConnectParam | undefined;

  constructor(vscodeConnectGroup: Group, msgSender: MessageSend) {
    this.vscodeConnectGroup = vscodeConnectGroup;
    this.scriptClient = new ScriptClient(msgSender);
  }

  /** 初始化消息监听 */
  init() {
    this.vscodeConnectGroup.on("connect", (param: VSCodeConnectParam) => this.connect(param));
  }
  doReconnect(): void {
    this.clearTimer();
    this.closeExisting(); // 如果已经连接，先关闭已有连接
    // 旧连接已清除
    this.timerId = setTimeout(() => this.connectVSCode(), 100); // 稍后重试
  }

  connectVSCode(): Promise<void> {
    const { url, reconnect } = this.mParam!; // 在初次连接 / 重连接时，取最后 mParam 的值。
    return new Promise<void>((resolve, reject) => {
      if (this.ws) {
        this.logger.debug("unexpected error: vscode was connected.");
        reject("vscode was connected");
        return;
      }
      try {
        this.ws = new WebSocketExtended(url);
      } catch (e: any) {
        this.logger.debug("connect vscode failed", Logger.E(e)); // 连接VSCode失败
        reject(e);
        return;
      }
      this.ws._handlers = {
        open: () => {
          if (this.ws) {
            this.clearTimer(); // 已触发 open, 清除30秒超时器
            this.ws.send('{"action":"hello"}'); // 发送问候
            this.ws._isConnected = true;
            resolve();
          }
        },
        message: (ev: MessageEvent) => {
          if (this.ws) {
            this.handleMessage(ev).catch((err) => {
              this.logger.error("message handler error", Logger.E(err)); // 处理消息出错
            });
          }
        },
        error: (e: Event) => {
          if (this.ws) {
            const connectOK = this.ws._isConnected; // 已触发 open
            this.clearTimer(); // 已触发 error, 清除30秒超时器
            this.ws.removeEventListeners();
            this.ws = undefined; // error / close / timeout 时清除 this.ws
            this.logger.debug("connect vscode failed", Logger.E(e)); // 连接错误
            if (!connectOK) {
              // 未触发 open
              reject(new Error("connect fail before open"));
            }
            if (reconnect) this.doReconnect();
          }
        },
        close: () => {
          if (this.ws) {
            const connectOK = this.ws._isConnected; // 已触发 open
            this.clearTimer(); // 已触发 close, 清除30秒超时器
            this.ws.removeEventListeners();
            this.ws = undefined; // error / close / timeout 时清除 this.ws
            this.logger.debug("vscode connection closed"); // VSCode连接已关闭
            if (!connectOK) {
              // 未触发 open
              reject(new Error("connect closed before open"));
            }
            if (reconnect) this.doReconnect();
          }
        },
      };
      this.ws.addEventListeners();

      // 30秒超时处理: 如 open, close, error 都不发生，30 秒后reject
      this.clearTimer();
      this.timerId = setTimeout(() => {
        if (!this.ws) {
          this.logger.debug("unexpected error: vscode connection is undefined.");
          return;
        }
        if (this.ws?._isConnected) {
          this.logger.debug("unexpected error: vscode was connected.");
          return;
        }
        this.ws.removeEventListeners(); // 浏览器触发的 close 动作不需要消息处理
        try {
          this.ws.close();
        } catch (e) {
          console.error(e);
        }
        this.ws = undefined; // error / close / timeout 时清除 this.ws
        this.logger.debug("vscode connection timeout"); // VSCode连接Timeout
        reject(new Error("Timeout"));
        if (reconnect) this.doReconnect();
      }, 30_000);
    });
  }

  /* ---------- 公共方法 ---------- */
  /** 连接（或重连）到VSCode的WebSocket服务 */
  public connect({ url, reconnect }: VSCodeConnectParam): Promise<void> {
    this.mParam = { url, reconnect };
    this.clearTimer(); // 清理老的定时器
    this.closeExisting(); // 如果已经连接，连接前先关闭旧连接
    // 旧连接已清除
    return this.connectVSCode();
  }

  /* ---------- 消息处理 ---------- */
  /** 处理从VSCode收到的消息 */
  private async handleMessage(ev: MessageEvent): Promise<void> {
    let data: any;
    const evData = ev.data;
    if (typeof evData !== "string") return;
    try {
      data = JSON.parse(evData);
    } catch {
      return; // 忽略格式错误的JSON
    }
    switch (data.action as VSCodeAction) {
      case VSCodeAction.OnChange: {
        // 当VSCode通知脚本文件变更时，自动安装/更新脚本
        const { script, uri } = data.data;
        const id = uuidv5(uri, uuidv5.URL); // 用uri生成稳定脚本ID
        await this.scriptClient.installByCode(id, script, "vscode");
        break;
      }
      default:
      // 忽略未知动作
    }
  }

  /* ---------- 辅助方法 ---------- */
  /** 关闭已有WebSocket连接 */
  private closeExisting(): void {
    this.ws?.removeEventListeners(); // 浏览器触发的 close 动作不需要消息处理
    try {
      this.ws?.close();
    } catch (e: any) {
      console.error(e);
    }
    this.ws = undefined;
  }
  /** 清除超时定时器 */
  private clearTimer(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }
}
