import { Handler } from "./connect";

// 用于扩展页与沙盒页通讯,使用postMessage
export default class ConnectSandbox {
  window: Window;

  handler: Map<string, Handler>;

  constructor(_window: Window) {
    this.window = _window;
    this.handler = new Map();
    window.addEventListener("message", (message) => {
      const handler = this.handler.get(message.data.action);
      if (handler) {
        handler(message.data.action, message.data.data);
      }
    });
  }

  public send(action: string, data: any) {
    this.window.postMessage({
      action,
      data,
    });
  }

  public setHandler(action: string, handler: Handler) {
    this.handler.set(action, handler);
  }
}
