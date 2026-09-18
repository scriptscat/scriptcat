import { uuidv4 } from "@App/pkg/utils/uuid";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { getGrantCandidates } from "./gm_api/grant";
import { Native, nativeReflectApply } from "./global";

export const PAGE_RPC_VERSION = 1 as const;
const MAX_REQUEST_ID_LENGTH = 256;
const MAX_REQUEST_IDS_PER_BINDING = 4096;
const nativeStructuredClone = typeof structuredClone === "function" ? structuredClone : undefined;
const nativeObjectToString = Object.prototype.toString;
const EXTENSION_PROTOCOLS = new Native.Set(["chrome-extension:", "moz-extension:"]);
const nativeReflectOwnKeys = Native.reflectOwnKeys;
const nativeObjectGetOwnPropertyDescriptor = Native.objectGetOwnPropertyDescriptor;
const nativeArrayIsArray = Array.isArray;
const nativeURL = URL;
const nativeBlob = typeof Blob === "function" ? Blob : undefined;
const nativeStringSlice = String.prototype.slice;

export type ExtensionOrigin = Pick<URL, "protocol" | "hostname" | "port">;

export const getExtensionOrigin = (): ExtensionOrigin | undefined => {
  if (typeof chrome === "undefined" || typeof chrome.runtime?.getURL !== "function") return undefined;
  try {
    const url = new nativeURL(chrome.runtime.getURL("/"));
    if (!EXTENSION_PROTOCOLS.has(url.protocol) || !url.hostname) return undefined;
    return { protocol: url.protocol, hostname: url.hostname, port: url.port };
  } catch {
    // Ignore malformed runtime metadata and reject the URL below.
  }
  return undefined;
};

// USER_SCRIPT 的 blob URL 必须回指当前扩展 origin，origin 由隔离 context 提供并缓存。
let configuredExtensionOrigin: ExtensionOrigin | undefined;

export const setPageRpcExtensionOrigin = (value: unknown): void => {
  if (value === null || typeof value !== "object") {
    configuredExtensionOrigin = undefined;
    return;
  }
  try {
    const read = (key: keyof ExtensionOrigin): unknown => {
      const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
      return descriptor && "value" in descriptor ? descriptor.value : undefined;
    };
    const protocol = read("protocol");
    const hostname = read("hostname");
    const port = read("port");
    if (
      (protocol !== "chrome-extension:" && protocol !== "moz-extension:") ||
      typeof hostname !== "string" ||
      hostname.length === 0 ||
      typeof port !== "string"
    ) {
      configuredExtensionOrigin = undefined;
      return;
    }
    configuredExtensionOrigin = { protocol, hostname, port };
  } catch {
    configuredExtensionOrigin = undefined;
  }
};

export const isExtensionBlobUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const extensionOrigin = configuredExtensionOrigin || getExtensionOrigin();
  if (!extensionOrigin) return false;
  try {
    const url = new nativeURL(value);
    if (url.protocol !== "blob:") return false;
    const creatorOrigin = new nativeURL(nativeReflectApply(nativeStringSlice, value, ["blob:".length]));
    return (
      creatorOrigin.protocol === extensionOrigin.protocol &&
      creatorOrigin.hostname === extensionOrigin.hostname &&
      creatorOrigin.port === extensionOrigin.port
    );
  } catch {
    return false;
  }
};

export type PageExecutionBinding = {
  readonly handle: string;
  readonly uuid: string;
  readonly envTag: ScriptEnvTag;
  readonly allowedAPIs: ReadonlySet<string>;
  readonly runFlag: string;
  active: boolean;
  requestIds: Set<string>;
};

export type PageGMRequest = {
  readonly version: typeof PAGE_RPC_VERSION;
  readonly requestId: string;
  readonly handle: string;
  readonly api: string;
  readonly params: readonly unknown[];
  /** Canonical identity filled by the isolated broker after handle resolution. */
  readonly uuid: string;
  readonly envTag: ScriptEnvTag;
  readonly runFlag: string;
};

/** MAIN world 脚本可提交的不可信数据包。 */
export type PageGMRequestPacket = {
  readonly version: typeof PAGE_RPC_VERSION;
  readonly requestId: string;
  readonly handle: string;
  readonly api: string;
  readonly params: readonly unknown[];
};

const INTERNAL_APIS_BY_GRANT: Readonly<Record<string, readonly string[]>> = {
  "CAT.agent.conversation": ["CAT_agentConversation", "CAT_agentConversationChat", "CAT_agentAttachToConversation"],
  "CAT.agent.dom": ["CAT_agentDom"],
  "CAT.agent.model": ["CAT_agentModel"],
  "CAT.agent.opfs": ["CAT_agentOPFS", "CAT_fetchBlob"],
  "CAT.agent.skills": ["CAT_agentSkills"],
  "CAT.agent.task": ["CAT_agentTask"],
  CAT_fileStorage: ["CAT_fetchBlob", "CAT_createBlobUrl"],
  "GM.xmlHttpRequest": ["GM_xmlhttpRequest"],
};

