import { Handler, Target } from "./connect";

// 连接中心,只有background才能使用,其他环境通过runtime.connect连接到background
export default class ConnectCenter {
  static instance = new ConnectCenter();

  static getInstance() {
    return ConnectCenter.instance;
  }

  connectMap: Map<string, Map<number, chrome.runtime.Port>> = new Map();

  streamMap: Map<string, string> = new Map();

  handler: Map<string, Handler> = new Map();

  public listen() {
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
                .catch(() => {});
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
