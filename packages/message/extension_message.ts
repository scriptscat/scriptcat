import Logger from "@App/app/logger/logger";
import { Message, MessageConnect, MessageSend, MessageSender } from "./server";
import LoggerCore from "@App/app/logger/core";

export class ExtensionMessageSend implements MessageSend {
  constructor() {}

  connect(data: any): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const con = chrome.runtime.connect();
      con.postMessage(data);
      resolve(new ExtensionMessageConnect(con));
    });
  }

  // 发送消息 注意不进行回调的内存泄漏
  sendMessage(data: any): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(data, (resp) => {
        resolve(resp);
      });
    });
  }
}

// 由于service worker的限制，特殊处理chrome.runtime.onConnect/Message
export class ServiceWorkerMessage extends ExtensionMessageSend implements Message {
  onConnect(callback: (data: any, con: MessageConnect) => void): void {
    chrome.runtime.onConnect.addListener((port) => {
      const handler = (msg: any) => {
        port.onMessage.removeListener(handler);
        callback(msg, new ExtensionMessageConnect(port));
      };
      port.onMessage.addListener(handler);
    });
  }

  onMessage(callback: (data: any, sendResponse: (data: any) => void, sender: MessageSender) => void): void {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === "messageQueue") {
        return false;
      }
      return callback(msg, sendResponse, sender);
    });
  }
}

export class ExtensionMessage extends ExtensionMessageSend implements Message {
  constructor(private onUserScript = false) {
    super();
  }

  onConnect(callback: (data: any, con: MessageConnect) => void) {
    chrome.runtime.onConnect.addListener((port) => {
      const handler = (msg: any) => {
        port.onMessage.removeListener(handler);
        callback(msg, new ExtensionMessageConnect(port));
      };
      port.onMessage.addListener(handler);
    });
    if (this.onUserScript) {
      // 监听用户脚本的连接
      chrome.runtime.onUserScriptConnect.addListener((port) => {
        const handler = (msg: any) => {
          port.onMessage.removeListener(handler);
          callback(msg, new ExtensionMessageConnect(port));
        };
        port.onMessage.addListener(handler);
      });
    }
  }

  // 注意chrome.runtime.onMessage.addListener的回调函数需要返回true才能处理异步请求
  onMessage(callback: (data: any, sendResponse: (data: any) => void, sender: MessageSender) => void): void {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === "messageQueue") {
        return false;
      }
      return callback(msg, sendResponse, sender);
    });
    if (this.onUserScript) {
      // 监听用户脚本的消息
      chrome.runtime.onUserScriptMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "messageQueue") {
          return false;
        }
        return callback(msg, sendResponse, sender);
      });
    }
  }
}

export class ExtensionMessageConnect implements MessageConnect {
  constructor(private con: chrome.runtime.Port) {}

  sendMessage(data: any) {
    this.con.postMessage(data);
  }

  onMessage(callback: (data: any) => void) {
    this.con.onMessage.addListener(callback);
  }

  disconnect() {
    this.con.disconnect();
  }

  onDisconnect(callback: () => void) {
    this.con.onDisconnect.addListener(callback);
  }
}

export class ExtensionContentMessageSend extends ExtensionMessageSend {
  constructor(
    private tabId: number,
    private options?: {
      frameId?: number;
      documentId?: string;
    }
  ) {
    super();
  }

  sendMessage(data: any): Promise<any> {
    return new Promise((resolve) => {
      if (!this.options?.documentId || this.options?.frameId) {
        // 发送给指定的tab
        chrome.tabs.sendMessage(this.tabId, data, (resp) => {
          resolve(resp);
        });
      } else {
        chrome.tabs.sendMessage(this.tabId, data, this.options, (resp) => {
          resolve(resp);
        });
      }
    });
  }

  connect(data: any): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const con = chrome.tabs.connect(this.tabId, this.options);
      con.postMessage(data);
      resolve(new ExtensionMessageConnect(con));
    });
  }
}
