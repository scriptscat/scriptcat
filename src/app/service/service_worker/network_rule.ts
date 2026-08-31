import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import LoggerCore from "@App/app/logger/core";
import { uuidv4 } from "@App/pkg/utils/uuid";
import {
  HEADER_OPERATIONS,
  MAX_RULE_NAME_LENGTH,
  NetworkRuleValidationError,
  DEFAULT_NETWORK_RULE_STATE,
  isDeniedRequestHeader,
  isValidHeaderName,
  validateNetworkRuleState,
  type NetworkRule,
  type NetworkRuleAction,
  type NetworkRuleCondition,
  type NetworkRuleHeaderEdit,
  type NetworkRuleState,
} from "@App/app/repo/network_rule";
import type { NetworkRuleStateDAO } from "@App/app/repo/network_rule";
import {
  NETWORK_RULE_REQUEST_METHODS,
  NETWORK_RULE_RESOURCE_TYPES,
  RuleDomainError,
  normalizeRuleDomain,
  type NetworkRuleRequestMethod,
  type NetworkRuleResourceType,
} from "@App/pkg/utils/network_rule_condition";
import { type NetworkRuleApplier, compileNetworkRules } from "./network_rule_compiler";

export type { NetworkRuleApplier } from "./network_rule_compiler";

export type NetworkRuleCreateInput = {
  baseRevision: number;
  name?: string;
  enabled: boolean;
  condition: NetworkRuleCondition;
  action: NetworkRuleAction;
};
export type NetworkRuleUpdateInput = {
  baseRevision: number;
  id: string;
  patch: Partial<Pick<NetworkRule, "name" | "condition" | "action">>;
};
export type NetworkRuleEnabledInput = { baseRevision: number; ids: string[]; enabled: boolean };
export type NetworkRuleDeleteInput = { baseRevision: number; ids: string[] };
export type NetworkRuleMasterEnabledInput = { baseRevision: number; enabled: boolean };
export type NetworkRuleReorderInput = { baseRevision: number; order: string[] };

export type NetworkRuleApplyStatus =
  | { state: "applied"; revision: number; appliedAt: number }
  | {
      state: "error";
      code: "dnr_apply_failed";
      desiredRevision: number;
      lastAppliedRevision?: number;
      message: string;
    };

export type NetworkRuleSnapshot = { state: NetworkRuleState; apply: NetworkRuleApplyStatus };
export type NetworkRuleMutationResult = NetworkRuleSnapshot & { outcome: "applied" | "apply-error" };

export type NetworkRuleServiceErrorCode =
  | "invalid_input"
  | "not_found"
  | "revision_conflict"
  | "storage_read_failed"
  | "storage_write_failed"
  | "unsupported_schema";

export type NetworkRuleServiceError = {
  code: NetworkRuleServiceErrorCode;
  path?: string;
  messageKey?: string;
  snapshot?: NetworkRuleSnapshot;
};

function serviceError(
  code: NetworkRuleServiceErrorCode,
  details: Omit<NetworkRuleServiceError, "code"> = {}
): NetworkRuleServiceError {
  return { code, ...details };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 派生名同样要落在名称上限内，否则一条没填名字的长匹配式规则会在结构校验处被整条拒绝。 */
function defaultRuleName(condition: NetworkRuleCondition): string {
  const domains = condition.requestDomains;
  const derived = domains?.length
    ? `${domains[0]}${domains.length > 1 ? ` + ${domains.length - 1}` : ""}`
    : condition.urlFilter!;
  return Array.from(derived).slice(0, MAX_RULE_NAME_LENGTH).join("");
}

function normalizeRuleName(name: unknown, condition: NetworkRuleCondition, path: string): string {
  if (name === undefined || (typeof name === "string" && name.trim() === "")) return defaultRuleName(condition);
  if (typeof name !== "string" || Array.from(name.trim()).length > MAX_RULE_NAME_LENGTH) {
    throw serviceError("invalid_input", { path, messageKey: "rule_name_invalid" });
  }
  return name.trim();
}

function normalizeDomainList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw serviceError("invalid_input", { path, messageKey: "domain_required" });
  }
  const domains: string[] = [];
  for (const [index, domain] of value.entries()) {
    try {
      if (typeof domain !== "string") throw new RuleDomainError("domain_invalid");
      const normalized = normalizeRuleDomain(domain);
      if (!domains.includes(normalized)) domains.push(normalized);
    } catch (error) {
      const messageKey = error instanceof RuleDomainError ? error.messageKey : "domain_invalid";
      throw serviceError("invalid_input", { path: `${path}[${index}]`, messageKey });
    }
  }
  return domains;
}

function normalizeEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  messageKey: string
): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw serviceError("invalid_input", { path, messageKey });
  }
  const items: T[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !allowed.includes(item as T)) {
      throw serviceError("invalid_input", { path: `${path}[${index}]`, messageKey });
    }
    if (!items.includes(item as T)) items.push(item as T);
  }
  return items;
}

function normalizeCondition(condition: unknown, path: string): NetworkRuleCondition {
  if (!condition || typeof condition !== "object") {
    throw serviceError("invalid_input", { path, messageKey: "condition_invalid" });
  }
  const input = condition as Record<string, unknown>;
  const normalized: NetworkRuleCondition = {};

  if (input.urlFilter !== undefined) {
    const urlFilter = typeof input.urlFilter === "string" ? input.urlFilter.trim() : "";
    if (!urlFilter || /\s/.test(urlFilter)) {
      throw serviceError("invalid_input", { path: `${path}.urlFilter`, messageKey: "url_filter_invalid" });
    }
    normalized.urlFilter = urlFilter;
  }
  for (const key of [
    "requestDomains",
    "excludedRequestDomains",
    "initiatorDomains",
    "excludedInitiatorDomains",
  ] as const) {
    if (input[key] !== undefined) normalized[key] = normalizeDomainList(input[key], `${path}.${key}`);
  }
  if (normalized.urlFilter === undefined && normalized.requestDomains === undefined) {
    throw serviceError("invalid_input", { path, messageKey: "condition_match_required" });
  }
  if (input.resourceTypes !== undefined) {
    normalized.resourceTypes = normalizeEnumList<NetworkRuleResourceType>(
      input.resourceTypes,
      NETWORK_RULE_RESOURCE_TYPES,
      `${path}.resourceTypes`,
      "resource_type_invalid"
    );
  }
  if (input.requestMethods !== undefined) {
    normalized.requestMethods = normalizeEnumList<NetworkRuleRequestMethod>(
      input.requestMethods,
      NETWORK_RULE_REQUEST_METHODS,
      `${path}.requestMethods`,
      "request_method_invalid"
    );
  }
  return normalized;
}

function normalizeHeaderName(value: unknown, path: string): string {
  const header = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isValidHeaderName(header)) {
    throw serviceError("invalid_input", { path, messageKey: "header_name_invalid" });
  }
  return header;
}

function normalizeHeaderEdits(value: unknown, path: string, denyRequestHeaders: boolean): NetworkRuleHeaderEdit[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw serviceError("invalid_input", { path, messageKey: "header_count_invalid" });
  }
  return value.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!entry || typeof entry !== "object") {
      throw serviceError("invalid_input", { path: itemPath, messageKey: "header_name_invalid" });
    }
    const input = entry as Record<string, unknown>;
    const header = normalizeHeaderName(input.header, itemPath);
    if (denyRequestHeaders && isDeniedRequestHeader(header)) {
      throw serviceError("invalid_input", { path: itemPath, messageKey: "header_forbidden" });
    }
    const operation = input.operation;
    if (typeof operation !== "string" || !HEADER_OPERATIONS.includes(operation as never)) {
      throw serviceError("invalid_input", { path: `${itemPath}.operation`, messageKey: "header_operation_invalid" });
    }
    if (operation === "remove") {
      if (input.value !== undefined) {
        throw serviceError("invalid_input", { path: `${itemPath}.value`, messageKey: "header_value_invalid" });
      }
      return { header, operation: "remove" as const };
    }
    if (typeof input.value !== "string" || !input.value) {
      throw serviceError("invalid_input", { path: `${itemPath}.value`, messageKey: "header_value_required" });
    }
    return { header, operation: operation as "set" | "append", value: input.value };
  });
}

