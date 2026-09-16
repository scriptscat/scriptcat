import { uuidv4 } from "@App/pkg/utils/uuid";
import type { ScriptEnvTag } from "@Packages/message/consts";
import { getGrantCandidates } from "./gm_api/grant";

export const PAGE_RPC_VERSION = 1 as const;
const nativeStructuredClone = typeof structuredClone === "function" ? structuredClone : undefined;

export type PageExecutionBinding = {
  readonly handle: string;
  readonly uuid: string;
  readonly envTag: ScriptEnvTag;
  readonly allowedAPIs: ReadonlySet<string>;
  readonly runFlag: string;
  active: boolean;
};

export type PageGMRequest = {
  readonly version: typeof PAGE_RPC_VERSION;
  readonly requestId: string;
  readonly handle: string;
  readonly uuid: string;
  readonly envTag: ScriptEnvTag;
  readonly api: string;
  readonly params: readonly unknown[];
  readonly runFlag: string;
};

const INTERNAL_APIS_BY_GRANT: Readonly<Record<string, readonly string[]>> = {
  "CAT.agent.conversation": ["CAT_agentConversation", "CAT_agentConversationChat", "CAT_agentAttachToConversation"],
  "CAT.agent.dom": ["CAT_agentDom"],
  "CAT.agent.model": ["CAT_agentModel"],
  "CAT.agent.opfs": ["CAT_agentOPFS", "CAT_fetchBlob"],
  "CAT.agent.skills": ["CAT_agentSkills"],
  "CAT.agent.task": ["CAT_agentTask"],
  CAT_fileStorage: ["CAT_fetchBlob", "CAT_createBlobUrl"],
  GM_xmlhttpRequest: ["CAT_createBlobUrl", "CAT_fetchBlob", "CAT_fetchDocument"],
  "GM.xmlhttpRequest": ["CAT_createBlobUrl", "CAT_fetchBlob", "CAT_fetchDocument"],
  "GM.xmlHttpRequest": ["CAT_createBlobUrl", "CAT_fetchBlob", "CAT_fetchDocument"],
};

// ScriptingRuntime does not load the GM implementation module, so mirror its small dependency graph here.
const API_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "GM.getValues": ["GM_getValues"],
  "GM.addValueChangeListener": ["GM_addValueChangeListener"],
  "GM.removeValueChangeListener": ["GM_removeValueChangeListener"],
  "GM.log": ["GM_log"],
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
  const allowed = new Set<string>();
  const visited = new Set<string>();
  const visitGrant = (grant: string): void => {
    for (const candidate of getGrantCandidates(grant)) {
      if (visited.has(candidate)) continue;
      visited.add(candidate);
      allowed.add(candidate);
      for (const api of INTERNAL_APIS_BY_GRANT[candidate] || []) allowed.add(api);
      for (const dependency of API_DEPENDENCIES[candidate] || []) visitGrant(dependency);
    }
  };
  for (const grant of grants) visitGrant(grant);
  return [...allowed];
};

export class PageRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageRpcError";
  }
}

const ownData = (value: object, key: PropertyKey): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) {
    throw new PageRpcError(`page RPC field ${String(key)} must be a data property`);
  }
  return descriptor.value;
};

const assertDataOnly = (value: unknown, seen: Set<object>): void => {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value);
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
  if (!Array.isArray(params)) throw new PageRpcError("page RPC params must be an array");
  assertDataOnly(params, new Set());
  if (!nativeStructuredClone) throw new PageRpcError("structured clone is unavailable");
  try {
    return nativeStructuredClone(params) as readonly unknown[];
  } catch {
    throw new PageRpcError("page RPC params are not cloneable");
  }
};

export class PageRpcRegistry {
  private readonly bindings = new Map<string, PageExecutionBinding>();

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
      allowedAPIs: new Set(allowedAPIs),
      runFlag,
      active: true,
    });
    return handle;
  }

  revoke(handle: string): void {
    const binding = this.bindings.get(handle);
    if (binding) binding.active = false;
  }

  revokeAll(): void {
    for (const binding of this.bindings.values()) binding.active = false;
  }

  resolve(handle: string, uuid: string, envTag: ScriptEnvTag, api: string): PageExecutionBinding {
    const binding = this.bindings.get(handle);
    if (!binding?.active) throw new PageRpcError("page execution binding is inactive");
    if (binding.uuid !== uuid || binding.envTag !== envTag) {
      throw new PageRpcError("page execution binding does not match the request");
    }
    if (!binding.allowedAPIs.has(api)) throw new PageRpcError("API is not granted to this execution");
    return binding;
  }
}

const REQUEST_KEYS = ["version", "requestId", "handle", "uuid", "envTag", "api", "params", "runFlag"] as const;

export const validatePageGMRequest = (value: unknown, registry: PageRpcRegistry): PageGMRequest => {
  if (value === null || typeof value !== "object") throw new PageRpcError("page RPC request must be an object");

  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw new PageRpcError("page RPC request cannot be inspected");
  }
  const hasRunFlag = keys.includes("runFlag");
  if (
    keys.length !== REQUEST_KEYS.length - (hasRunFlag ? 0 : 1) ||
    keys.some((key) => typeof key !== "string" || !REQUEST_KEYS.includes(key as never))
  ) {
    throw new PageRpcError("page RPC request has unexpected fields");
  }

  const version = ownData(value, "version");
  const requestId = ownData(value, "requestId");
  const handle = ownData(value, "handle");
  const uuid = ownData(value, "uuid");
  const envTag = ownData(value, "envTag");
  const api = ownData(value, "api");
  const params = ownData(value, "params");
  const suppliedRunFlag = keys.includes("runFlag") ? ownData(value, "runFlag") : undefined;

  if (version !== PAGE_RPC_VERSION) throw new PageRpcError("unsupported page RPC version");
  if (typeof requestId !== "string" || !requestId) throw new PageRpcError("page RPC requestId is invalid");
  if (typeof handle !== "string" || typeof uuid !== "string" || typeof envTag !== "string" || typeof api !== "string") {
    throw new PageRpcError("page RPC identity fields are invalid");
  }
  if (envTag !== "it" && envTag !== "ct") throw new PageRpcError("page RPC environment is invalid");
  if (suppliedRunFlag !== undefined && typeof suppliedRunFlag !== "string") {
    throw new PageRpcError("page RPC runFlag is invalid");
  }

  const binding = registry.resolve(handle, uuid, envTag, api);
  return {
    version: PAGE_RPC_VERSION,
    requestId,
    handle,
    uuid,
    envTag,
    api,
    params: cloneParams(params),
    runFlag: binding.runFlag,
  };
};
