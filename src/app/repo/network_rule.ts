import {
  MAX_RULE_DOMAINS,
  NETWORK_RULE_REQUEST_METHODS,
  NETWORK_RULE_RESOURCE_TYPES,
  normalizeRuleDomain,
  type NetworkRuleRequestMethod,
  type NetworkRuleResourceType,
} from "@App/pkg/utils/network_rule_condition";
import { MAX_USER_RULES } from "@App/app/service/service_worker/dnr_rule_ids";
import { Repo } from "./repo";

export const NETWORK_RULE_SCHEMA_VERSION = 1 as const;
export const MAX_RULE_HEADERS = 32;
export const MAX_RULE_NAME_LENGTH = 80;

/** DNR `RuleCondition` 的受控子集：匹配式（域名列表或 URL 匹配式）、排除项、资源类型、请求方法、发起方域名。 */
export type NetworkRuleCondition = {
  requestDomains?: string[];
  urlFilter?: string;
  excludedRequestDomains?: string[];
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
  /** 留空表示不限资源类型；编译时展开为含 main_frame 的全部类型，而不是沿用 DNR「除主文档外」的默认。 */
  resourceTypes?: NetworkRuleResourceType[];
  requestMethods?: NetworkRuleRequestMethod[];
};

export const HEADER_OPERATIONS = ["set", "append", "remove"] as const;
export type NetworkRuleHeaderOperation = (typeof HEADER_OPERATIONS)[number];

export type NetworkRuleHeaderEdit = {
  header: string;
  operation: NetworkRuleHeaderOperation;
  value?: string;
};

export type NetworkRuleAction =
  | { type: "removeResponseHeaders"; headers: string[] }
  | { type: "modifyRequestHeaders"; headers: NetworkRuleHeaderEdit[] }
  | { type: "modifyResponseHeaders"; headers: NetworkRuleHeaderEdit[] }
  | { type: "block" }
  | { type: "redirect"; url: string }
  | { type: "allow" };

export type NetworkRuleActionType = NetworkRuleAction["type"];

/**
 * 改写这些请求头会直接泄露或伪造调用者身份，一律在校验阶段拒绝。
 * 与 GM_xhr 强制过滤 cookie 的既有口径一致（gm_api/gm_api.ts）。
 */
export const REQUEST_HEADER_DENYLIST = ["cookie", "authorization", "host", "origin"];

/** 「移除 CSP」预设：固定四个 CSP 响应头，X-Frame-Options 可选附带。 */
export const CSP_RESPONSE_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-content-security-policy",
  "x-webkit-csp",
];
export const X_FRAME_OPTIONS_HEADER = "x-frame-options";

export function cspRemovalAction(includeXFrameOptions = false): NetworkRuleAction {
  return {
    type: "removeResponseHeaders",
    headers: includeXFrameOptions ? [...CSP_RESPONSE_HEADERS, X_FRAME_OPTIONS_HEADER] : [...CSP_RESPONSE_HEADERS],
  };
}

export type NetworkRule = {
  id: string;
  name: string;
  enabled: boolean;
  condition: NetworkRuleCondition;
  action: NetworkRuleAction;
  createdAt: number;
  updatedAt: number;
};

export type NetworkRuleState = {
  schemaVersion: typeof NETWORK_RULE_SCHEMA_VERSION;
  revision: number;
  masterEnabled: boolean;
  rules: NetworkRule[];
  /** 规则 ID 的完整排列，自上而下即优先级自高到低。 */
  order: string[];
};

export class NetworkRuleValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly messageKey: string
  ) {
    super(messageKey);
    this.name = "NetworkRuleValidationError";
  }
}

export class NetworkRuleStorageError extends Error {
  constructor() {
    super("storage_write_failed");
    this.name = "NetworkRuleStorageError";
  }
}

export class NetworkRuleStorageReadError extends Error {
  constructor(message = "storage_read_failed") {
    super(message);
    this.name = "NetworkRuleStorageReadError";
  }
}

export const DEFAULT_NETWORK_RULE_STATE: NetworkRuleState = {
  schemaVersion: NETWORK_RULE_SCHEMA_VERSION,
  revision: 0,
  masterEnabled: true,
  rules: [],
  order: [],
};

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isValidHeaderName(value: unknown): value is string {
  return typeof value === "string" && HEADER_NAME_PATTERN.test(value) && value === value.toLowerCase();
}

