import { v4 as uuidv4 } from "uuid";
import { Handler, Stream, Target } from "./connect";

// 扩展内部页用连接,除background页使用,使用runtime.connect连接到background
export default class ConnectInternal {
  static instance: ConnectInternal;

  static getInstance() {
    return ConnectInternal.instance;
  }

  port: chrome.runtime.Port;

  handler: Map<string, Handler>;

  stream: Map<string, Stream> = new Map();

  constructor(tag: string) {
    this.port = chrome.runtime.connect({
      name: tag,
    });
    this.handler = new Map();
    this.port.onMessage.addListener((message) => {
      if (message.stream) {
        const stream = this.stream.get(message.stream);
        if (stream) {
          stream.handler(message.data);
          this.stream.delete(message.stream);
        }
      }
    });
    if (!ConnectInternal.instance) {
      ConnectInternal.instance = this;
    }
  }

  public send(action: string, data: any) {
    this.port.postMessage({
      action,
      data,
    });
  }

  // 发送单次流消息,只能接收到返回,不能再发送
  public sendSingleStream(
    action: string,
    data: any,
    // eslint-disable-next-line no-shadow, no-unused-vars
    resp: (data: any) => void
  ) {
    const stream = uuidv4();
    this.stream.set(stream, new Stream(resp));
    this.port.postMessage({
      action,
      data,
      stream,
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
