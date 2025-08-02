import type {
  MessageSender,
  IMConnection,
  ExtMessageSender,
  IMRequesterReceiver,
  IMRequester,
  TMessage,
  TMessageCommCode,
} from "./types";
import LoggerCore from "@App/app/logger/core";
import { actionDataConnect, actionDataSend } from "./client";
import { RuntimeExtConnection } from "./extension_message";

export class GetSender {
  constructor(private readonly sender: IMConnection | MessageSender) {}

  getSender(): MessageSender {
    return this.sender as MessageSender;
  }

  getExtMessageSender(): ExtMessageSender {
    if (this.sender instanceof RuntimeExtConnection) {
      const con = this.sender.getPort();
      return {
        windowId: con.sender?.tab?.windowId || -1, // -1表示后台脚本
        tabId: con.sender?.tab?.id || -1, // -1表示后台脚本
        frameId: con.sender?.frameId,
        documentId: con.sender?.documentId,
      };
    }
    const sender = this.sender as MessageSender;
    return {
      windowId: sender.tab?.windowId || -1, // -1表示后台脚本
      tabId: sender.tab?.id || -1, // -1表示后台脚本
      frameId: sender.frameId,
      documentId: sender.documentId,
    };
  }

  getConnect(): IMConnection {
    return this.sender as IMConnection;
  }
}

type ApiFunction = (params: any, con: GetSender) => Promise<any> | void;
type ApiFunctionSync = (params: any, con: GetSender) => any;

export class Server {
  private readonly apiFunctionMap: Map<string, ApiFunction> = new Map();

  private readonly logger = LoggerCore.getInstance().logger({ service: "messageServer" });

  constructor(
    readonly prefix: string,
    readonly message: IMRequesterReceiver,
    private readonly enableConnect: boolean = true
  ) {
    if (this.enableConnect) {
      message.onConnect((msg: TMessage, con: IMConnection) => {
        if (typeof msg.action !== "string") return;
        this.logger.trace("server onConnect", { msg });
        if (msg.action?.startsWith(prefix)) {
          return this.connectHandle(msg.action.slice(prefix.length + 1), msg.data, con);
        }
        return false;
      });
    }

    message.onMessage((msg: TMessage, sendResponse, sender) => {
      if (typeof msg.action !== "string") return;
      this.logger.trace("server onMessage", { msg: msg as any });
      if (msg.action?.startsWith(prefix)) {
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

  private connectHandle(msg: string, params: any, con: IMConnection) {
    const func = this.apiFunctionMap.get(msg);
    if (func) {
      const ret = func(params, new GetSender(con));
      if (ret) {
        if (ret instanceof Promise) {
          ret
            .then((data) => {
              data && con.sendMessage({ code: 0, data });
            })
            .catch((e: Error) => {
              con.sendMessage({ code: -1, message: e.message || e.toString() });
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
    sendResponse: (msgResp: TMessageCommCode) => void,
    sender?: MessageSender
  ) {
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
  to: IMRequester,
  middleware?: ApiFunctionSync
) {
  const handler = (params: any, fromCon: GetSender) => {
    const fromConnect = fromCon.getConnect();
    if (fromConnect) {
      actionDataConnect(to, `${prefix}/${path}`, params).then((toCon: IMConnection) => {
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
      return actionDataSend(to, `${prefix}/${path}`, params);
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
