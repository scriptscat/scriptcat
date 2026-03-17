import EventEmitter from "eventemitter3";
import type { Message, MessageConnect, MessageSend, RuntimeMessageSender, TMessage, TMessageCommAction } from "./types";
import { uuidv4 } from "@App/pkg/utils/uuid";

const listenerMgr = new EventEmitter<string, any>(); // 单一管理器

export class ExtensionMessage implements Message {
  constructor(private backgroundPrimary = false) {}

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
        }
        resolve!(resp);
        resolve = null;
      });
    });
  }

  tryEnableUserScriptConnectionListener = (..._args: any) => {
    // empty function
  };
  tryEnableUserScriptMessageListener = (..._args: any) => {
    // empty function
  };

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

    if (this.backgroundPrimary) {
      let addUserScriptConnectionListener: (() => void) | null = () => {
        try {
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
          addUserScriptConnectionListener = null;
        } catch {
          // do nothing
        }
      };
      // Firefox 需要先得到 userScripts 权限才能进行 onUserScriptConnect 的监听
      this.tryEnableUserScriptConnectionListener = () => {
        if (typeof chrome.runtime.onUserScriptConnect?.addListener === "function") {
          addUserScriptConnectionListener && addUserScriptConnectionListener();
        }
      };
      // Chrome 在初始化时就能监听
      this.tryEnableUserScriptConnectionListener();
    }
  }

  // 注意chrome.runtime.onMessage.addListener的回调函数需要返回true才能处理异步请求
  onMessage(
    callback: (
      data: TMessageCommAction,
      sendResponse: (data: any) => void,
      sender: RuntimeMessageSender
    ) => boolean | void
  ): void {
    chrome.runtime.onMessage.addListener((msg: TMessage, sender, sendResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.runtime.onMessage:", lastError);
        // 消息API发生错误因此不继续执行
        return false;
      }
      if ((msg as any)?.type === "userScripts.LISTEN_CONNECTIONS" && this.backgroundPrimary) {
        if (
          typeof chrome.runtime.onUserScriptConnect?.addListener === "function" &&
          typeof chrome.runtime.onUserScriptMessage?.addListener === "function"
        ) {
          this.tryEnableUserScriptConnectionListener();
          this.tryEnableUserScriptMessageListener();
          sendResponse(true);
        } else {
          sendResponse(false);
        }
        return false;
      }
      if (typeof msg.action !== "string") return;
      return callback(msg, sendResponse, sender);
    });

    if (this.backgroundPrimary) {
      let addUserScriptMessageListener: (() => void) | null = () => {
        try {
          // 监听用户脚本的消息
          chrome.runtime.onUserScriptMessage.addListener((msg: TMessage, sender, sendResponse) => {
            const lastError = chrome.runtime.lastError;
            if (typeof msg.action !== "string") return;
            if (lastError) {
              console.error("chrome.runtime.lastError in chrome.runtime.onUserScriptMessage:", lastError);
              // 消息API发生错误因此不继续执行
              return false;
            }
            return callback(msg, sendResponse, sender);
          });
          addUserScriptMessageListener = null;
        } catch {
          // do nothing
        }
      };
      // Firefox 需要先得到 userScripts 权限才能进行 onUserScriptMessage 的监听
      this.tryEnableUserScriptMessageListener = () => {
        if (typeof chrome.runtime.onUserScriptMessage?.addListener === "function") {
          addUserScriptMessageListener && addUserScriptMessageListener();
        }
      };
      // Chrome 在初始化时就能监听
      this.tryEnableUserScriptMessageListener();
    }
  }
}

export class ExtensionMessageConnect implements MessageConnect {
  private readonly listenerId = `${uuidv4()}`; // 使用 uuidv4 确保唯一
  private con: chrome.runtime.Port | null;
  private isSelfDisconnected = false;

  constructor(con: chrome.runtime.Port) {
    this.con = con; // 强引用
    const handler = (msg: TMessage, _con: chrome.runtime.Port) => {
      listenerMgr.emit(`onMessage:${this.listenerId}`, msg);
    };
    const cleanup = (con: chrome.runtime.Port) => {
      if (this.con) {
        this.con = null;
        listenerMgr.removeAllListeners(`cleanup:${this.listenerId}`);
        con.onMessage.removeListener(handler);
        con.onDisconnect.removeListener(cleanup);
        listenerMgr.emit(`onDisconnect:${this.listenerId}`, this.isSelfDisconnected);
        listenerMgr.removeAllListeners(`onDisconnect:${this.listenerId}`);
        listenerMgr.removeAllListeners(`onMessage:${this.listenerId}`);
      }
    };
    con.onMessage.addListener(handler);
    con.onDisconnect.addListener(cleanup);
    listenerMgr.once(`cleanup:${this.listenerId}`, cleanup);
  }

  sendMessage(data: TMessage) {
    if (!this.con) {
      console.warn("Attempted to sendMessage on a disconnected port.");
      // 無法 sendMessage 不应该屏蔽错误
      throw new Error("Attempted to sendMessage on a disconnected port.");
    }
    this.con?.postMessage(data);
  }

  onMessage(callback: (data: TMessage) => void) {
    if (!this.con) {
      console.error("onMessage Invalid Port");
      // 無法監聽的話不应该屏蔽错误
      throw new Error("onMessage Invalid Port");
    }
    listenerMgr.addListener(`onMessage:${this.listenerId}`, callback);
  }

  disconnect() {
    if (!this.con) {
      console.warn("Attempted to disconnect on a disconnected port.");
      // 重复 disconnect() 不应该屏蔽错误
      throw new Error("Attempted to disconnect on a disconnected port.");
    }
    this.isSelfDisconnected = true;
    this.con?.disconnect();
    // Note: .disconnect() will NOT automatically trigger the 'cleanup' listener
    listenerMgr.emit(`cleanup:${this.listenerId}`);
  }

  onDisconnect(callback: (isSelfDisconnected: boolean) => void) {
    if (!this.con) {
      console.error("onDisconnect Invalid Port");
      // 無法監聽的話不应该屏蔽错误
      throw new Error("onDisconnect Invalid Port");
    }
    listenerMgr.once(`onDisconnect:${this.listenerId}`, callback);
  }

  getPort(): chrome.runtime.Port {
    if (!this.con) {
      console.error("Port is already disconnected.");
      throw new Error("Port is already disconnected.");
    }
    return this.con;
  }
}

export class ExtensionContentMessageSend implements MessageSend {
  constructor(
    private tabId: number,
    private options?: {
      frameId?: number;
      documentId?: string;
    }
  ) {}

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve) => {
      if (!this.options?.documentId && !this.options?.frameId) {
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
