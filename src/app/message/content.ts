import { v4 as uuidv4 } from "uuid";
import LoggerCore from "../logger/core";
import Logger from "../logger/logger";
import { Connect, Handler, Message } from "./message";

// content与页面通讯,使用CustomEvent
export default class MessageContent implements Message {
  static instance: MessageContent;

  static getInstance() {
    return this.instance;
  }

  eventId: string;

  isContent: boolean;

  handler: Map<string, Handler>;

  connectMap: Map<string, Connect> = new Map();

  constructor(eventId: string, isContent: boolean) {
    this.eventId = eventId;
    this.isContent = isContent;
    this.handler = new Map();
    document.addEventListener(
      (isContent ? "ct" : "fd") + eventId,
      (event: unknown) => {
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
        if (message.stream) {
          const stream = this.connectMap.get(message.stream);
          if (stream) {
            if (message.error) {
              stream.catch(message.error);
            } else {
              stream.handler(message.data);
            }
            if (!message.connect) {
              this.connectMap.delete(message.stream);
            }
          }
        }
        const handler = this.handler.get(message.action);
        if (handler) {
          if (message.stream) {
            const ret = handler(message.action, message.data);
            if (ret) {
              ret
                .then((data: any) => {
                  this.nativeSend({
                    action: message.action,
                    data,
                    stream: message.stream,
                  });
                })
                .catch((err: Error) => {
                  this.nativeSend({
                    action: message.action,
                    error: Logger.E(err),
                    stream: message.stream,
                  });
                });
            } else {
              LoggerCore.getInstance()
                .logger({ comments: "MessageContent" })
                .warn("handler return is null");
            }
          } else {
            handler(message.action, message.data);
          }
        }
      }
    );
    if (!MessageContent.instance) {
      MessageContent.instance = this;
    }
  }

  syncSend(action: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const stream = uuidv4();
      this.connectMap.set(
        stream,
        new Connect(
          (resp) => {
            resolve(resp);
          },
          (err) => {
            reject(err);
          }
        )
      );
      this.nativeSend({
        action,
        data,
        stream,
      });
    });
  }

  connect(): Connect {
    throw new Error("Method not implemented.");
  }

  disconnect(connect: Connect): void {
    throw new Error("Method not implemented.");
  }

  nativeSend(data: any): void {
    let detail = data;
    if ((<{ cloneInto: any }>(<unknown>window)).cloneInto) {
      try {
        detail = (<
          {
            cloneInto: (
              // eslint-disable-next-line no-unused-vars, no-shadow
              detail: any,
              // eslint-disable-next-line no-unused-vars
              view: any
            ) => { action: string; data: any };
          }
        >(<unknown>global)).cloneInto(detail, document.defaultView);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(e);
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

  public setHandler(action: string, handler: Handler) {
    this.handler.set(action, handler);
  }
}
