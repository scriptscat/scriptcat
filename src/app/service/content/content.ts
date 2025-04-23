import { ScriptRunResouce } from "@App/app/repo/scripts";
import { Client, sendMessage } from "@Packages/message/client";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, Message, MessageSend, Server } from "@Packages/message/server";

// content页的处理
export default class ContentRuntime {
  constructor(
    private extServer: Server,
    private server: Server,
    private extSend: MessageSend,
    private msg: Message
  ) {}

  start(scripts: ScriptRunResouce[]) {
    this.extServer.on("runtime/emitEvent", (data) => {
      // 转发给inject
      return sendMessage(this.msg, "inject/runtime/emitEvent", data);
    });
    this.extServer.on("runtime/valueUpdate", (data) => {
      // 转发给inject
      return sendMessage(this.msg, "inject/runtime/valueUpdate", data);
    });
    forwardMessage(
      "serviceWorker",
      "runtime/gmApi",
      this.server,
      this.extSend,
      (data: { api: string; params: any }) => {
        // 拦截关注的api
        switch (data.api) {
          case "CAT_createBlobUrl": {
            const file = data.params[0] as File;
            const url = URL.createObjectURL(file);
            setTimeout(() => {
              URL.revokeObjectURL(url);
            }, 60 * 1000);
            return url;
          }
          case "CAT_fetchBlob": {
            return fetch(data.params[0]).then((res) => res.blob());
          }
          case "CAT_fetchDocument": {
            return new Promise((resolve) => {
              const xhr = new XMLHttpRequest();
              xhr.responseType = "document";
              xhr.open("GET", data.params[0]);
              xhr.onload = () => {
                resolve({
                  relatedTarget: xhr.response,
                });
              };
              xhr.send();
            });
          }
          case "GM_addElement": {
            let [parentNodeId, tagName, attr] = data.params;
            let parentNode: EventTarget | undefined;
            if (parentNodeId) {
              parentNode = (this.msg as CustomEventMessage).getAndDelRelatedTarget(parentNodeId);
            }
            const el = <Element>document.createElement(tagName);

            let textContent = "";
            if (attr) {
              if (attr.textContent) {
                textContent = attr.textContent;
                delete attr.textContent;
              }
            } else {
              attr = {};
            }
            Object.keys(attr).forEach((key) => {
              el.setAttribute(key, attr[key]);
            });
            if (textContent) {
              el.innerHTML = textContent;
            }
            (<Element>parentNode || document.head || document.body || document.querySelector("*")).appendChild(el);
            const nodeId = (this.msg as CustomEventMessage).sendRelatedTarget(el);
            return nodeId;
          }
          case "GM_log":
            // 拦截GM_log，打印到控制台
            // 由于某些页面会处理掉console.log，所以丢到这里来打印
            console.log(...data.params);
            break;
        }
        return false;
      }
    );
    const client = new Client(this.msg, "inject");
    client.do("pageLoad", { scripts });
  }
}
