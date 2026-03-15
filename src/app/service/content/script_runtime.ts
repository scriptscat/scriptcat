import { type Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { initEnvInfo, type ScriptExecutor } from "./script_executor";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { EmitEventRequest } from "../service_worker/types";
import type { GMInfoEnv, ValueUpdateDataEncoded } from "./types";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { onInjectPageLoaded } from "./external";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";

export class ScriptRuntime {
  constructor(
    private readonly scripEnvTag: ScriptEnvTag,
    private readonly server: Server,
    private readonly msg: Message,
    private readonly scriptExecutor: ScriptExecutor
  ) {}

  // content环境的特殊初始化
  contentInit() {
    this.server.on("runtime/addElement", (data: { params: [number | null, string, Record<string, any> | null] }) => {
      const [parentNodeId, tagName, tmpAttr] = data.params;

      const msg = this.msg as CustomEventMessage;

      // 取回 parentNode（如果存在）
      let parentNode: Node | undefined;
      if (parentNodeId) {
        parentNode = msg.getAndDelRelatedTarget(parentNodeId) as Node | undefined;
      }

      // 创建元素并设置属性
      const el = <Element>document.createElement(tagName);
      const attr = tmpAttr ? { ...tmpAttr } : {};
      let textContent = "";
      if (attr.textContent) {
        textContent = attr.textContent;
        delete attr.textContent;
      }
      for (const key of Object.keys(attr)) {
        el.setAttribute(key, attr[key]);
      }
      if (textContent) el.textContent = textContent;

      // 优先挂到 parentNode，否则挂到 head/body/任意节点
      const node = parentNode || document.head || document.body || document.querySelector("*");
      node.appendChild(el);

      // 返回节点引用 id，供另一侧再取回
      const nodeId = msg.sendRelatedTarget(el);
      return nodeId;
    });
  }

  init() {
    this.server.on("runtime/emitEvent", (data: EmitEventRequest) => {
      // 转发给脚本
      this.scriptExecutor.emitEvent(data);
    });
    this.server.on("runtime/valueUpdate", (data: ValueUpdateDataEncoded) => {
      this.scriptExecutor.valueUpdate(data);
    });

    this.server.on("pageLoad", (data: { scripts: TScriptInfo[]; envInfo: GMInfoEnv }) => {
      // 监听事件
      this.startScripts(data.scripts, data.envInfo);
    });

    // 检查early-start的脚本
    this.scriptExecutor.checkEarlyStartScript(this.scripEnvTag, initEnvInfo);
  }

  startScripts(scripts: TScriptInfo[], envInfo: GMInfoEnv) {
    this.scriptExecutor.startScripts(scripts, envInfo);
  }

  externalMessage() {
    onInjectPageLoaded(this.msg);
  }
}
