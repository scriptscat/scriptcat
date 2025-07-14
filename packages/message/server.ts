import type { MessageSender, MessageConnect, ExtMessageSender, Message, MessageSend } from "./types";
import LoggerCore from "@App/app/logger/core";
import { connect, sendMessage } from "./client";

export class GetSender {
  constructor(private sender: MessageConnect | MessageSender) {}

  getSender(): MessageSender {
    return this.sender as MessageSender;
  }

  getExtMessageSender(): ExtMessageSender {
    const sender = this.sender as MessageSender;
    return {
      tabId: sender.tab?.id || -1, // -1表示后台脚本
      frameId: sender.frameId,
      documentId: sender.documentId,
    };
  }

  getConnect(): MessageConnect {
    return this.sender as MessageConnect;
  }
}

type ApiFunction = (params: any, con: GetSender) => Promise<any> | void;
type ApiFunctionSync = (params: any, con: GetSender) => any;

export class Server {
  private apiFunctionMap: Map<string, ApiFunction> = new Map();

  private logger = LoggerCore.getInstance().logger({ service: "messageServer" });

  constructor(
    prefix: string,
    message: Message,
    private enableConnect: boolean = true
  ) {
    this.enableConnect &&
      message.onConnect((msg: any, con: MessageConnect) => {
        this.logger.trace("server onConnect", { msg });
        if (msg.action.startsWith(prefix)) {
          return this.connectHandle(msg.action.slice(prefix.length + 1), msg.data, con);
        }
        return false;
      });

    message.onMessage((msg: { action: string; data: any }, sendResponse, sender) => {
      this.logger.trace("server onMessage", { msg: msg as any });
      if (msg.action.startsWith(prefix)) {
        return this.messageHandle(msg.action.slice(prefix.length + 1), msg.data, sendResponse, sender);
      }
      return false;
    });
  }

  group(name: string) {
    return new Group(this, name);
  }

  on(name: string, func: ApiFunction) {
    this.apiFunctionMap.set(name, func);
  }

  private connectHandle(msg: string, params: any, con: MessageConnect) {
    const func = this.apiFunctionMap.get(msg);
    if (func) {
      func(params, new GetSender(con));
    }
  }

  private messageHandle(action: string, params: any, sendResponse: (response: any) => void, sender?: MessageSender) {
    const func = this.apiFunctionMap.get(action);
    if (func) {
      try {
        const ret = func(params, new GetSender(sender!));
        if (ret instanceof Promise) {
          ret
            .then((data) => {
              sendResponse({ code: 0, data });
            })
            .catch((e: Error) => {
              sendResponse({ code: -1, message: e.message || e.toString() });
            });
          return true;
        } else {
          sendResponse({ code: 0, data: ret });
        }
      } catch (e: any) {
        sendResponse({ code: -1, message: e.message || e.toString() });
      }
    } else {
      sendResponse({ code: -1, message: "no such api " + action });
      this.logger.error("no such api", { action: action });
    }
  }
}

export class Group {
  constructor(
    private server: Server,
    private name: string
  ) {
    if (!name.endsWith("/")) {
      this.name += "/";
    }
  }

  group(name: string) {
    return new Group(this.server, `${this.name}${name}`);
  }

  on(name: string, func: ApiFunction) {
    this.server.on(`${this.name}${name}`, func);
  }
}

// 转发消息
export function forwardMessage(
  prefix: string,
  path: string,
  from: Server,
  to: MessageSend,
  middleware?: ApiFunctionSync
) {
  const handler = (params: any, fromCon: GetSender) => {
    const fromConnect = fromCon.getConnect();
    if (fromConnect) {
      connect(to, prefix + "/" + path, params).then((toCon: MessageConnect) => {
        fromConnect.onMessage((data) => {
          toCon.sendMessage(data);
        });
        toCon.onMessage((data) => {
          fromConnect.sendMessage(data);
        });
        fromConnect.onDisconnect(() => {
          toCon.disconnect();
        });
        toCon.onDisconnect(() => {
          fromConnect.disconnect();
        });
      });
    } else {
      return sendMessage(to, prefix + "/" + path, params);
    }
  };
  from.on(path, (params, sender) => {
    if (middleware) {
      // 此处是为了处理CustomEventMessage的同步消息情况
      const resp = middleware(params, sender) as any;
      if (resp instanceof Promise) {
        return resp.then((data) => {
          if (data !== false) {
            return data;
          }
          return handler(params, sender);
        });
      } else if (resp !== false) {
        return resp;
      }
    }
    return handler(params, sender);
  });
}
