/* eslint-disable max-classes-per-file */
import LoggerCore from "../logger/core";
import Logger from "../logger/logger";
import {
  IMessageBroadcast,
  MessageHander,
  MessageSender,
  Target,
  TargetTag,
  WarpChannelManager,
} from "./message";

// 连接中心,只有background才能使用,其他环境通过runtime.connect连接到background
// sandbox的连接也聚合在了一起
export default class MessageCenter
  extends MessageHander
  implements IMessageBroadcast
{
  sandbox?: Window;

  logger: Logger;

  constructor() {
    super();
    this.logger = LoggerCore.getInstance().logger({
      component: "messageCenter",
    });
  }

  connectMap: Map<TargetTag, Map<number, chrome.runtime.Port>> = new Map();

  streamMap: Map<string, string> = new Map();

  setSandbox(sandbox: Window) {
    this.sandbox = sandbox;
  }

  public start() {
    // 基于chrome.runtime.onConnect去做
    chrome.runtime.onConnect.addListener((port) => {
      let connectMap = this.connectMap.get(<TargetTag>port.name);
      if (!connectMap) {
        connectMap = new Map();
        this.connectMap.set(<TargetTag>port.name, connectMap);
      }
      // 构建发送者,使用自定义的发送者结构体
      const sender: MessageSender = {
        targetTag: <TargetTag>port.name,
      };
      let id = 0;
      if (port.sender && port.sender.tab) {
        if (port.sender.frameId) {
          id = port.sender.tab!.id! + port.sender.frameId;
          sender.frameId = port.sender.frameId;
        } else {
          id = port.sender.tab!.id!;
        }
        sender.tabId = port.sender.tab?.id;
        sender.url = port.sender.url;
      }
      // 使用tabId作为标识
      connectMap.set(id, port);
      const portMessage = new WarpChannelManager((data) => {
        port.postMessage(data);
      });
      port.onDisconnect.addListener(() => {
        connectMap!.delete(id);
        portMessage.free();
      });
      port.onMessage.addListener((message) => {
        if (message.broadcast === true) {
          // 广播
          const target = message.target as Target;
          if (message.action) {
            this.send(target, message.action, message.data);
          } else {
            this.sendNative(target, message.data);
          }
          return;
        }
        this.handler(message, portMessage, sender);
      });
    });
    const sandboxMessage = new WarpChannelManager((data) => {
      this.sandbox?.postMessage(data, "*");
    });
    // 监听沙盒消息
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.broadcast === true) {
        // 广播
        const target = message.target as Target;
        if (message.action) {
          this.send(target, message.action, message.data);
        } else {
          this.sendNative(target, message.data);
        }
      }
      this.handler(message, sandboxMessage, { targetTag: "sandbox" });
    });
  }

  broadcast(target: Target, action: string, data: any): void {
    return this.send(target, action, data);
  }

  // 根据目标发送
  public send(target: Target, action: string, data: any) {
    this.sendNative(target, {
      action,
      data,
    });
  }

  public sendNative(target: Target, data: any) {
    if (target.tag === "all") {
      this.connectMap.forEach((_, key) => {
        this.sendNative(
          {
            tag: key,
          },
          data
        );
      });
      this.sendNative({ tag: "sandbox" }, data);
      return;
    }
    if (target.tag === "sandbox") {
      this.sandbox?.postMessage(data, "*");
      return;
    }
    const connectMap = this.connectMap.get(target.tag);
    if (!connectMap) {
      return;
    }
    if (target.id) {
      // 指定id
      target.id.forEach((id) => {
        connectMap.get(id)?.postMessage(data);
      });
    } else {
      // 同tag广播
      connectMap.forEach((port) => {
        port.postMessage(data);
      });
    }
  }
}
