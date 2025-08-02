import type {
  IMConnection,
  IMRequester,
  IMRequesterReceiver,
  MessageSender,
  TMessage,
  TMessageCommAction,
} from "./types";

export class RuntimeExtMessageRequester implements IMRequester {
  constructor() {}

  connect(data: any): Promise<IMConnection> {
    return new Promise((resolve) => {
      const con = chrome.runtime.connect();
      con.postMessage(data);
      resolve(new RuntimeExtConnection(con));
    });
  }

  // 发送消息 注意不进行回调的内存泄漏
  sendMessage(data: TMessage): Promise<any> {
    return new Promise((resolve: ((value: any) => void) | null) => {
      chrome.runtime.sendMessage(data, (resp) => {
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

export const CONFIG_SERVICE_WORKER = 1;

export const CONFIG_ON_USERSCRIPT = 2;

export const CONFIG_RUNTIME_COMM = 4;

class RuntimeExtMessengerBase extends RuntimeExtMessageRequester implements IMRequesterReceiver {
  constructor(private readonly configFlag = 0) {
    super();
  }

  onConnect(callback: (data: TMessage, con: IMConnection) => void) {
    if (this.configFlag & CONFIG_RUNTIME_COMM) {
      chrome.runtime.onConnect.addListener((port: chrome.runtime.Port | null) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.onConnect", lastError);
          // 消息API发生错误因此不继续执行
        }
        const handler = (msg: TMessage) => {
          port!.onMessage.removeListener(handler);
          callback(msg, new RuntimeExtConnection(port!));
          port = null;
        };
        port!.onMessage.addListener(handler);
      });
    }

    if (this.configFlag & CONFIG_ON_USERSCRIPT) {
      // 监听用户脚本的连接
      chrome.runtime.onUserScriptConnect.addListener((port: chrome.runtime.Port | null) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.onUserScriptConnect:", lastError);
        }
        const handler = (msg: any) => {
          port!.onMessage.removeListener(handler);
          callback(msg, new RuntimeExtConnection(port!));
          port = null;
        };
        port!.onMessage.addListener(handler);
      });
    }
  }

  // 注意chrome.runtime.onMessage.addListener的回调函数需要返回true才能处理异步请求
  onMessage(
    callback: (data: TMessageCommAction, sendResponse: (data: any) => void, sender: MessageSender) => void
  ): void {
    if (this.configFlag & CONFIG_RUNTIME_COMM) {
      chrome.runtime.onMessage?.addListener((msg: TMessage, sender, sendResponse) => {
        const lastError = chrome.runtime.lastError;
        if (typeof msg.action !== "string") return;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.onMessage:", lastError);
          // 消息API发生错误因此不继续执行
          return false;
        }
        return callback(msg, sendResponse, sender);
      });
    }
    if (this.configFlag & CONFIG_ON_USERSCRIPT) {
      // 监听用户脚本的消息
      chrome.runtime.onUserScriptMessage?.addListener((msg, sender, sendResponse) => {
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

export class RuntimeExtMessenger extends RuntimeExtMessengerBase {
  constructor(readonly onUserScript = false) {
    super((onUserScript ? CONFIG_ON_USERSCRIPT : 0) | CONFIG_RUNTIME_COMM);
  }
}

export class RuntimeExtConnection implements IMConnection {
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

export class ExtTabMessageRequester implements IMRequester {
  constructor(
    private tabId: number,
    private options?: {
      frameId?: number;
      documentId?: string;
    }
  ) {}

  sendMessage(data: TMessage): Promise<any> {
    return new Promise((resolve) => {
      if (!this.options?.documentId || this.options?.frameId) {
        // 发送给指定的tab
        chrome.tabs.sendMessage(this.tabId, data, (resp) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.tabs.sendMessage:", lastError);
            // 无视错误继续执行
          }
          resolve(resp);
        });
      } else {
        chrome.tabs.sendMessage(this.tabId, data, this.options, (resp) => {
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

  connect(data: TMessage): Promise<IMConnection> {
    return new Promise((resolve) => {
      const con = chrome.tabs.connect(this.tabId, this.options);
      con.postMessage(data);
      resolve(new RuntimeExtConnection(con));
    });
  }
}
