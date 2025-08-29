import type { Message, MessageConnect, MessageSend, MessageSender, TMessage, TMessageCommAction } from "./types";

export class ExtensionMessageSend implements MessageSend {
  constructor() {}

  connect(data: TMessage): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const con = chrome.runtime.connect();
      con.postMessage(data);
      resolve(new ExtensionMessageConnect(con));
    });
  }

  // 发送消息 注意不进行回调的内存泄漏
  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve: ((value: T) => void) | null) => {
      chrome.runtime.sendMessage(data, (resp: T) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.sendMessage:", lastError);
          // 通信API出错不回继续对话
          resolve = null;
          return;
        }
        resolve!(resp);
        resolve = null;
      });
    });
  }
}

export class ExtensionMessage extends ExtensionMessageSend implements Message {
  constructor(private onUserScript = false) {
    super();
  }

  onConnect(callback: (data: TMessage, con: MessageConnect) => void) {
    chrome.runtime.onConnect.addListener((port: chrome.runtime.Port | null) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.runtime.onConnect", lastError);
        // 消息API发生错误因此不继续执行
      }
      const handler = (msg: TMessage) => {
        port!.onMessage.removeListener(handler);
        callback(msg, new ExtensionMessageConnect(port!));
        port = null;
      };
      port!.onMessage.addListener(handler);
    });

    if (this.onUserScript) {
      // 监听用户脚本的连接
      chrome.runtime.onUserScriptConnect.addListener((port: chrome.runtime.Port | null) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.onUserScriptConnect:", lastError);
        }
        const handler = (msg: TMessage) => {
          port!.onMessage.removeListener(handler);
          callback(msg, new ExtensionMessageConnect(port!));
          port = null;
        };
        port!.onMessage.addListener(handler);
      });
    }
  }

  // 注意chrome.runtime.onMessage.addListener的回调函数需要返回true才能处理异步请求
  onMessage(
    callback: (data: TMessageCommAction, sendResponse: (data: any) => void, sender: MessageSender) => boolean | void
  ): void {
    chrome.runtime.onMessage.addListener((msg: TMessage, sender, sendResponse) => {
      const lastError = chrome.runtime.lastError;
      if (typeof msg.action !== "string") return;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.runtime.onMessage:", lastError);
        // 消息API发生错误因此不继续执行
        return false;
      }
      return callback(msg, sendResponse, sender);
    });
    if (this.onUserScript) {
      // 监听用户脚本的消息
      chrome.runtime.onUserScriptMessage?.addListener((msg: TMessage, sender, sendResponse) => {
        const lastError = chrome.runtime.lastError;
        if (typeof msg.action !== "string") return;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.onUserScriptMessage:", lastError);
          // 消息API发生错误因此不继续执行
          return false;
        }
        return callback(msg, sendResponse, sender);
      });
    }
  }
}

export class ExtensionMessageConnect implements MessageConnect {
  constructor(private con: chrome.runtime.Port) {}

  sendMessage(data: TMessage) {
    this.con.postMessage(data);
  }

  onMessage(callback: (data: TMessage) => void) {
    this.con.onMessage.addListener(callback);
  }

  disconnect() {
    this.con.disconnect();
  }

  onDisconnect(callback: () => void) {
    this.con.onDisconnect.addListener(callback);
  }

  getPort(): chrome.runtime.Port {
    return this.con;
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

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve) => {
      if (!this.options?.documentId || this.options?.frameId) {
        // 发送给指定的tab
        chrome.tabs.sendMessage(this.tabId, data, (resp: T) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.tabs.sendMessage:", lastError);
            // 无视错误继续执行
          }
          resolve(resp);
        });
      } else {
        chrome.tabs.sendMessage(this.tabId, data, this.options, (resp: T) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.tabs.sendMessage:", lastError);
            // 无视错误继续执行
          }
          resolve(resp);
        });
      }
    });
  }

  connect(data: TMessage): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const con = chrome.tabs.connect(this.tabId, this.options);
      con.postMessage(data);
      resolve(new ExtensionMessageConnect(con));
    });
  }
}