// ScriptingRuntime 不加载 GM 实现模块，因此在此镜像一份精简依赖图。
const API_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "GM.getValues": ["GM_getValues"],
  "GM.cookie": ["GM.cookie.set", "GM.cookie.list", "GM.cookie.delete"],
  GM_cookie: ["GM_cookie.set", "GM_cookie.list", "GM_cookie.delete"],
  "GM.setValue": ["GM_setValue"],
  "GM.setValues": ["GM_setValues"],
  "GM.listValues": ["GM_listValues"],
  "GM.download": ["GM_download"],
  "GM.notification": ["GM_notification"],
  "GM.addValueChangeListener": ["GM_addValueChangeListener"],
  "GM.removeValueChangeListener": ["GM_removeValueChangeListener"],
  "GM.log": ["GM_log"],
  "GM.deleteValue": ["GM_setValue"],
  GM_deleteValue: ["GM_setValue"],
  "GM.deleteValues": ["GM_setValues"],
  GM_deleteValues: ["GM_setValues"],
  "GM.registerMenuCommand": ["GM_registerMenuCommand"],
  CAT_registerMenuInput: ["GM_registerMenuCommand"],
  "GM.addStyle": ["GM_addStyle"],
  "GM.addElement": ["GM_addElement"],
  "GM.unregisterMenuCommand": ["GM_unregisterMenuCommand"],
  CAT_unregisterMenuInput: ["GM_unregisterMenuCommand"],
  CAT_fileStorage: ["CAT_fetchBlob"],
  "GM.openInTab": ["GM_openInTab", "GM_closeInTab"],
  "GM.getTab": ["GM_getTab"],
  "GM.saveTab": ["GM_saveTab"],
  "GM.getTabs": ["GM_getTabs"],
  "GM.setClipboard": ["GM_setClipboard"],
  "GM.getResourceText": ["GM_getResourceText"],
  "GM.getResourceURL": ["GM_getResourceURL"],
  "GM.getResourceUrl": ["GM_getResourceURL"],
};

export const getPageRpcAllowedAPIs = (grants: readonly string[]): string[] => {
  for (let index = 0; index < grants.length; index += 1) {
    if (grants[index] === "none") return [];
  }
  const allowed = new Native.Set<string>();
  const visited = new Native.Set<string>();
  const visitGrant = (grant: string): void => {
    for (const candidate of getGrantCandidates(grant)) {
      if (visited.has(candidate)) continue;
      visited.add(candidate);
      allowed.add(candidate);
      for (const api of INTERNAL_APIS_BY_GRANT[candidate] || []) allowed.add(api);
      for (const dependency of API_DEPENDENCIES[candidate] || []) visitGrant(dependency);
    }
  };
  for (let index = 0; index < grants.length; index += 1) visitGrant(grants[index]);
  const result: string[] = [];
  allowed.forEach((value) => result.push(value));
  return result;
};

export class PageRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageRpcError";
  }
}

const ownData = (value: object, key: PropertyKey): unknown => {
  const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) {
    throw new PageRpcError(`page RPC field ${String(key)} must be a data property`);
  }
  return descriptor.value;
};

const assertDataOnly = (value: unknown, seen: Set<object>): void => {
  // 先检查自有数据描述符，再做 structuredClone；这样页面 getter/Proxy 不会在 broker 中执行。
  if (value === null || typeof value !== "object") return;
  // Blob 的内部槽由浏览器管理，不能把其 symbol/accessor 细节当作 DTO 字段遍历。
  if (typeof Blob === "function" && (value instanceof Blob || nativeObjectToString.call(value) === "[object Blob]"))
    return;
  if (seen.has(value)) return;
  seen.add(value);

  let keys: (string | symbol)[];
  try {
    keys = nativeReflectOwnKeys(value);
  } catch {
    throw new PageRpcError("page RPC value cannot be inspected");
  }
  for (const key of keys) {
    if (typeof key === "symbol") throw new PageRpcError("page RPC values cannot contain symbol properties");
    const child = ownData(value, key);
    assertDataOnly(child, seen);
  }
};

const cloneParams = (params: unknown): readonly unknown[] => {
  // 复制发生在交给 service worker 之前，后续 broker 只处理隔离后的普通值。
  if (!nativeArrayIsArray(params)) throw new PageRpcError("page RPC params must be an array");
  assertDataOnly(params, new Native.Set());
  if (!nativeStructuredClone) throw new PageRpcError("structured clone is unavailable");
  try {
    return nativeStructuredClone(params) as readonly unknown[];
  } catch {
    throw new PageRpcError("page RPC params are not cloneable");
  }
};

