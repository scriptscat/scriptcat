import LoggerCore from "../logger/core";
import Logger from "../logger/logger";
import { ChannelManager } from "./message";

export type ChannelHandler = (data: any) => void;

export type DisChannelHandler = () => void;

export type ChannelCatch = (err: string) => void;

// 信道,作为长连接的载体
export class Channel {
  manager!: ChannelManager;

  flag!: string;

  handler!: ChannelHandler;

  disChannelHandler?: ChannelHandler;

  catch: ChannelCatch = (err) => {
    LoggerCore.getInstance().logger().error(
      "channel error",
      {
        flag: this.flag,
      },
      Logger.E(err)
    );
  };

  constructor(
    handler: ChannelHandler | ChannelManager,
    catchError: ChannelCatch | string
  ) {
    if (typeof handler === "function") {
      this.handler = handler;
      this.catch = <ChannelCatch>catchError!;
    } else {
      this.manager = handler;
      this.flag = <string>catchError;
    }
  }

  // 建立信道
  channel(action: string, data: any) {
    this.manager.nativeSend({
      action,
      data,
      stream: this.flag,
      channel: true,
    });
  }

  // send方法需要先使用channel方法建立信道
  send(data: any): void {
    // 使用原生方法发送消息,取消掉了原来的action
    this.manager.nativeSend({
      data,
      stream: this.flag,
      channel: true,
    });
  }

  throw(err: any): void {
    this.manager.nativeSend({
      stream: this.flag,
      error: err,
      channel: true,
    });
  }

  // 发送后只需要接收一条消息,不需要建立长连接,不需要使用channel建立信道
  syncSend(action: string, data: any): Promise<any> {
    this.manager.nativeSend({
      action,
      data,
      stream: this.flag,
      channel: false,
    });
    return new Promise((resolve, reject) => {
      this.handler = (resp) => {
        resolve(resp);
      };
      this.catch = (err) => {
        reject(err);
      };
    });
  }

  setHandler(handler: ChannelHandler) {
    this.handler = function warp(data): void {
      if (data === "dischannel") {
        this.manager.disChannel(this);
        if (this.disChannelHandler) {
          this.disChannelHandler("dischannel");
        }
        return;
      }
      handler(data);
    };
  }

  setCatch(catchError: ChannelCatch) {
    this.catch = catchError;
  }

  setDisChannelHandler(handler: ChannelHandler) {
    this.disChannelHandler = handler;
  }

  public disChannel() {
    this.send("dischannel");
    this.manager.disChannel(this);
  }
}