export function isDeniedRequestHeader(header: string): boolean {
  return REQUEST_HEADER_DENYLIST.includes(header.trim().toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateDomainList(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RULE_DOMAINS) {
    throw new NetworkRuleValidationError(path, "domain_count_invalid");
  }
  const seen = new Set<string>();
  for (const [index, domain] of value.entries()) {
    let normalized: string;
    try {
      normalized = typeof domain === "string" ? normalizeRuleDomain(domain) : "";
    } catch {
      throw new NetworkRuleValidationError(`${path}[${index}]`, "domain_invalid");
    }
    if (normalized !== domain) throw new NetworkRuleValidationError(`${path}[${index}]`, "domain_invalid");
    if (seen.has(normalized)) throw new NetworkRuleValidationError(`${path}[${index}]`, "domain_duplicate");
    seen.add(normalized);
  }
}

function validateEnumList(value: unknown, allowed: readonly string[], path: string, messageKey: string): void {
  if (!Array.isArray(value) || value.length === 0) throw new NetworkRuleValidationError(path, messageKey);
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !allowed.includes(item) || seen.has(item)) {
      throw new NetworkRuleValidationError(`${path}[${index}]`, messageKey);
    }
    seen.add(item);
  }
}

function validateCondition(condition: unknown, path: string): void {
  if (!isRecord(condition)) throw new NetworkRuleValidationError(path, "condition_invalid");
  const hasDomains = condition.requestDomains !== undefined;
  const hasUrlFilter = condition.urlFilter !== undefined;
  if (!hasDomains && !hasUrlFilter) throw new NetworkRuleValidationError(path, "condition_match_required");
  if (hasUrlFilter) {
    const urlFilter = condition.urlFilter;
    if (typeof urlFilter !== "string" || !urlFilter.trim() || /[\s]/.test(urlFilter)) {
      throw new NetworkRuleValidationError(`${path}.urlFilter`, "url_filter_invalid");
    }
  }
  for (const key of ["requestDomains", "excludedRequestDomains", "initiatorDomains", "excludedInitiatorDomains"]) {
    if (condition[key] !== undefined) validateDomainList(condition[key], `${path}.${key}`);
  }
  if (condition.resourceTypes !== undefined) {
    validateEnumList(
      condition.resourceTypes,
      NETWORK_RULE_RESOURCE_TYPES,
      `${path}.resourceTypes`,
      "resource_type_invalid"
    );
  }
  if (condition.requestMethods !== undefined) {
    validateEnumList(
      condition.requestMethods,
      NETWORK_RULE_REQUEST_METHODS,
      `${path}.requestMethods`,
      "request_method_invalid"
    );
  }
}

function validateHeaderNames(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RULE_HEADERS) {
    throw new NetworkRuleValidationError(path, "header_count_invalid");
  }
  const seen = new Set<string>();
  for (const [index, header] of value.entries()) {
    if (!isValidHeaderName(header)) throw new NetworkRuleValidationError(`${path}[${index}]`, "header_name_invalid");
    if (seen.has(header)) throw new NetworkRuleValidationError(`${path}[${index}]`, "header_duplicate");
    seen.add(header);
  }
}

function validateHeaderEdits(value: unknown, path: string, denyRequestHeaders: boolean): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RULE_HEADERS) {
    throw new NetworkRuleValidationError(path, "header_count_invalid");
  }
  for (const [index, entry] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry) || !isValidHeaderName(entry.header)) {
      throw new NetworkRuleValidationError(itemPath, "header_name_invalid");
    }
    if (denyRequestHeaders && isDeniedRequestHeader(entry.header)) {
      throw new NetworkRuleValidationError(itemPath, "header_forbidden");
    }
    if (typeof entry.operation !== "string" || !HEADER_OPERATIONS.includes(entry.operation as never)) {
      throw new NetworkRuleValidationError(`${itemPath}.operation`, "header_operation_invalid");
    }
    if (entry.operation === "remove") {
      if (entry.value !== undefined) throw new NetworkRuleValidationError(`${itemPath}.value`, "header_value_invalid");
    } else if (typeof entry.value !== "string" || !entry.value) {
      throw new NetworkRuleValidationError(`${itemPath}.value`, "header_value_required");
    }
  }
}

