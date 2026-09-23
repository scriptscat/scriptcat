import { RequestSequenceWindow } from "@Packages/message/request_sequence_window";
import { getGrantCandidates } from "./gm_api/grant";
import { getPageRpcDependencies, INTERNAL_APIS_BY_GRANT } from "./gm_api/api_dependencies";
import { Native, nativeReflectApply } from "./global";

export const PAGE_RPC_VERSION = 2 as const;
const nativeStructuredClone = typeof structuredClone === "function" ? structuredClone : undefined;
const nativeObjectToString = Object.prototype.toString;
const nativeMapForEach = Map.prototype.forEach;
const nativeSetForEach = Set.prototype.forEach;
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
  readonly uuid?: string;
  readonly envTag?: "it" | "ct";
  readonly runFlag?: string;
  readonly allowedAPIs: ReadonlySet<string>;
  requestSequenceWindow: RequestSequenceWindow;
};

/** MAIN world 脚本可提交的不可信数据包；校验通过后原样转发，canonical 身份由 SW 依据 handle + 真实 sender 解析。 */
export type PageGMRequest = {
  readonly version: typeof PAGE_RPC_VERSION;
  readonly sequence: number;
  readonly handle: string;
  readonly api: string;
  readonly params: readonly unknown[];
};

export type PageGMRequestPacket = PageGMRequest;

export const getPageRpcAllowedAPIs = (grants: readonly string[]): string[] => {
  for (let index = 0; index < grants.length; index += 1) {
    if (grants[index] === "none") return [];
  }
  const allowed = new Native.Set<string>();
  const visited = new Native.Set<string>();
  const visitGrant = (grant: string): void => {
    const candidates = getGrantCandidates(grant);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (visited.has(candidate)) continue;
      visited.add(candidate);
      allowed.add(candidate);
      if (Native.objectHasOwn(INTERNAL_APIS_BY_GRANT, candidate)) {
        const internalAPIs = INTERNAL_APIS_BY_GRANT[candidate];
        for (let index = 0; index < internalAPIs.length; index += 1) allowed.add(internalAPIs[index]);
      }
      const dependencies = getPageRpcDependencies(candidate);
      for (let index = 0; index < dependencies.length; index += 1) visitGrant(dependencies[index]);
    }
  };
  for (let index = 0; index < grants.length; index += 1) visitGrant(grants[index]);
  const result: string[] = [];
  allowed.forEach((value) => {
    result[result.length] = value;
  });
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

const isBlobLike = (value: object): boolean => {
  let current: object | null = value;
  while (current !== null) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = nativeObjectGetOwnPropertyDescriptor(current, Symbol.toStringTag);
    } catch {
      throw new PageRpcError("page RPC value cannot be inspected");
    }
    if (descriptor) {
      if (!("value" in descriptor)) throw new PageRpcError("page RPC values cannot contain accessor properties");
      return descriptor.value === "Blob";
    }
    try {
      current = Native.objectGetPrototypeOf(current);
    } catch {
      throw new PageRpcError("page RPC value cannot be inspected");
    }
  }
  return false;
};

const assertDataOnly = (value: unknown, seen: Set<object>): void => {
  // 先检查自有数据描述符，再做 structuredClone；这样页面 getter/Proxy 不会在 broker 中执行。
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  // Blob 的内部槽由浏览器管理；只检查可由页面添加的字符串属性，忽略其内部 symbol 属性。
  if (nativeBlob && (value instanceof nativeBlob || isBlobLike(value))) {
    let keys: (string | symbol)[];
    try {
      keys = nativeReflectOwnKeys(value);
    } catch {
      throw new PageRpcError("page RPC value cannot be inspected");
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key === "string") assertDataOnly(ownData(value, key), seen);
    }
    return;
  }

  // Map/Set 条目不在自有属性中，必须先检查，避免 structuredClone 遍历时触发嵌套访问器。
  try {
    nativeReflectApply(nativeMapForEach, value as Map<unknown, unknown>, [
      (key: unknown, entry: unknown) => {
        assertDataOnly(key, seen);
        assertDataOnly(entry, seen);
      },
    ]);
    return;
  } catch (error) {
    if (error instanceof PageRpcError) throw error;
    // 不是 Map，继续检查普通自有属性。
  }
  try {
    nativeReflectApply(nativeSetForEach, value as Set<unknown>, [(entry: unknown) => assertDataOnly(entry, seen)]);
    return;
  } catch (error) {
    if (error instanceof PageRpcError) throw error;
    // 不是 Set，继续检查普通自有属性。
  }

  let keys: (string | symbol)[];
  try {
    keys = nativeReflectOwnKeys(value);
  } catch {
    throw new PageRpcError("page RPC value cannot be inspected");
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
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

  register(uuid: string, envTag: "it" | "ct", allowedAPIs: readonly string[], handle: string, runFlag: string): string {
    if (!handle || this.bindings.has(handle)) {
      throw new PageRpcError("invalid page execution binding");
    }
    this.bindings.set(handle, {
      handle,
      uuid,
      envTag,
      runFlag,
      allowedAPIs: new Native.Set(allowedAPIs),
      requestSequenceWindow: new RequestSequenceWindow(),
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
    if (!binding) throw new PageRpcError("page execution binding is inactive");
    if (!binding.allowedAPIs.has(api)) throw new PageRpcError("API is not granted to this execution");
    return binding;
  }

  consumeRequestSequence(binding: PageExecutionBinding, sequence: number): void {
    try {
      binding.requestSequenceWindow.consume(sequence);
    } catch (error) {
      throw new PageRpcError(error instanceof Error ? error.message : "page RPC sequence is invalid");
    }
  }
}

const REQUEST_KEYS = ["version", "sequence", "handle", "api", "params"] as const;

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
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    let knownKey = false;
    if (typeof key === "string") {
      for (let expectedIndex = 0; expectedIndex < REQUEST_KEYS.length; expectedIndex += 1) {
        const expected = REQUEST_KEYS[expectedIndex];
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
  const sequence = ownData(value, "sequence");
  const handle = ownData(value, "handle");
  const api = ownData(value, "api");
  const params = ownData(value, "params");

  if (version !== PAGE_RPC_VERSION) throw new PageRpcError("unsupported page RPC version");
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new PageRpcError("page RPC sequence is invalid");
  }
  if (typeof handle !== "string" || typeof api !== "string") {
    throw new PageRpcError("page RPC identity fields are invalid");
  }

  const binding = registry.resolve(handle, api);
  // resolve 同时执行句柄和授权检查；不要把页面传来的 api 直接转发给后端。
  const clonedParams = cloneParams(params);
  validateOperationParams(api, clonedParams);
  registry.consumeRequestSequence(binding, sequence);
  return {
    version: PAGE_RPC_VERSION,
    sequence,
    handle,
    api,
    params: clonedParams,
  };
};