function normalizeAction(action: unknown, path: string): NetworkRuleAction {
  if (!action || typeof action !== "object") {
    throw serviceError("invalid_input", { path, messageKey: "action_invalid" });
  }
  const input = action as Record<string, unknown>;
  switch (input.type) {
    case "removeResponseHeaders": {
      if (!Array.isArray(input.headers) || input.headers.length === 0) {
        throw serviceError("invalid_input", { path: `${path}.headers`, messageKey: "header_count_invalid" });
      }
      const headers: string[] = [];
      for (const [index, header] of input.headers.entries()) {
        const normalized = normalizeHeaderName(header, `${path}.headers[${index}]`);
        if (!headers.includes(normalized)) headers.push(normalized);
      }
      return { type: "removeResponseHeaders", headers };
    }
    case "modifyRequestHeaders":
      return { type: "modifyRequestHeaders", headers: normalizeHeaderEdits(input.headers, `${path}.headers`, true) };
    case "modifyResponseHeaders":
      return { type: "modifyResponseHeaders", headers: normalizeHeaderEdits(input.headers, `${path}.headers`, false) };
    case "block":
      return { type: "block" };
    case "allow":
      return { type: "allow" };
    case "redirect": {
      const url = typeof input.url === "string" ? input.url.trim() : "";
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw serviceError("invalid_input", { path: `${path}.url`, messageKey: "redirect_url_invalid" });
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw serviceError("invalid_input", { path: `${path}.url`, messageKey: "redirect_url_invalid" });
      }
      return { type: "redirect", url };
    }
    default:
      throw serviceError("invalid_input", { path, messageKey: "action_invalid" });
  }
}

/** 批量操作是全体或全不：任何一个 ID 不成立都在写入前整批拒绝。 */
function resolveRuleIds(current: NetworkRuleState, value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length === 0) {
    throw serviceError("invalid_input", { path: "ids", messageKey: "rule_ids_invalid" });
  }
  const known = new Set(current.rules.map((rule) => rule.id));
  const ids = new Set<string>();
  for (const [index, id] of value.entries()) {
    if (typeof id !== "string") {
      throw serviceError("invalid_input", { path: `ids[${index}]`, messageKey: "rule_ids_invalid" });
    }
    if (!known.has(id)) {
      throw serviceError("not_found", { path: `ids[${index}]`, messageKey: "rule_not_found" });
    }
    ids.add(id);
  }
  return ids;
}

function validateBaseRevision(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw serviceError("invalid_input", { path: "baseRevision", messageKey: "revision_invalid" });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "DNR update failed";
}

export class NetworkRuleService {
  private readonly logger = LoggerCore.getInstance().logger({ service: "networkRuleService" });
  private confirmedState: NetworkRuleState | undefined;
  private applyStatus: NetworkRuleApplyStatus | undefined;
  private ready: Promise<void> = Promise.resolve();
  private mutationQueue: Promise<void> = Promise.resolve();
  private initializationError: NetworkRuleServiceError | undefined;

  constructor(
    private readonly group: Group,
    private readonly messageQueue: IMessageQueue,
    private readonly stateDAO: NetworkRuleStateDAO,
    private readonly compiler: typeof compileNetworkRules = compileNetworkRules,
    private readonly applier: NetworkRuleApplier
  ) {}

  init() {
    this.group.on("getState", () => this.getState());
    this.group.on("createRule", (input: NetworkRuleCreateInput) => this.createRule(input));
    this.group.on("updateRule", (input: NetworkRuleUpdateInput) => this.updateRule(input));
    this.group.on("deleteRules", (input: NetworkRuleDeleteInput) => this.deleteRules(input));
    this.group.on("setRulesEnabled", (input: NetworkRuleEnabledInput) => this.setRulesEnabled(input));
    this.group.on("setMasterEnabled", (input: NetworkRuleMasterEnabledInput) => this.setMasterEnabled(input));
    this.group.on("reorderRules", (input: NetworkRuleReorderInput) => this.reorderRules(input));
    this.group.on("retryApply", () => this.retryApply());
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    let state: NetworkRuleState;
    try {
      state = (await this.stateDAO.getState()) ?? { ...DEFAULT_NETWORK_RULE_STATE, rules: [], order: [] };
      validateNetworkRuleState(state);
    } catch (error) {
      if (error instanceof NetworkRuleValidationError) {
        try {
          await this.applier.apply([]);
        } catch {
          // 清理失败时保留原数据，并让 retryApply 重新执行清理。
        }
        this.initializationError = serviceError("unsupported_schema", {
          path: error.path,
          messageKey: error.messageKey,
        });
      } else {
        // getState 是纯读取路径，非预期异常同样属于读失败。
        this.initializationError = serviceError("storage_read_failed");
      }
      return;
    }
    this.confirmedState = state;
    await this.reconcile(state);
    // 放在最后清空：恢复期间 confirmedState / applyStatus 尚未双双就绪，此时并发的 getState
    // 应当继续看到上一次的失败原因，而不是「无错误也无快照」的中间态。
    this.initializationError = undefined;
  }

