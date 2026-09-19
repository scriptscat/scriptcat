import { type Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { initEnvInfo, type ScriptExecutor } from "./script_executor";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { EmitEventRequest } from "../service_worker/types";
import type { GMInfoEnv, ValueUpdateDataEncoded } from "./types";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { onInjectPageLoaded } from "./external";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import { type TExtensionEnv } from "../extension/extension_env";
import { RuntimeClient } from "../service_worker/client";
import { customClone, Native } from "./global";
import { setPageRpcExtensionOrigin, type ExtensionOrigin } from "./page_rpc";

const MAX_EXECUTION_TOKEN_LENGTH = 256;

// Inject pageLoad crosses the page-visible bridge, so only a cloned DTO with a current broker binding may reach the executor.
const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Native.arrayIsArray(value)) return false;
  const prototype = Native.objectGetPrototypeOf(value);
  return prototype === null || Native.objectGetPrototypeOf(prototype) === null;
};

const isStringArray = (value: unknown): value is string[] => {
  if (!Native.arrayIsArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") return false;
  }
  return true;
};

const isExecutionToken = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_EXECUTION_TOKEN_LENGTH;

const isPageResourceMap = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const keys = Native.objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const resource = value[key];
    if (!isRecord(resource) || typeof resource.content !== "string" || typeof resource.contentType !== "string") {
      return false;
    }
    if (resource.base64 !== undefined && typeof resource.base64 !== "string") return false;
  }
  return true;
};

const isPageScriptInfo = (value: unknown, envTag: "it" | "ct"): value is TScriptInfo => {
  if (!isRecord(value)) return false;
  if (
    typeof value.uuid !== "string" ||
    value.uuid.length === 0 ||
    typeof value.name !== "string" ||
    typeof value.flag !== "string" ||
    value.flag.length === 0 ||
    typeof value.code !== "string" ||
    !isRecord(value.metadata) ||
    !isRecord(value.value) ||
    !isPageResourceMap(value.resource) ||
    (value.requireCssResource !== undefined && !isPageResourceMap(value.requireCssResource)) ||
    !isExecutionToken(value.executionHandle) ||
    value.executionEnvTag !== envTag ||
    !isExecutionToken(value.executionRunFlag)
  ) {
    return false;
  }
  const metadataKeys = Native.objectKeys(value.metadata);
  for (let index = 0; index < metadataKeys.length; index += 1) {
    const key = metadataKeys[index];
    if (!isStringArray(value.metadata[key])) return false;
  }
  return true;
};

const hasOnlyKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) => {
  const keys = Native.objectKeys(value);
  for (let index = 0; index < required.length; index += 1) {
    if (!Native.objectHasOwn(value, required[index])) return false;
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    let known = false;
    for (let keyIndex = 0; keyIndex < required.length; keyIndex += 1) {
      if (required[keyIndex] === key) {
        known = true;
        break;
      }
    }
    if (!known) {
      for (let keyIndex = 0; keyIndex < optional.length; keyIndex += 1) {
        if (optional[keyIndex] === key) {
          known = true;
          break;
        }
      }
    }
    if (!known) return false;
  }
  return true;
};

const isEncodedValue = (value: unknown): boolean => {
  if (!Native.arrayIsArray(value)) return false;
  if (value.length === 1) return value[0] === 1 || value[0] === 2;
  return value.length === 2 && value[0] === 0;
};

const cloneInjectValueUpdate = (data: unknown): ValueUpdateDataEncoded | undefined => {
  const cloned = customClone(data);
  if (
    !isRecord(cloned) ||
    !hasOnlyKeys(cloned, ["entries", "uuid", "storageName", "sender", "valueUpdated"], ["id"]) ||
    (cloned.id !== undefined && (typeof cloned.id !== "string" || cloned.id.length > MAX_EXECUTION_TOKEN_LENGTH)) ||
    typeof cloned.uuid !== "string" ||
    typeof cloned.storageName !== "string" ||
    typeof cloned.valueUpdated !== "boolean" ||
    !isRecord(cloned.sender) ||
    !hasOnlyKeys(cloned.sender, ["runFlag"], ["tabId"]) ||
    typeof cloned.sender.runFlag !== "string" ||
    (cloned.sender.tabId !== undefined && typeof cloned.sender.tabId !== "number") ||
    !Native.arrayIsArray(cloned.entries)
  ) {
    return undefined;
  }
  for (let index = 0; index < cloned.entries.length; index += 1) {
    const entry = cloned.entries[index];
    if (
      !Native.arrayIsArray(entry) ||
      entry.length !== 3 ||
      typeof entry[0] !== "string" ||
      !isEncodedValue(entry[1]) ||
      !isEncodedValue(entry[2])
    ) {
      return undefined;
    }
  }
  return cloned as unknown as ValueUpdateDataEncoded;
};