function validateAction(action: unknown, path: string): void {
  if (!isRecord(action)) throw new NetworkRuleValidationError(path, "action_invalid");
  switch (action.type) {
    case "removeResponseHeaders":
      validateHeaderNames(action.headers, `${path}.headers`);
      return;
    case "modifyRequestHeaders":
      validateHeaderEdits(action.headers, `${path}.headers`, true);
      return;
    case "modifyResponseHeaders":
      validateHeaderEdits(action.headers, `${path}.headers`, false);
      return;
    case "block":
    case "allow":
      return;
    case "redirect": {
      if (typeof action.url !== "string") throw new NetworkRuleValidationError(`${path}.url`, "redirect_url_invalid");
      let url: URL;
      try {
        url = new URL(action.url);
      } catch {
        throw new NetworkRuleValidationError(`${path}.url`, "redirect_url_invalid");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new NetworkRuleValidationError(`${path}.url`, "redirect_url_invalid");
      }
      return;
    }
    default:
      throw new NetworkRuleValidationError(path, "action_invalid");
  }
}

function validateTimestamp(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new NetworkRuleValidationError(path, "timestamp_invalid");
  }
}

export function validateNetworkRuleState(value: unknown): asserts value is NetworkRuleState {
  if (!isRecord(value) || value.schemaVersion !== NETWORK_RULE_SCHEMA_VERSION) {
    throw new NetworkRuleValidationError("schemaVersion", "unsupported_schema");
  }
  const { revision, masterEnabled, rules, order } = value;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    throw new NetworkRuleValidationError("revision", "revision_invalid");
  }
  if (typeof masterEnabled !== "boolean") {
    throw new NetworkRuleValidationError("masterEnabled", "boolean_invalid");
  }
  if (!Array.isArray(rules) || rules.length > MAX_USER_RULES) {
    throw new NetworkRuleValidationError("rules", "rule_count_invalid");
  }

  const ids = new Set<string>();
  for (const [index, rawRule] of rules.entries()) {
    const path = `rules[${index}]`;
    if (!isRecord(rawRule)) throw new NetworkRuleValidationError(path, "rule_invalid");
    if (typeof rawRule.id !== "string" || !rawRule.id || ids.has(rawRule.id)) {
      throw new NetworkRuleValidationError(`${path}.id`, "rule_id_invalid");
    }
    ids.add(rawRule.id);
    if (
      typeof rawRule.name !== "string" ||
      !rawRule.name.trim() ||
      Array.from(rawRule.name).length > MAX_RULE_NAME_LENGTH
    ) {
      throw new NetworkRuleValidationError(`${path}.name`, "rule_name_invalid");
    }
    if (typeof rawRule.enabled !== "boolean")
      throw new NetworkRuleValidationError(`${path}.enabled`, "boolean_invalid");
    validateTimestamp(rawRule.createdAt, `${path}.createdAt`);
    validateTimestamp(rawRule.updatedAt, `${path}.updatedAt`);
    validateCondition(rawRule.condition, `${path}.condition`);
    validateAction(rawRule.action, `${path}.action`);
  }

  if (!Array.isArray(order) || order.length !== ids.size) {
    throw new NetworkRuleValidationError("order", "order_invalid");
  }
  const ordered = new Set<string>();
  for (const [index, id] of order.entries()) {
    if (typeof id !== "string" || !ids.has(id) || ordered.has(id)) {
      throw new NetworkRuleValidationError(`order[${index}]`, "order_invalid");
    }
    ordered.add(id);
  }
}

export class NetworkRuleStateDAO extends Repo<NetworkRuleState> {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor() {
    super("network_rule");
  }

  getState(): Promise<NetworkRuleState | undefined> {
    const key = this.joinKey("state");
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new NetworkRuleStorageReadError(lastError.message));
          return;
        }
        resolve(result[key] as NetworkRuleState | undefined);
      });
    });
  }

  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation);
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  // 不做写后回读自证：chrome.storage.local 的真实失败（配额、IO）都经 runtime.lastError 变成 _save 的
  // 拒绝，而回读只能看到序列化后的等价副本——真实浏览器里它的键序与写入时不同，回读比较反而把成功的
  // 写入判成失败（见 PR #1598 继承的 csp_rule.ts）。
  async saveState(state: NetworkRuleState): Promise<void> {
    validateNetworkRuleState(state);
    try {
      await this._save("state", state);
    } catch {
      throw new NetworkRuleStorageError();
    }
  }
}
