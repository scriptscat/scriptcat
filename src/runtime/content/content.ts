import { ExternalMessage } from "@App/app/const";
import MessageContent from "@App/app/message/content";
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
    // 转发externalMessage消息
    this.contentMessage.setHandler(ExternalMessage, (action, data) => {
      return this.internalMessage.syncSend(action, data);
    });
    // 处理GM_addElement
    // @ts-ignore
    this.contentMessage.setHandler("GM_addElement", (action, data) => {
      const parma = data.param;
      let attr: { [x: string]: any; textContent?: any };
      let textContent = "";
      if (!parma[1]) {
        attr = {};
      } else {
        attr = { ...parma[1] };
        if (attr.textContent) {
          textContent = attr.textContent;
          delete attr.textContent;
        }
      }
      const el = <Element>document.createElement(parma[0]);
      Object.keys(attr).forEach((key) => {
        el.setAttribute(key, attr[key]);
      });
      if (textContent) {
        el.innerHTML = textContent;
      }
      let parentNode;
      if (data.relatedTarget) {
        parentNode = (<MessageContent>(
          this.contentMessage
        )).getAndDelRelatedTarget(data.relatedTarget);
      }
      (
        <Element>parentNode ||
        document.head ||
        document.body ||
        document.querySelector("*")
      ).appendChild(el);
      return {
        relatedTarget: el,
      };
    });

    // 转发长连接的gmApi消息
    this.contentMessage.setHandlerWithChannel(
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
        const url = URL.createObjectURL(data);
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 60 * 1000);
        return Promise.resolve(url);
      }
    );
    // 处理CAT_fetchDocument
    this.contentMessage.setHandler("CAT_fetchDocument", (_action, data) => {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = "document";
        xhr.open("GET", data);
        xhr.onload = () => {
          resolve({
            relatedTarget: xhr.response,
          });
        };
        xhr.send();
      });
    });
  }
}