const cloneInjectEmitEvent = (data: unknown): EmitEventRequest | undefined => {
  const cloned = customClone(data);
  if (
    !isRecord(cloned) ||
    !hasOnlyKeys(cloned, ["uuid", "event", "eventId"], ["data"]) ||
    typeof cloned.uuid !== "string" ||
    typeof cloned.event !== "string" ||
    typeof cloned.eventId !== "string"
  ) {
    return undefined;
  }
  return cloned as unknown as EmitEventRequest;
};

type InjectPageLoadData = {
  scripts: TScriptInfo[];
  envInfo: GMInfoEnv;
  reconnectToken?: string;
};

type PageLoadData = InjectPageLoadData & {
  extensionOrigin?: ExtensionOrigin;
};

const isExtensionOrigin = (value: unknown): value is ExtensionOrigin => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["protocol", "hostname", "port"])) return false;
  return (
    (value.protocol === "chrome-extension:" || value.protocol === "moz-extension:") &&
    typeof value.hostname === "string" &&
    value.hostname.length > 0 &&
    typeof value.port === "string"
  );
};

const clonePageLoad = (
  data: unknown,
  envTag: "it" | "ct",
  allowEmpty: boolean,
  allowExtensionOrigin: boolean
): PageLoadData | undefined => {
  const cloned = customClone(data);
  if (
    !isRecord(cloned) ||
    !hasOnlyKeys(
      cloned,
      ["scripts", "envInfo"],
      ["reconnectToken", ...(allowExtensionOrigin ? ["extensionOrigin"] : [])]
    ) ||
    (cloned.reconnectToken !== undefined && !isExecutionToken(cloned.reconnectToken))
  )
    return undefined;
  if (!Native.objectHasOwn(cloned, "scripts") || !Native.objectHasOwn(cloned, "envInfo")) return undefined;
  if (!Native.arrayIsArray(cloned.scripts) || (!allowEmpty && cloned.scripts.length === 0)) return undefined;
  for (let index = 0; index < cloned.scripts.length; index += 1) {
    if (!isPageScriptInfo(cloned.scripts[index], envTag)) return undefined;
  }
  if (!isRecord(cloned.envInfo)) return undefined;
  if (cloned.envInfo.sandboxMode !== "raw" || typeof cloned.envInfo.isIncognito !== "boolean") {
    return undefined;
  }
  if (cloned.envInfo.userAgentData !== undefined && !isRecord(cloned.envInfo.userAgentData)) return undefined;
  if (cloned.extensionOrigin !== undefined && !isExtensionOrigin(cloned.extensionOrigin)) return undefined;
  return {
    scripts: cloned.scripts,
    envInfo: cloned.envInfo as unknown as GMInfoEnv,
    reconnectToken: cloned.reconnectToken as string | undefined,
    extensionOrigin: cloned.extensionOrigin as ExtensionOrigin | undefined,
  };
};

const cloneInjectPageLoad = (data: unknown): InjectPageLoadData | undefined => clonePageLoad(data, "it", false, false);

export class ScriptRuntime {
  // USER_SCRIPT 重连会重放同一份 bootstrap；按服务端签发的句柄去重，导航换文档时句柄也会随之更换。
  private readonly startedScriptKeys = new Native.Set<string>();

  constructor(
    private readonly scripEnvTag: ScriptEnvTag,
    private readonly server: Server,
    private readonly msg: Message,
    private readonly scriptExecutor: ScriptExecutor,
    private readonly extensionEnv: TExtensionEnv | undefined
  ) {}

