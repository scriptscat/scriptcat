import { v4 as uuidv4 } from "uuid";
import { Connect, Handler, Message } from "./message";

// 用于扩展页与沙盒页通讯,使用postMessage,由于是使用的window.postMessage
// 所以background和sandbox页都是使用此对象,没有区分
export default class MessageSandbox implements Message {
  static instance: MessageSandbox;

  static getInstance() {
    return MessageSandbox.instance;
  }

  window: Window;

  handler: Map<string, Handler>;

  stream: Map<string, Connect> = new Map();

  constructor(_window: Window) {
    this.window = _window;
    this.handler = new Map();
    window.addEventListener("message", (message) => {
      const { stream } = message.data;
      if (stream) {
        const streamHandler = this.stream.get(stream);
        if (streamHandler) {
          if (message.data.error) {
            if (streamHandler.catch) {
              streamHandler.catch(message.data.error);
            }
          } else if (streamHandler.handler) {
            streamHandler.handler(message.data);
          }
          if (!message.data.connect) {
            this.stream.delete(message.data.stream);
          }
          return;
        }
        const handler = this.handler.get(message.data.action);
        if (handler) {
          try {
            const ret = handler(message.data.action, message.data.data);
            if (ret) {
              ret
                .then((data: any) => {
                  this.window.postMessage(
                    {
                      action: message.data.action,
                      data,
                      streamHandler,
                    },
                    "*"
                  );
                })
                .catch((err) => {
                  this.window.postMessage(
                    {
                      action: message.data.action,
                      stream,
                      error: err,
                    },
                    "*"
                  );
                });
            }
          } catch (err) {
            this.window.postMessage(
              {
                action: message.data.action,
                stream,
                error: err,
              },
              "*"
            );
          }
        }
        return;
      }
      const handler = this.handler.get(message.data.action);
      if (handler) {
        handler(message.data.action, message.data.data);
      }
    });
    if (!MessageSandbox.instance) {
      MessageSandbox.instance = this;
    }
  }

  nativeSend(data: any): void {
    this.window.postMessage(data, "*");
  }

  connect(): Connect {
    const stream = uuidv4();
    const connect = new Connect(this, stream);
    this.stream.set(stream, connect);
    return connect;
  }

  disconnect(connect: Connect) {
    this.stream.delete(connect.flag);
  }

  syncSend(action: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const stream = uuidv4();
      this.stream.set(
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
      this.window.postMessage(
        {
          action,
          data,
          stream,
        },
        "*"
      );
    });
  }

  public send(action: string, data: any) {
    this.window.postMessage(
      {
        action,
        data,
      },
      "*"
    );
  }

  public setHandler(action: string, handler: Handler) {
    this.handler.set(action, handler);
  }
}
