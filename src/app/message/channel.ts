import LoggerCore from "../logger/core";
import Logger from "../logger/logger";
import { ChannelManager } from "./message";

export type ChannelHandler = (data: any) => void;

export type DisChannelHandler = () => void;

export type ChannelCatch = (err: any) => void;

// 信道,作为长连接的载体,需要先使用channel方法建立信道
export class Channel {
  manager!: ChannelManager;

  flag!: string;

  handler!: ChannelHandler;

  // 为了处理ProxyMessageManager,这里用数组
  disChannelHandlerArray: ChannelHandler[] = [];

  catch!: ChannelCatch;

  constructor(
    handler: ChannelHandler | ChannelManager,
    catchError: ChannelCatch | string
  ) {
    if (typeof handler === "function") {
      this.setHandler(handler);
      this.setCatch(<ChannelCatch>catchError);
    } else {
      this.manager = handler;
      this.flag = <string>catchError;
      this.setCatch((err) => {
        LoggerCore.getInstance().logger(Logger.E(err)).error("channel error", {
          flag: this.flag,
        });
      });
      this.setHandler(() => {
        LoggerCore.getInstance().logger().warn("channel handler is null");
      });
    }
  }

  // 建立信道
  channel(action: string, data?: any) {
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

  // 抛出错误并关闭信道
  throw(err: any): void {
    this.manager.nativeSend({
      stream: this.flag,
      error: err,
      channel: true,
    });
    this.manager.disChannel(this);
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
        this.disChannelHandlerArray.forEach((item) => {
          item("dischannel");
        });
        return;
      }
      handler(data);
    };
  }

  setCatch(catchError: ChannelCatch) {
    this.catch = function warp(err): void {
      catchError(err);
      this.manager.disChannel(this);
      this.disChannelHandlerArray.forEach((item) => {
        item("dischannel");
      });
    };
  }

  setDisChannelHandler(handler: ChannelHandler) {
    this.disChannelHandlerArray.push(handler);
  }

  public disChannel() {
    this.send("dischannel");
    this.manager.disChannel(this);
  }
}
