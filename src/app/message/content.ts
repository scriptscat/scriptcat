import LoggerCore from "../logger/core";
import { Channel } from "./channel";
import {
  ChannelManager,
  MessageHander,
  MessageManager,
  WarpChannelManager,
} from "./message";

// content与页面通讯,使用CustomEvent
export default class MessageContent
  extends MessageHander
  implements MessageManager
{
  static instance: MessageContent;

  static getInstance() {
    return this.instance;
  }

  eventId: string;

  isContent: boolean;

  channelManager: ChannelManager;

  relatedTarget: Map<number, Element>;

  constructor(eventId: string, isContent: boolean) {
    super();
    this.eventId = eventId;
    this.isContent = isContent;
    this.channelManager = new WarpChannelManager((data) => {
      this.nativeSend(data);
    });
    this.relatedTarget = new Map<number, Element>();
    document.addEventListener(
      (isContent ? "ct" : "fd") + eventId,
      (event: unknown) => {
        if (event instanceof MutationEvent) {
          this.relatedTarget.set(
            parseInt(event.prevValue, 10),
            <Element>event.relatedNode
          );
          return;
        }
        const message = (<
          {
            detail: {
              data: any;
              action: string;
              stream: string;
              error: any;
              connect: boolean;
            };
          }
        >event).detail;
        this.handler(message, this.channelManager, {
          targetTag: "content",
        });
      }
    );
    if (!MessageContent.instance) {
      MessageContent.instance = this;
    }
  }

  // 组合ChannelManager

  getChannel(flag: string): Channel | undefined {
    return this.channelManager.getChannel(flag);
  }

  channel(flag?: string): Channel {
    return this.channelManager.channel(flag);
  }

  disChannel(channel: Channel): void {
    return this.channelManager.disChannel(channel);
  }

  free(): void {
    return this.channelManager.free();
  }

  syncSend(action: string, data: any): Promise<any> {
    const channel = this.channelManager.channel();
    return channel.syncSend(action, data);
  }

  // content与inject通讯为阻塞可以实现真同步,使用回调的方式返回参数
  sendCallback(action: string, data: any, callback: (resp: any) => void) {
    const channel = this.channelManager.channel();
    channel.handler = callback;
    this.nativeSend({
      action,
      data,
      stream: channel.flag,
      channel: false,
    });
  }

  getAndDelRelatedTarget(id: number) {
    const target = this.relatedTarget.get(id);
    this.relatedTarget.delete(id);
    return target;
  }

  nativeSend(data: any): void {
    let detail = data;

    // 特殊处理relatedTarget
    if (detail.data && typeof detail.data.relatedTarget === "object") {
      // 先将relatedTarget转换成id发送过去
      const target = detail.data.relatedTarget;
      delete detail.data.relatedTarget;
      detail.data.relatedTarget = Math.ceil(Math.random() * 1000000);
      // 可以使用此种方式交互element
      const ev = document.createEvent("MutationEvent");
      ev.initMutationEvent(
        (this.isContent ? "fd" : "ct") + this.eventId,
        false,
        false,
        target,
        detail.data.relatedTarget.toString()
      );
      document.dispatchEvent(ev);
    }

    if (typeof cloneInto !== "undefined") {
      try {
        LoggerCore.getLogger().info("nativeSend");
        // eslint-disable-next-line no-undef
        detail = cloneInto(detail, document.defaultView);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(e);
        LoggerCore.getLogger().info("error data");
      }
    }

    const ev = new CustomEvent((this.isContent ? "fd" : "ct") + this.eventId, {
      detail,
    });
    document.dispatchEvent(ev);
  }

  public send(action: string, data: any) {
    this.nativeSend({
      action,
      data,
    });
  }
}
