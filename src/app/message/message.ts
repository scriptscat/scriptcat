export type Handler = (action: string, data: any) => void | Promise<any>;

export type HandlerWithConnect = (
  connect: Connect,
  action: string,
  data: any
) => void | Promise<any>;

export type Target = { tag: string; id?: number[] };

export type ConnectHandler = (data: any) => void;

export type ConnectCatch = (err: string) => void;

export interface NativeMessage {
  // 发送原生消息
  nativeSend(data: any): void;
  disconnect(connect: Connect): void;
}

export interface Message extends NativeMessage {
  send(action: string, data: any): void;
  // 发送有返回的异步消息
  syncSend(action: string, data: any): Promise<any>;
  // 长连接
  connect(): Connect;
  // 释放长连接资源,通过connect.flag去释放
  disconnect(connect: Connect): void;
  setHandler(action: string, handler: Handler): void;
}

export class Connect {
  message!: NativeMessage;

  flag!: string;

  handler!: ConnectHandler;

  catch!: ConnectCatch;

  constructor(
    handler: ConnectHandler | NativeMessage,
    catchError: ConnectCatch | string
  ) {
    if (typeof handler === "function") {
      this.handler = handler;
      this.catch = <ConnectCatch>catchError!;
    } else {
      this.message = handler;
      this.flag = <string>catchError;
    }
  }

  public send(action: string, data: any) {
    // 使用原生方法发送消息
    this.message.nativeSend({
      action,
      data,
      stream: this.flag,
      connect: true,
    });
  }

  public disconnect() {
    this.message.disconnect(this);
  }
}
