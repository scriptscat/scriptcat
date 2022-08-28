import { v4 as uuidv4 } from "uuid";
import { Connect, Handler, SendResponse, Stream } from "./connect";

// 用于扩展页与沙盒页通讯,使用postMessage,由于是使用的window.postMessage
// 所以background和sandbox页都是使用此对象,没有区分
export default class ConnectSandbox implements Connect {
  static instance: ConnectSandbox;

  static getInstance() {
    return ConnectSandbox.instance;
  }

  window: Window;

  handler: Map<string, Handler>;

  stream: Map<string, Stream> = new Map();

  constructor(_window: Window) {
    this.window = _window;
    this.handler = new Map();
    window.addEventListener("message", (message) => {
      const { stream } = message.data;
      if (stream) {
        const streamHandler = this.stream.get(stream);
        if (streamHandler) {
          if (message.data.error) {
            streamHandler.catch(message.data.error);
          } else {
            streamHandler.handler(message.data);
          }
          this.stream.delete(message.data.stream);
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
    if (!ConnectSandbox.instance) {
      ConnectSandbox.instance = this;
    }
  }

  syncSend(action: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const stream = uuidv4();
      this.stream.set(
        stream,
        new Stream(
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
