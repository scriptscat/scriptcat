/* eslint-disable max-classes-per-file */
import LoggerCore from "../logger/core";
import Logger from "../logger/logger";
import {
  Connect,
  Handler,
  HandlerWithConnect,
  NativeMessage,
  Target,
} from "./message";

class PortMessage implements NativeMessage {
  port: chrome.runtime.Port;

  constructor(port: chrome.runtime.Port) {
    this.port = port;
  }

  nativeSend(data: any): void {
    this.port.postMessage(data);
  }

  // eslint-disable-next-line class-methods-use-this
  disconnect(): void {
    throw new Error("Method not implemented.");
  }
}

class WindowMessage implements NativeMessage {
  window: Window;

  constructor(window: Window) {
    this.window = window;
  }

  nativeSend(data: any): void {
    this.window.postMessage(data, "*");
  }

  // eslint-disable-next-line class-methods-use-this
  disconnect(): void {
    throw new Error("Method not implemented.");
  }
}

// 连接中心,只有background才能使用,其他环境通过runtime.connect连接到background
// sandbox的连接也聚合在了一起
export default class MessageCenter {
  static instance: MessageCenter;

  sandbox: Window;

  logger: Logger;

  static getInstance() {
    return MessageCenter.instance;
  }

  constructor() {
    // eslint-disable-next-line no-undef
    this.sandbox = sandbox;
    this.logger = LoggerCore.getInstance().logger({
      component: "messageCenter",
    });
    if (!MessageCenter.instance) {
      MessageCenter.instance = this;
    }
  }

  connectMap: Map<string, Map<number, chrome.runtime.Port>> = new Map();

  streamMap: Map<string, string> = new Map();

  handlerMap: Map<string, Handler> = new Map();

  connectHandlerMap: Map<string, HandlerWithConnect> = new Map();

  public start() {
    chrome.runtime.onConnect.addListener((port) => {
      let connectMap = this.connectMap.get(port.name);
      if (!connectMap) {
        connectMap = new Map();
        this.connectMap.set(port.name, connectMap);
      }
      const id = port.sender?.frameId ?? port.sender!.tab!.id!;
      connectMap.set(id, port);
      port.onDisconnect.addListener(() => {
        connectMap!.delete(id);
      });
      port.onMessage.addListener((message) => {
        if (message.broadcast === true) {
          // 广播
          const targets = message.target as Target[];
          targets.forEach((target: Target) => {
            this.send(target, message.action, message.data);
          });
        }
        // 长连接
        if (message.connect) {
          const handler = this.connectHandlerMap.get(message.action);
          if (handler) {
            handler(
              new Connect(new PortMessage(port), message.stream),
              message.action,
              message.data,
              port.sender
            );
          }
          return;
        }
        const handler = this.handlerMap.get(message.action);
        if (handler) {
          if (message.stream) {
            const ret = handler(message.action, message.data, port.sender);
            if (ret) {
              ret
                .then((data: any) => {
                  port.postMessage({
                    action: message.action,
                    data,
                    stream: message.stream,
                  });
                })
                .catch((err: Error) => {
                  port.postMessage({
                    action: message.action,
                    error: err.message,
                    stream: message.stream,
                  });
                });
            } else {
              this.logger.warn("handler return is null");
            }
          } else {
            handler(message.action, message.data, port.sender);
          }
        }
      });
    });
    // 监听沙盒消息
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.broadcast === true) {
        // 广播
        const targets = message.target as Target[];
        targets.forEach((target: Target) => {
          this.send(target, message.action, message.data);
        });
      }
      // 长连接
      if (message.connect) {
        const handler = this.connectHandlerMap.get(message.action);
        if (handler) {
          handler(
            new Connect(new WindowMessage(this.sandbox), message.stream),
            message.action,
            message.data
          );
        }
        return;
      }
      const handler = this.handlerMap.get(message.action);
      if (handler) {
        if (message.stream) {
          const ret = handler(message.action, message.data);
          if (ret) {
            ret
              .then((data: any) => {
                this.sandbox.postMessage(
                  {
                    action: message.action,
                    data,
                    stream: message.stream,
                  },
                  "*"
                );
              })
              .catch((err: Error) => {
                this.sandbox.postMessage(
                  {
                    action: message.action,
                    error: err.message,
                    stream: message.stream,
                  },
                  "*"
                );
              });
          } else {
            this.logger.warn("handler return is null");
          }
        } else {
          handler(message.action, message.data);
        }
      }
    });
  }

  public setHandler(action: string, handler: Handler) {
    this.handlerMap.set(action, handler);
  }

  // 长连接的处理
  setHandlerWithConnect(action: string, handler: HandlerWithConnect) {
    this.connectHandlerMap.set(action, handler);
  }

  // 根据目标发送
  public send(target: Target, action: string, data: any) {
    const connectMap = this.connectMap.get(target.tag);
    if (!connectMap) {
      return;
    }
    if (target.id) {
      // 指定id
      target.id.forEach((id) => {
        connectMap.get(id)?.postMessage({
          action,
          data,
        });
      });
    } else if (target.tag === "sandbox") {
      this.sandbox.postMessage(
        {
          action,
          data,
        },
        "*"
      );
    } else {
      // 同tag广播
      connectMap.forEach((port) => {
        port.postMessage({
          action,
          data,
        });
      });
    }
  }
}