const validateOperationParams = (api: string, params: readonly unknown[]): void => {
  switch (api) {
    case "CAT_fetchBlob":
      if (params.length !== 1 || !isExtensionBlobUrl(params[0])) {
        throw new PageRpcError("CAT_fetchBlob expects an extension blob URL");
      }
      return;
    case "CAT_createBlobUrl":
      if (
        params.length !== 1 ||
        !nativeBlob ||
        (!(params[0] instanceof nativeBlob) && nativeObjectToString.call(params[0]) !== "[object Blob]")
      ) {
        throw new PageRpcError("CAT_createBlobUrl expects one Blob value");
      }
      return;
    case "CAT_fetchDocument":
      if (params.length !== 2 || typeof params[0] !== "string" || typeof params[1] !== "boolean") {
        throw new PageRpcError("CAT_fetchDocument expects a URL and content flag");
      }
      return;
    case "CAT_agentOPFS":
      if (
        params.length !== 1 ||
        params[0] === null ||
        typeof params[0] !== "object" ||
        nativeArrayIsArray(params[0]) ||
        typeof (params[0] as { action?: unknown }).action !== "string"
      ) {
        throw new PageRpcError("CAT_agentOPFS expects an operation object");
      }
      return;
    default:
      return;
  }
};

export class PageRpcRegistry {
  private readonly bindings = new Native.Map<string, PageExecutionBinding>();

  register(
    uuid: string,
    envTag: ScriptEnvTag,
    allowedAPIs: readonly string[],
    handle = uuidv4(),
    runFlag = uuidv4()
  ): string {
    if (!uuid || !handle || this.bindings.has(handle)) {
      throw new PageRpcError("invalid page execution binding");
    }
    this.bindings.set(handle, {
      handle,
      uuid,
      envTag,
      allowedAPIs: new Native.Set(allowedAPIs),
      runFlag,
      active: true,
      requestIds: new Native.Set(),
    });
    return handle;
  }

  revoke(handle: string): void {
    this.bindings.delete(handle);
  }

  revokeAll(): void {
    this.bindings.clear();
  }

  resolve(handle: string, api: string): PageExecutionBinding {
    const binding = this.bindings.get(handle);
    if (!binding?.active) throw new PageRpcError("page execution binding is inactive");
    if (!binding.allowedAPIs.has(api)) throw new PageRpcError("API is not granted to this execution");
    return binding;
  }

  consumeRequestId(binding: PageExecutionBinding, requestId: string): void {
    // requestId 只在每个绑定内去重，并保留有限窗口，避免页面长期占用内存。
    if (binding.requestIds.has(requestId)) throw new PageRpcError("page RPC requestId was already used");
    binding.requestIds.add(requestId);
    while (binding.requestIds.size > MAX_REQUEST_IDS_PER_BINDING) {
      const oldest = binding.requestIds.values().next().value as string | undefined;
      if (oldest === undefined) break;
      binding.requestIds.delete(oldest);
    }
  }
}

const REQUEST_KEYS = ["version", "requestId", "handle", "api", "params"] as const;

export const validatePageGMRequest = (value: unknown, registry: PageRpcRegistry): PageGMRequest => {
  if (value === null || typeof value !== "object") throw new PageRpcError("page RPC request must be an object");

  let keys: (string | symbol)[];
  try {
    keys = nativeReflectOwnKeys(value);
  } catch {
    throw new PageRpcError("page RPC request cannot be inspected");
  }
  if (keys.length !== REQUEST_KEYS.length) {
    throw new PageRpcError("page RPC request has unexpected fields");
  }
  for (const key of keys) {
    let knownKey = false;
    if (typeof key === "string") {
      for (const expected of REQUEST_KEYS) {
        if (expected === key) {
          knownKey = true;
          break;
        }
      }
    }
    if (!knownKey) {
      throw new PageRpcError("page RPC request has unexpected fields");
    }
  }

  const version = ownData(value, "version");
  const requestId = ownData(value, "requestId");
  const handle = ownData(value, "handle");
  const api = ownData(value, "api");
  const params = ownData(value, "params");

  if (version !== PAGE_RPC_VERSION) throw new PageRpcError("unsupported page RPC version");
  if (typeof requestId !== "string" || !requestId || requestId.length > MAX_REQUEST_ID_LENGTH) {
    throw new PageRpcError("page RPC requestId is invalid");
  }
  if (typeof handle !== "string" || typeof api !== "string") {
    throw new PageRpcError("page RPC identity fields are invalid");
  }

  const binding = registry.resolve(handle, api);
  // resolve 同时执行句柄、授权和活跃状态检查；不要把页面传来的 api 直接转发给后端。
  const clonedParams = cloneParams(params);
  validateOperationParams(api, clonedParams);
  registry.consumeRequestId(binding, requestId);
  return {
    version: PAGE_RPC_VERSION,
    requestId,
    handle,
    api,
    params: clonedParams,
    uuid: binding.uuid,
    envTag: binding.envTag,
    runFlag: binding.runFlag,
  };
};
