import { type Channel } from "./channel";
import {
  ChannelManager,
  MessageHander,
  MessageManager,
  WarpChannelManager,
} from "./message";

// 用于扩展页与沙盒页通讯,使用postMessage,由于是使用的window.postMessage
// 所以background和sandbox页都是使用此对象,没有区分
export default class MessageSandbox
  extends MessageHander
  implements MessageManager
{
  window: Window;

  stream: Map<string, Channel> = new Map();

  channelManager: ChannelManager;

  constructor(_window: Window) {
    super();
    this.window = _window;
    this.channelManager = new WarpChannelManager((data) => {
      this.nativeSend(data);
    });
    window.addEventListener("message", (message) => {
      this.handler(message.data, this.channelManager, { targetTag: "sandbox" });
    });
  }

  nativeSend(data: any): void {
    this.window.postMessage(data, "*");
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

  public send(action: string, data: any) {
    this.nativeSend({
      action,
      data,
    });
  }
}
