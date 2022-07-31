import { Handler, Target } from "./connect";

// 扩展内部页用连接,除background页使用,使用runtime.connect连接到background
export default class ConnectInternal {
  port: chrome.runtime.Port;

  handler: Map<string, Handler>;

  constructor(tag: string) {
    this.port = chrome.runtime.connect({
      name: tag,
    });
    this.handler = new Map();
  }

  public send(action: string, data: any) {
    this.port.postMessage({
      action,
      data,
    });
  }

  // 广播
  public broadcast(target: Target, action: string, data: any) {
    this.port.postMessage({
      action,
      data,
      broadcast: true,
    });
  }

  public setHandler(tag: string, handler: Handler) {
    this.handler.set(handler.name, handler);
  }
}