  // content环境的特殊初始化
  contentInit(domServer: Server = this.server, domMsg: CustomEventMessage = this.msg as CustomEventMessage) {
    domServer.on("runtime/addElement", (data: { params: [number | null, string, Record<string, any> | null] }) => {
      const safeData = customClone(data) as typeof data | undefined;
      if (!safeData || !Array.isArray(safeData.params) || safeData.params.length !== 3) return undefined;
      const [parentNodeId, tagName, tmpAttr] = safeData.params;

      // 此请求来自页面事件，只接受可验证的节点编号、标签名和扁平属性，避免把对象行为带入 DOM 操作。
      if (
        (parentNodeId !== null && (!Number.isInteger(parentNodeId) || parentNodeId <= 0)) ||
        typeof tagName !== "string" ||
        tagName.length === 0 ||
        tagName.length > 128 ||
        (tmpAttr !== null && (typeof tmpAttr !== "object" || Array.isArray(tmpAttr)))
      ) {
        return undefined;
      }

      const msg = domMsg;

      // 取回 parentNode（如果存在）
      let parentNode: Node | undefined;
      if (parentNodeId) {
        parentNode = msg.getAndDelRelatedTarget(parentNodeId) as Node | undefined;
      }

      // 创建元素并设置属性
      const el = <Element>document.createElement(tagName);
      const attr: Record<string, string> = Object.create(null);
      if (tmpAttr) {
        for (const key of Object.keys(tmpAttr)) {
          const descriptor = Object.getOwnPropertyDescriptor(tmpAttr, key);
          if (!descriptor || !("value" in descriptor)) return undefined;
          const value = descriptor.value;
          if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return undefined;
          attr[key] = String(value);
        }
      }
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

  async loadPage(beforeStart?: (scripts: TScriptInfo[]) => void | Promise<void>) {
    const client = new RuntimeClient(this.msg);
    const result = await client.pageLoad(this.scripEnvTag);
    if (!result.ok) return;
    const scripts = this.scripEnvTag === "ct" ? result.contentScriptList : result.injectScriptList;
    if (scripts.length) {
      await beforeStart?.(scripts);
      this.startScripts(scripts, result.envInfo);
    }
  }

  init() {
    this.server.on("runtime/emitEvent", (data: EmitEventRequest) => {
      this.receiveEmitEvent(data);
    });
    this.server.on("runtime/valueUpdate", (data: ValueUpdateDataEncoded) => {
      this.receiveValueUpdate(data);
    });

    this.server.on("pageLoad", (data: { scripts: TScriptInfo[]; envInfo: GMInfoEnv }) => {
      this.receivePageLoad(data);
    });
    // Older MAIN worlds may receive a forward-compatible native bootstrap token but cannot open a runtime port.
    this.server.on("bootstrap", () => undefined);

    // 用于 early-start 的扩充参数
    const { inIncognitoContext } = this.extensionEnv || {};
    const initialEnvInfo = { ...initEnvInfo };
    if (typeof inIncognitoContext === "boolean") initialEnvInfo.isIncognito = inIncognitoContext;

    // 检查early-start的脚本
    this.scriptExecutor.checkEarlyStartScript(this.scripEnvTag, initialEnvInfo);
  }

  startScripts(scripts: TScriptInfo[], envInfo: GMInfoEnv) {
    if (scripts.length === 0) {
      this.scriptExecutor.startScripts(scripts, envInfo);
      return;
    }
    const freshScripts: TScriptInfo[] = [];
    for (let index = 0; index < scripts.length; index += 1) {
      const script = scripts[index];
      const key = script.executionHandle || `${this.scripEnvTag}:${script.uuid}`;
      if (this.startedScriptKeys.has(key)) continue;
      this.startedScriptKeys.add(key);
      freshScripts.push(script);
    }
    if (freshScripts.length > 0) this.scriptExecutor.startScripts(freshScripts, envInfo);
  }

  receivePageLoad(data: unknown): string | undefined {
    if (this.scripEnvTag === "it") {
      const safeData = cloneInjectPageLoad(data);
      if (!safeData) return undefined;
      this.startScripts(safeData.scripts, safeData.envInfo);
      return safeData.reconnectToken;
    }
    const safeData = clonePageLoad(data, "ct", true, true);
    if (!safeData) return undefined;
    setPageRpcExtensionOrigin(safeData.extensionOrigin);
    this.startScripts(safeData.scripts, safeData.envInfo);
    return safeData.reconnectToken;
  }

  receiveEmitEvent(data: unknown): void {
    const safeData = cloneInjectEmitEvent(data);
    if (!safeData) return;
    this.scriptExecutor.emitEvent(safeData);
  }

  receiveValueUpdate(data: unknown): void {
    const safeData = cloneInjectValueUpdate(data);
    if (!safeData) return;
    this.scriptExecutor.valueUpdate(safeData);
  }

  externalMessage(messagePrefix = "scripting", message: Message = this.msg) {
    onInjectPageLoaded(message, messagePrefix);
  }
}
