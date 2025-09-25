import type { RuntimeMessageSender, MessageConnect, ExtMessageSender, Message, TMessage, MessageSend } from "./types";
import LoggerCore from "@App/app/logger/core";
import { connect, sendMessage } from "./client";
import { ExtensionMessageConnect } from "./extension_message";
import Logger from "@App/app/logger/logger";

export const enum GetSenderType {
  CONNECT = 1,
  EXTCONNECT = 1 | 2,
  RUNTIME = 4,
}
export interface TGetSender {
  getType(): number;
  isType(type: GetSenderType): boolean;
  getSender(): RuntimeMessageSender | undefined;
  getExtMessageSender(): ExtMessageSender;
  getConnect(): MessageConnect | undefined;
}

export class SenderConnect {
  private readonly mType;
  constructor(private sender: MessageConnect) {
    if (this.sender instanceof ExtensionMessageConnect) {
      this.mType = GetSenderType.EXTCONNECT;
    } else {
      this.mType = GetSenderType.CONNECT;
    }
  }

  getType() {
    return this.mType;
  }

  isType(type: GetSenderType): boolean {
    return (this.mType & type) === type;
  }

  getSender(): RuntimeMessageSender | undefined {
    if (this.sender instanceof ExtensionMessageConnect) {
      return this.sender.getPort().sender;
    } else {
      throw undefined;
    }
  }

  getExtMessageSender(): ExtMessageSender {
    if (this.sender instanceof ExtensionMessageConnect) {
      const con = this.sender.getPort();
      return {
        windowId: con.sender?.tab?.windowId || -1, // -1表示后台脚本
        tabId: con.sender?.tab?.id || -1, // -1表示后台脚本
        frameId: con.sender?.frameId,
        documentId: con.sender?.documentId,
      };
    } else {
      return {
        windowId: -1, // -1表示后台脚本
        tabId: -1, // -1表示后台脚本
        frameId: undefined,
        documentId: undefined,
      };
    }
  }

  getConnect(): MessageConnect {
    return this.sender;
  }
}

export class SenderRuntime {
  private readonly mType;
  constructor(private sender: RuntimeMessageSender) {
    this.mType = GetSenderType.RUNTIME;
  }

  getType() {
    return this.mType;
  }

  isType(type: GetSenderType): boolean {
    return (this.mType & type) === type;
  }

  getSender(): RuntimeMessageSender {
    return this.sender;
  }

  getExtMessageSender(): ExtMessageSender {
    const sender = this.sender as RuntimeMessageSender;
    return {
      windowId: sender.tab?.windowId || -1, // -1表示后台脚本
      tabId: sender.tab?.id || -1, // -1表示后台脚本
      frameId: sender.frameId,
      documentId: sender.documentId,
    };
  }

  getConnect(): undefined {
    throw undefined;
  }
}

type ApiFunction = (params: any, con: TGetSender) => Promise<any> | void;
type ApiFunctionSync = (params: any, con: TGetSender) => any;
type MiddlewareFunction = (params: any, con: TGetSender, next: () => Promise<any> | any) => Promise<any> | any;

export class Server {
  private apiFunctionMap: Map<string, ApiFunction> = new Map();

  private logger = LoggerCore.getInstance().logger({ service: "messageServer" });

  constructor(
    prefix: string,
    msgReceiver: Message | Message[],
    private enableConnect: boolean = true
  ) {
    const msgReceiverList = Array.isArray(msgReceiver) ? msgReceiver : [msgReceiver];
    if (this.enableConnect) {
      msgReceiverList.forEach((msg) => {
        msg.onConnect((msg: TMessage, con: MessageConnect) => {
          if (typeof msg.action !== "string") return;
          this.logger.trace("server onConnect", { msg });
          if (msg.action?.startsWith(prefix)) {
            return this.connectHandle(msg.action.slice(prefix.length + 1), msg.data, con);
          }
          return false;
        });
      });
    }

    msgReceiverList.forEach((msg) => {
      msg.onMessage((msg: TMessage, sendResponse, sender) => {
        if (typeof msg.action !== "string") return;
        this.logger.trace("server onMessage", { msg: msg as any });
        if (msg.action?.startsWith(prefix)) {
          return this.messageHandle(msg.action.slice(prefix.length + 1), msg.data, sendResponse, sender);
        }
      });
      return false;
    });
  }

