import { Handler, Target } from "./connect";
import ConnectSandbox from "./sandbox";

// 连接中心,只有background才能使用,其他环境通过runtime.connect连接到background
// 将sandbox的连接也聚合在了一起
export default class ConnectCenter {
  static instance: ConnectCenter;

  static getInstance() {
    return ConnectCenter.instance;
  }

  sandbox: ConnectSandbox;

  constructor(sandbox: ConnectSandbox) {
    this.sandbox = sandbox;
    if (!ConnectCenter.instance) {
      ConnectCenter.instance = this;
    }
  }

  connectMap: Map<string, Map<number, chrome.runtime.Port>> = new Map();

  streamMap: Map<string, string> = new Map();

  handler: Map<string, Handler> = new Map();

  public start() {
    chrome.runtime.onConnect.addListener((port) => {
      let connectMap = this.connectMap.get(port.name);
      if (!connectMap) {
        connectMap = new Map();
      }
      connectMap.set(port.sender!.tab!.id!, port);
      port.onMessage.addListener((message) => {
        if (message.broadcast === true) {
          // 广播
          const targets = message.target as Target[];
          targets.forEach((target: Target) => {
            this.send(target, message.action, message.data);
          });
        }
        const handler = this.handler.get(message.action);
        if (handler) {
          if (message.stream) {
            const ret = handler(message.action, message.data);
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
            }
          } else {
            handler(message.action, message.data);
          }
        }
      });
    });
  }

  public setHandler(tag: string, handler: Handler) {
    this.handler.set(tag, handler);
    this.sandbox.setHandler(tag, handler);
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