  private async waitUntilReady(): Promise<void> {
    await this.ready;
    if (this.initializationError) throw this.initializationError;
  }

  private snapshot(): NetworkRuleSnapshot {
    if (!this.confirmedState || !this.applyStatus) throw serviceError("storage_write_failed");
    return { state: this.confirmedState, apply: this.applyStatus };
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(() => this.stateDAO.runExclusive(operation));
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async reconcile(state: NetworkRuleState): Promise<NetworkRuleApplyStatus> {
    try {
      await this.applier.apply(this.compiler(state));
      const applied: NetworkRuleApplyStatus = { state: "applied", revision: state.revision, appliedAt: Date.now() };
      this.applyStatus = applied;
      return applied;
    } catch (error) {
      const previous = this.applyStatus;
      const failed: NetworkRuleApplyStatus = {
        state: "error",
        code: "dnr_apply_failed",
        desiredRevision: state.revision,
        lastAppliedRevision: previous?.state === "applied" ? previous.revision : previous?.lastAppliedRevision,
        message: errorMessage(error),
      };
      this.applyStatus = failed;
      return failed;
    }
  }

  private async getState(): Promise<NetworkRuleSnapshot> {
    await this.waitUntilReady();
    return this.snapshot();
  }

  private async currentForMutation(baseRevision: unknown): Promise<NetworkRuleState> {
    await this.waitUntilReady();
    validateBaseRevision(baseRevision);
    let persisted: NetworkRuleState | undefined;
    try {
      persisted = await this.stateDAO.getState();
      if (persisted) validateNetworkRuleState(persisted);
    } catch (error) {
      if (error instanceof NetworkRuleValidationError) {
        throw serviceError("unsupported_schema", { path: error.path, messageKey: error.messageKey });
      }
      throw serviceError("storage_read_failed");
    }
    if (persisted) this.confirmedState = persisted;
    const current = this.confirmedState!;
    if (baseRevision !== current.revision) {
      throw serviceError("revision_conflict", { snapshot: this.snapshot() });
    }
    return current;
  }

  private async saveAndApply(state: NetworkRuleState): Promise<NetworkRuleMutationResult> {
    try {
      await this.stateDAO.saveState(state);
    } catch (error) {
      if (error instanceof NetworkRuleValidationError) {
        throw serviceError("storage_write_failed", { path: error.path, messageKey: error.messageKey });
      }
      throw serviceError("storage_write_failed");
    }
    this.confirmedState = state;
    const apply = await this.reconcile(state);
    const snapshot = this.snapshot();
    this.publishStateChanged(snapshot);
    return { ...snapshot, outcome: apply.state === "applied" ? "applied" : "apply-error" };
  }

  private publishStateChanged(snapshot: NetworkRuleSnapshot): void {
    try {
      this.messageQueue.publish("networkRule/stateChanged", snapshot);
    } catch (error) {
      this.logger.warn("发布网络规则状态失败", { error: String(error) });
    }
  }

  private unchanged(): NetworkRuleMutationResult {
    return { ...this.snapshot(), outcome: this.applyStatus?.state === "applied" ? "applied" : "apply-error" };
  }

  private saveValidated(state: NetworkRuleState): Promise<NetworkRuleMutationResult> {
    try {
      validateNetworkRuleState(state);
    } catch (error) {
      if (error instanceof NetworkRuleValidationError) {
        throw serviceError("invalid_input", { path: error.path, messageKey: error.messageKey });
      }
      throw error;
    }
    return this.saveAndApply(state);
  }

  private async createRule(input: NetworkRuleCreateInput): Promise<NetworkRuleMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      if (typeof input?.enabled !== "boolean") {
        throw serviceError("invalid_input", { path: "enabled", messageKey: "boolean_invalid" });
      }
      const condition = normalizeCondition(input.condition, "condition");
      const action = normalizeAction(input.action, "action");
      const name = normalizeRuleName(input.name, condition, "name");
      const now = Date.now();
      const rule: NetworkRule = {
        id: uuidv4(),
        name,
        enabled: input.enabled,
        condition,
        action,
        createdAt: now,
        updatedAt: now,
      };
      return this.saveValidated({
        ...current,
        revision: current.revision + 1,
        rules: [...current.rules, rule],
        order: [...current.order, rule.id],
      });
    });
  }

  private async updateRule(input: NetworkRuleUpdateInput): Promise<NetworkRuleMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      const index = current.rules.findIndex((rule) => rule.id === input?.id);
      if (index < 0) throw serviceError("not_found", { path: "id", messageKey: "rule_not_found" });
      const patch = input.patch;
      if (!patch || Object.keys(patch).length === 0) {
        throw serviceError("invalid_input", { path: "patch", messageKey: "patch_empty" });
      }
      for (const key of Object.keys(patch)) {
        if (key !== "name" && key !== "condition" && key !== "action") {
          throw serviceError("invalid_input", { path: `patch.${key}`, messageKey: "patch_field_invalid" });
        }
      }
      const oldRule = current.rules[index];
      const condition =
        patch.condition === undefined ? oldRule.condition : normalizeCondition(patch.condition, "patch.condition");
      const action = patch.action === undefined ? oldRule.action : normalizeAction(patch.action, "patch.action");
      const name = normalizeRuleName(patch.name === undefined ? oldRule.name : patch.name, condition, "patch.name");
      if (name === oldRule.name && sameValue(condition, oldRule.condition) && sameValue(action, oldRule.action)) {
        return this.unchanged();
      }
      const rules = [...current.rules];
      rules[index] = { ...oldRule, name, condition, action, updatedAt: Date.now() };
      return this.saveValidated({ ...current, revision: current.revision + 1, rules });
    });
  }

  private async deleteRules(input: NetworkRuleDeleteInput): Promise<NetworkRuleMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      const ids = resolveRuleIds(current, input?.ids);
      // 顺序数组与规则集在同一次写入里裁剪，删完不会留下指向已删规则的顺序项。
      return this.saveAndApply({
        ...current,
        revision: current.revision + 1,
        rules: current.rules.filter((rule) => !ids.has(rule.id)),
        order: current.order.filter((id) => !ids.has(id)),
      });
    });
  }

  private async setRulesEnabled(input: NetworkRuleEnabledInput): Promise<NetworkRuleMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      const ids = resolveRuleIds(current, input?.ids);
      if (typeof input.enabled !== "boolean") {
        throw serviceError("invalid_input", { path: "enabled", messageKey: "boolean_invalid" });
      }
      const changing = current.rules.filter((rule) => ids.has(rule.id) && rule.enabled !== input.enabled);
      if (changing.length === 0) return this.unchanged();
      const changed = new Set(changing.map((rule) => rule.id));
      const updatedAt = Date.now();
      const rules = current.rules.map((rule) =>
        changed.has(rule.id) ? { ...rule, enabled: input.enabled, updatedAt } : rule
      );
      return this.saveAndApply({ ...current, revision: current.revision + 1, rules });
    });
  }

  private async setMasterEnabled(input: NetworkRuleMasterEnabledInput): Promise<NetworkRuleMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      if (typeof input.enabled !== "boolean") {
        throw serviceError("invalid_input", { path: "enabled", messageKey: "boolean_invalid" });
      }
      if (current.masterEnabled === input.enabled) return this.unchanged();
      return this.saveAndApply({ ...current, masterEnabled: input.enabled, revision: current.revision + 1 });
    });
  }

  private async reorderRules(input: NetworkRuleReorderInput): Promise<NetworkRuleMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      const order = input?.order;
      if (!Array.isArray(order) || order.length !== current.order.length) {
        throw serviceError("invalid_input", { path: "order", messageKey: "order_invalid" });
      }
      const known = new Set(current.order);
      const seen = new Set<string>();
      for (const [index, id] of order.entries()) {
        if (typeof id !== "string" || !known.has(id) || seen.has(id)) {
          throw serviceError("invalid_input", { path: `order[${index}]`, messageKey: "order_invalid" });
        }
        seen.add(id);
      }
      if (sameValue(order, current.order)) return this.unchanged();
      return this.saveAndApply({ ...current, revision: current.revision + 1, order: [...order] });
    });
  }

  private async retryApply(): Promise<NetworkRuleMutationResult> {
    return this.enqueue(async () => {
      const recoveringInitialization = this.initializationError !== undefined;
      // 重新初始化必须换掉 ready，否则并发的 getState 会越过一个早已 settle 的旧 ready。
      if (recoveringInitialization) this.ready = this.initialize();
      await this.waitUntilReady();
      const state = this.confirmedState!;
      const apply = recoveringInitialization ? this.applyStatus! : await this.reconcile(state);
      const snapshot = this.snapshot();
      this.publishStateChanged(snapshot);
      return { ...snapshot, outcome: apply.state === "applied" ? "applied" : "apply-error" };
    });
  }
}