  group(name: string, middleware?: MiddlewareFunction) {
    return new Group(this, name, middleware);
  }

  on(name: string, func: ApiFunction) {
    this.apiFunctionMap.set(name, func);
  }

  private connectHandle(msg: string, params: any, con: MessageConnect) {
    const func = this.apiFunctionMap.get(msg);
    if (func) {
      const ret = func(params, new SenderConnect(con));
      if (ret) {
        if (ret instanceof Promise) {
          ret
            .then((data) => {
              data && con.sendMessage({ code: 0, data });
            })
            .catch((e: Error) => {
              con.sendMessage({ code: -1, message: e.message || e.toString() });
              this.logger.error("connectHandle error", Logger.E(e));
            });
          return true;
        } else {
          con.sendMessage({ code: 0, data: ret });
        }
      }
      return true;
    }
  }

  private messageHandle(
    action: string,
    params: any,
    sendResponse: (response: any) => void,
    sender: RuntimeMessageSender
  ) {
    const func = this.apiFunctionMap.get(action);
    if (func) {
      try {
        const ret = func(params, new SenderRuntime(sender));
        if (ret instanceof Promise) {
          ret
            .then((data) => {
              try {
                sendResponse({ code: 0, data });
              } catch (e: any) {
                this.logger.error("sendResponse error", Logger.E(e));
              }
            })
            .catch((e: Error) => {
              sendResponse({ code: -1, message: e.message || e.toString() });
              this.logger.error("messageHandle error", Logger.E(e));
            });
          return true;
        } else {
          sendResponse({ code: 0, data: ret });
        }
      } catch (e: any) {
        sendResponse({ code: -1, message: e.message || e.toString() });
        this.logger.error("messageHandle error", Logger.E(e));
      }
    } else {
      sendResponse({ code: -1, message: "no such api " + action });
      this.logger.error("no such api", { action: action });
    }
  }
}

export class Group {
  private middlewares: MiddlewareFunction[] = [];

  constructor(
    private server: Server,
    private name: string,
    middleware?: MiddlewareFunction
  ) {
    if (!name.endsWith("/") && name.length > 0) {
      this.name += "/";
    }
    if (middleware) {
      this.middlewares.push(middleware);
    }
  }

  group(name: string, middleware?: MiddlewareFunction) {
    const newGroup = new Group(this.server, `${this.name}${name}`, middleware);
    // 继承父级的中间件
    newGroup.middlewares = [...this.middlewares, ...newGroup.middlewares];
    return newGroup;
  }

  use(middleware: MiddlewareFunction): Group {
    const newGroup = new Group(this.server, `${this.name}`, middleware);
    newGroup.middlewares = [...this.middlewares, ...newGroup.middlewares];
    return newGroup;
  }

  on(name: string, func: ApiFunction) {
    const fullName = `${this.name}${name}`;

    if (this.middlewares.length === 0) {
      // 没有中间件，直接注册
      this.server.on(fullName, func);
    } else {
      // 有中间件，需要包装处理函数
      this.server.on(fullName, async (params: any, con: TGetSender) => {
        let index = 0;

        const next = async (): Promise<any> => {
          if (index < this.middlewares.length) {
            const middleware = this.middlewares[index++];
            return await middleware(params, con, next);
          } else {
            // 所有中间件都执行完毕，执行最终的处理函数
            return await func(params, con);
          }
        };

        return await next();
      });
    }
  }
}

// 转发消息
export function forwardMessage(
  prefix: string,
  path: string,
  receiverFrom: Server,
  senderTo: MessageSend,
  middleware?: ApiFunctionSync
) {
  const handler = (params: any, fromCon: TGetSender) => {
    const fromConnect = fromCon.getConnect();
    if (fromConnect) {
      connect(senderTo, `${prefix}/${path}`, params).then((toCon: MessageConnect) => {
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
      return sendMessage(senderTo, prefix + "/" + path, params);
    }
  };
  receiverFrom.on(path, (params, sender) => {
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
