import { Client, sendMessage } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { GMInfoEnv } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { ScriptExecutor } from "./script_executor";
import { isInjectIntoContent } from "./utils";
import { RuntimeClient } from "../service_worker/client";

// content页的处理
export default class ContentRuntime {
  // 运行在content页面的脚本
  contentScript: Map<string, ScriptLoadInfo> = new Map();

  constructor(
    // 监听来自service_worker的消息
    private extServer: Server,
    // 监听来自inject的消息
    private server: Server,
    // 发送给扩展service_worker的通信接口
    private senderToExt: MessageSend,
    // 发送给inject的消息接口
    private senderToInject: CustomEventMessage,
    // 脚本执行器消息接口
    private scriptExecutorMsg: CustomEventMessage,
    private scriptExecutor: ScriptExecutor
  ) {}

  init() {
    this.extServer.on("runtime/emitEvent", (data) => {
      // 转发给inject和scriptExecutor
      this.scriptExecutor.emitEvent(data);
      return sendMessage(this.senderToInject, "inject/runtime/emitEvent", data);
    });
    this.extServer.on("runtime/valueUpdate", (data) => {
      // 转发给inject和scriptExecutor
      this.scriptExecutor.valueUpdate(data);
      return sendMessage(this.senderToInject, "inject/runtime/valueUpdate", data);
    });
    forwardMessage("serviceWorker", "script/isInstalled", this.server, this.senderToExt);
    forwardMessage(
      "serviceWorker",
      "runtime/gmApi",
      this.server,
      this.senderToExt,
      (data: { api: string; params: any; uuid: string }) => {
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
                const nodeId = (this.senderToInject as CustomEventMessage).sendRelatedTarget(xhr.response);
                resolve(nodeId);
              };
              xhr.send();
            });
          }
          case "GM_addElement": {
            const [parentNodeId, tagName, tmpAttr] = data.params;
            let attr = { ...tmpAttr };
            let parentNode: EventTarget | undefined;
            // 判断是不是content脚本发过来的
            let msg: CustomEventMessage;
            if (this.contentScript.has(data.uuid) || this.scriptExecutor.execMap.has(data.uuid)) {
              msg = this.scriptExecutorMsg;
            } else {
              msg = this.senderToInject;
            }
            if (parentNodeId) {
              parentNode = msg.getAndDelRelatedTarget(parentNodeId);
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
            for (const key of Object.keys(attr)) {
              el.setAttribute(key, attr[key]);
            }
            if (textContent) {
              el.textContent = textContent;
            }
            (<Element>parentNode || document.head || document.body || document.querySelector("*")).appendChild(el);
            const nodeId = msg.sendRelatedTarget(el);
            return nodeId;
          }
          case "GM_log":
            // 拦截GM_log，打印到控制台
            // 由于某些页面会处理掉console.log，所以丢到这里来打印
            switch (data.params.length) {
              case 1:
                console.log(data.params[0]);
                break;
              case 2:
                console.log("[" + data.params[1] + "]", data.params[0]);
                break;
              case 3:
                console.log("[" + data.params[1] + "]", data.params[0], data.params[2]);
                break;
            }
            break;
        }
        return false;
      }
    );
  }

  pageLoad(messageFlags: MessageFlags) {
    this.scriptExecutor.checkEarlyStartScript("content", messageFlags);

    const client = new RuntimeClient(this.senderToExt);
    // 向service_worker请求脚本列表
    client.pageLoad().then((data) => {
      this.start(data.scripts, data.envInfo);
    });
  }

  start(scripts: ScriptLoadInfo[], envInfo: GMInfoEnv) {
    // 启动脚本
    const client = new Client(this.senderToInject, "inject");
    // 根据@inject-into content过滤脚本
    const injectScript: ScriptLoadInfo[] = [];
    const contentScript: ScriptLoadInfo[] = [];
    for (const script of scripts) {
      if (isInjectIntoContent(script.metadata)) {
        contentScript.push(script);
        continue;
      }
      injectScript.push(script);
    }
    client.do("pageLoad", { scripts: injectScript, envInfo });

    // 处理注入到content环境的脚本
    for (const script of contentScript) {
      this.contentScript.set(script.uuid, script);
    }
    // 监听事件
    this.scriptExecutor.init(envInfo);
    // 启动脚本
    this.scriptExecutor.start(contentScript);
  }
}
