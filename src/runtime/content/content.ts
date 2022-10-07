import MessageInternal from "@App/app/message/internal";
import { MessageHander, MessageManager } from "@App/app/message/message";
import { ScriptRunResouce } from "@App/app/repo/scripts";

// content页的处理
export default class ContentRuntime {
  contentMessage: MessageHander & MessageManager;

  internalMessage: MessageInternal;

  constructor(
    contentMessage: MessageHander & MessageManager,
    internalMessage: MessageInternal
  ) {
    this.contentMessage = contentMessage;
    this.internalMessage = internalMessage;
  }

  start(resp: { scripts: ScriptRunResouce[] }) {
    // 由content到background
    // 转发gmApi消息
    this.contentMessage.setHandler("gmApi", (action, data) => {
      return this.internalMessage.syncSend(action, data);
    });
    // 转发log消息
    this.contentMessage.setHandler("log", (action, data) => {
      this.internalMessage.send(action, data);
    });

    // 转发长连接的gmApi消息
    this.contentMessage.setHandlerWithConnect(
      "gmApiChannel",
      (inject, action, data) => {
        const background = this.internalMessage.channel();
        // 转发inject->background
        inject.setHandler((req) => {
          background.send(req.data);
        });
        inject.setCatch((err) => {
          background.throw(err);
        });
        inject.setDisChannelHandler(() => {
          background.disChannel();
        });
        // 转发background->inject
        background.setHandler((bgResp) => {
          inject.send(bgResp);
        });
        background.setCatch((err) => {
          inject.throw(err);
        });
        background.setDisChannelHandler(() => {
          inject.disChannel();
        });
        // 建立连接
        background.channel(action, data);
      }
    );

    this.listenCATApi();

    // 由background到content
    // 转发value更新事件
    this.internalMessage.setHandler("valueUpdate", (action, data) => {
      this.contentMessage.send(action, data);
    });

    this.contentMessage.send("pageLoad", resp);
  }

  listenCATApi() {
    // 处理特殊的消息,不需要转发到background
    this.contentMessage.setHandler("CAT_fetchBlob", (_action, data: string) => {
      return fetch(data).then((res) => res.blob());
    });
    this.contentMessage.setHandler(
      "CAT_createBlobUrl",
      (_action, data: Blob) => {
        return Promise.resolve(URL.createObjectURL(data));
      }
    );
  }
}
