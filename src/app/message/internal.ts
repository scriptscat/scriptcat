import { v4 as uuidv4 } from "uuid";
import { Connect, Handler, Message, Target, TargetTag } from "./message";

// 扩展内部页用连接,除background页使用,使用runtime.connect连接到background
export default class MessageInternal implements Message {
  static instance: MessageInternal;

  static getInstance() {
    return MessageInternal.instance;
  }

  port: chrome.runtime.Port;

  handler: Map<string, Handler>;

  connectMap: Map<string, Connect> = new Map();

  constructor(tag: TargetTag) {
    this.port = chrome.runtime.connect({
      name: tag,
    });
    this.handler = new Map();
    this.port.onMessage.addListener((message) => {
      if (message.stream) {
        const stream = this.connectMap.get(message.stream);
        if (stream) {
          if (message.error) {
            stream.catch(message.error);
          } else {
            stream.handler(message.data);
          }
          if (!message.connect) {
            this.connectMap.delete(message.stream);
          }
        }
        return;
      }
      const handler = this.handler.get(message.action);
      if (handler) {
        handler(message.action, message.data);
      }
    });
    if (!MessageInternal.instance) {
      MessageInternal.instance = this;
    }
  }

  connect(): Connect {
    const stream = uuidv4();
    const connect = new Connect(this, stream);
    this.connectMap.set(stream, connect);
    return connect;
  }

  disconnect(connect: Connect): void {
    this.connectMap.delete(connect.flag);
  }

  nativeSend(data: any): void {
    this.port.postMessage(data);
  }

  public send(action: string, data: any) {
    this.port.postMessage({
      action,
      data,
    });
  }

  // 发送有返回的消息
  public syncSend(action: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const stream = uuidv4();
      this.connectMap.set(
        stream,
        new Connect(
          (resp) => {
            resolve(resp);
          },
          (err) => {
            reject(err);
          }
        )
      );
      this.port.postMessage({
        action,
        data,
        stream,
      });
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
    this.handler.set(tag, handler);
  }
}
