// eslint-disable-next-line max-classes-per-file
import { v4 as uuidv4 } from "uuid";
import LoggerCore from "../logger/core";
import { Channel } from "./channel";
import MessageContent from "./content";

export type MessageSender = {
  tabId?: number;
  frameId?: number;
  url?: string;
  runFlag?: string;
  targetTag: TargetTag;
};

export type Handler = (
  action: string,
  data: any,
  sender: MessageSender
) => void | Promise<any>;

export type HandlerWithChannel = (
  channel: Channel,
  action: string,
  data: any,
  sender: MessageSender
) => void;

export type TargetTag =
  | "background"
  | "content"
  | "sandbox"
  | "popup"
  | "options"
  | "install"
  | "confirm"
  | "all";

export type Target = { tag: TargetTag; id?: number[] };

export interface ChannelManager {
  nativeSend(data: any): void;
  channel(flag?: string): Channel;
  getChannel(flag: string): Channel | undefined;
  disChannel(channel: Channel): void;
  free(): void;
}

export interface MessageManager extends ChannelManager {
  syncSend(action: string, data: any): Promise<any>;
  send(action: string, data: any): void;
}

export const MessageBroadcast = Symbol("MessageBroadcast");

export interface IMessageBroadcast {
  broadcast(target: Target, action: string, data: any): void;
}

// channel管理器,使用组合的方式使用
export class WarpChannelManager {
  channelMap = new Map<string, Channel>();

  nativeSend: (data: any) => void;

  constructor(nativeSend: (data: any) => void) {
    this.nativeSend = nativeSend;
  }

  // 建立新的信道
  channel(flag?: string): Channel {
    if (!flag) {
      flag = uuidv4();
    }
    const channel = new Channel(this, flag);
    this.channelMap.set(flag, channel);
    return channel;
  }

  // 获取信道
  getChannel(flag: string): Channel | undefined {
    return this.channelMap.get(flag);
  }

  disChannel(channel: Channel): void {
    this.channelMap.delete(channel.flag);
  }

  free() {
    this.channelMap.forEach((channel) => {
      channel.disChannelHandlerArray.forEach((item) => {
        item("free");
      });
    });
    this.channelMap.clear();
  }
}

export abstract class MessageHander {
  // 处理handler,可以有一次返回
  handlerMap: Map<string, Handler> = new Map();

  // 长连接处理handler,可以双方进行通信
  channelHandlerMap: Map<string, HandlerWithChannel> = new Map();

  // 处理接收到的消息,第二个参数使用channelMap的原因是在background中可以根据chrome.runtime去释放掉channel
  async handler(
    message: {
      action?: string;
      data: any;
      stream?: string;
      error?: any;
      channel?: boolean;
    },
    channelManager: ChannelManager,
    sender: MessageSender
  ) {
    // 信道长连接
    if (message.channel) {
      let channel = channelManager.getChannel(message.stream!);
      if (channel) {
        // 处理信道消息
        if (message.error) {
          channel.catch(message.error);
        } else {
          channel.handler(message.data);
        }
      } else {
        // 如果没有找到channel,则说明是一个新的channel,需要创建
        const handler = this.channelHandlerMap.get(message.action!);
        if (handler) {
          channel = channelManager.channel(message.stream);
          handler(channel, message.action!, message.data, sender);
        }
      }
      return;
    }
    // 有返回的消息
    if (message.stream) {
      // 没有action的消息,说明是一个返回消息
      if (message.action) {
        const handler = this.handlerMap.get(message.action!);
        if (handler) {
          const ret = handler(message.action!, message.data, sender);
          if (ret) {
            if (ret instanceof Promise) {
              ret
                .then((data) => {
                  channelManager.nativeSend({
                    stream: message.stream,
                    data,
                  });
                })
                .catch((err) => {
                  channelManager.nativeSend({
                    error: err.message,
                    stream: message.stream,
                  });
                });
            } else {
              channelManager.nativeSend({
                stream: message.stream,
                data: ret,
              });
            }
          } else {
            LoggerCore.getLogger({ component: "message" }).warn(
              "handler return is null"
            );
          }
        }
      } else {
        const channel = channelManager.getChannel(message.stream);
        if (channel) {
          if (message.error) {
            channel.catch(message.error);
          } else {
            channel.handler(message.data);
          }
        }
      }
      return;
    }
    // 无返回的消息
    const handler = this.handlerMap.get(message.action!);
    if (handler) {
      handler(message.action!, message.data, sender);
    }
  }

  // 单次消息处理
  setHandler(action: string, handler: Handler) {
    this.handlerMap.set(action, handler);
  }

  // 长连接的处理
  setHandlerWithChannel(action: string, handler: HandlerWithChannel) {
    this.channelHandlerMap.set(action, handler);
  }
}

// 脚本停止后将所有连接断开
export class ProxyMessageManager implements MessageManager {
  manager: MessageManager;

  channelMap = new Map<string, Channel>();

  constructor(manager: MessageManager) {
    this.manager = manager;
  }

  syncSend(action: string, data: any): Promise<any> {
    return this.manager.syncSend(action, data);
  }

  send(action: string, data: any): void {
    return this.manager.send(action, data);
  }

  nativeSend(data: any): void {
    return this.manager.nativeSend(data);
  }

  channel(flag?: string | undefined): Channel {
    const channel = this.manager.channel(flag);
    this.channelMap.set(channel.flag, channel);
    channel.setHandler(() => {
      this.channelMap.delete(channel.flag);
    });
    return channel;
  }

  getChannel(flag: string): Channel | undefined {
    return this.manager.getChannel(flag);
  }

  disChannel(channel: Channel): void {
    return this.manager.disChannel(channel);
  }

  free(): void {
    return this.manager.free();
  }

  cleanChannel(): void {
    this.channelMap.forEach((channel) => {
      channel.disChannel();
    });
    this.channelMap.clear();
  }

  // content与inject通讯录可以实现真同步,使用回调的方式返回参数
  sendCallback(action: string, data: any, callback: (resp: any) => void) {
    (<MessageContent>this.manager).sendCallback(action, data, callback);
  }

  getAndDelRelatedTarget(id: number) {
    return (<MessageContent>this.manager).getAndDelRelatedTarget(id);
  }
}
