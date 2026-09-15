import type {
  NetworkRule,
  NetworkRuleAction,
  NetworkRuleCondition,
  NetworkRuleState,
} from "@App/app/repo/network_rule";
import {
  MAX_RULE_DOMAINS,
  NETWORK_RULE_RESOURCE_TYPES,
  normalizeRuleDomain,
} from "@App/pkg/utils/network_rule_condition";
import { USER_RULE_ID_MIN, isUserRuleId } from "./dnr_rule_ids";

type CompiledCandidate = {
  priority: number;
  sourceActionType: NetworkRuleAction["type"];
  action: chrome.declarativeNetRequest.RuleAction;
  condition: chrome.declarativeNetRequest.RuleCondition;
};

const SET_LIKE_CONDITION_KEYS = new Set([
  "excludedInitiatorDomains",
  "excludedRequestDomains",
  "initiatorDomains",
  "requestDomains",
  "requestMethods",
  "resourceTypes",
]);

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    if (!SET_LIKE_CONDITION_KEYS.has(key ?? "")) return items;
    return [...new Map(items.map((item) => [stableSerialize(item), item])).values()].sort((left, right) =>
      stableSerialize(left).localeCompare(stableSerialize(right))
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entryKey, item]) => [entryKey, canonicalize(item, entryKey)])
    );
  }
  return value;
}

function canonicalizeRemoveAction(action: chrome.declarativeNetRequest.RuleAction) {
  if (action.type !== "modifyHeaders" || !action.responseHeaders) return action;
  return {
    type: action.type,
    responseHeaders: action.responseHeaders
      .map(({ header }) => ({
        header: header.toLowerCase(),
        operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
      }))
      .sort((left, right) => left.header.localeCompare(right.header)),
  };
}

function isPureResponseHeaderRemoval(candidate: CompiledCandidate): boolean {
  if (candidate.sourceActionType !== "removeResponseHeaders" || candidate.action.type !== "modifyHeaders") {
    return false;
  }
  const responseHeaders = candidate.action.responseHeaders;
  return (
    responseHeaders !== undefined &&
    responseHeaders.length > 0 &&
    responseHeaders.every((header) => header.operation === "remove")
  );
}

function getMergeSignature(candidate: CompiledCandidate): string | undefined {
  if (!isPureResponseHeaderRemoval(candidate) || !candidate.condition.requestDomains?.length) return undefined;
  const { requestDomains: _requestDomains, ...conditionWithoutDomains } = candidate.condition;
  return stableSerialize({
    action: canonicalizeRemoveAction(candidate.action),
    condition: conditionWithoutDomains,
  });
}

function minimizeRequestDomains(domains: string[]): string[] {
  const normalized = [...new Set(domains.map((domain) => normalizeRuleDomain(domain)))].sort();
  return normalized.filter(
    (domain) =>
      !normalized.some(
        (parent) =>
          parent !== domain && !isIpLikeDomain(domain) && !isIpLikeDomain(parent) && domain.endsWith(`.${parent}`)
      )
  );
}

function isIpLikeDomain(domain: string): boolean {
  return domain.startsWith("[") || domain.split(".").every((label) => /^\d+$/.test(label));
}

function compactRun(run: CompiledCandidate[]): CompiledCandidate[] {
  if (run.length < 2) return run;
  const first = run[0];
  const domains = minimizeRequestDomains(run.flatMap((candidate) => candidate.condition.requestDomains ?? []));
  const action = canonicalizeRemoveAction(first.action);
  const compacted: CompiledCandidate[] = [];
  for (let start = 0; start < domains.length; start += MAX_RULE_DOMAINS) {
    compacted.push({
      ...first,
      action,
      condition: {
        ...first.condition,
        requestDomains: domains.slice(start, start + MAX_RULE_DOMAINS),
      },
    });
  }
  return compacted;
}

function compactEligibleRuns(candidates: CompiledCandidate[]): CompiledCandidate[] {
  const compacted: CompiledCandidate[] = [];
  let run: CompiledCandidate[] = [];
  let signature: string | undefined;

  const flush = () => {
    compacted.push(...compactRun(run));
    run = [];
    signature = undefined;
  };

  for (const candidate of candidates) {
    const candidateSignature = getMergeSignature(candidate);
    if (candidateSignature === undefined) {
      flush();
      compacted.push(candidate);
      continue;
    }
    if (signature !== candidateSignature) flush();
    signature = candidateSignature;
    run.push(candidate);
  }
  flush();
  return compacted;
}

function compileCondition(condition: NetworkRuleCondition): chrome.declarativeNetRequest.RuleCondition {
  const compiled: chrome.declarativeNetRequest.RuleCondition = {};
  if (condition.urlFilter !== undefined) compiled.urlFilter = condition.urlFilter;
  if (condition.requestDomains) compiled.requestDomains = [...condition.requestDomains];
  if (condition.excludedRequestDomains) compiled.excludedRequestDomains = [...condition.excludedRequestDomains];
  if (condition.initiatorDomains) compiled.initiatorDomains = [...condition.initiatorDomains];
  if (condition.excludedInitiatorDomains) compiled.excludedInitiatorDomains = [...condition.excludedInitiatorDomains];
  // DNR 自身的默认是「除 main_frame 外的全部资源类型」，会让「移除 CSP」「屏蔽请求」这类面向页面
  // 本身的规则对导航无效（运行时验证已观察到）。资源类型又位于默认折叠的高级区，因此未显式选择时
  // 在这里把受控集合列全：用户选了什么就编译成什么，没选则连主文档一起覆盖。
  compiled.resourceTypes = [
    ...(condition.resourceTypes ?? NETWORK_RULE_RESOURCE_TYPES),
  ] as chrome.declarativeNetRequest.ResourceType[];
  if (condition.requestMethods)
    compiled.requestMethods = [...condition.requestMethods] as chrome.declarativeNetRequest.RequestMethod[];
  return compiled;
}

function compileAction(action: NetworkRuleAction): chrome.declarativeNetRequest.RuleAction {
  switch (action.type) {
    case "removeResponseHeaders":
      return {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        responseHeaders: action.headers.map((header) => ({
          header,
          operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
        })),
      };
    case "modifyRequestHeaders":
      return {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: action.headers.map((edit) => ({
          header: edit.header,
          operation: edit.operation as chrome.declarativeNetRequest.HeaderOperation,
          ...(edit.value === undefined ? {} : { value: edit.value }),
        })),
      };
    case "modifyResponseHeaders":
      return {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        responseHeaders: action.headers.map((edit) => ({
          header: edit.header,
          operation: edit.operation as chrome.declarativeNetRequest.HeaderOperation,
          ...(edit.value === undefined ? {} : { value: edit.value }),
        })),
      };
    case "block":
      return { type: "block" as chrome.declarativeNetRequest.RuleActionType };
    case "allow":
      return { type: "allow" as chrome.declarativeNetRequest.RuleActionType };
    case "redirect":
      return {
        type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
        redirect: { url: action.url },
      };
  }
}

function compileLogicalCandidates(state: NetworkRuleState): CompiledCandidate[] {
  const byId = new Map<string, NetworkRule>(state.rules.map((rule) => [rule.id, rule]));
  const candidates: CompiledCandidate[] = [];
  state.order.forEach((ruleId, index) => {
    const rule = byId.get(ruleId);
    if (!rule?.enabled) return;
    candidates.push({
      priority: state.order.length - index,
      sourceActionType: rule.action.type,
      action: compileAction(rule.action),
      condition: compileCondition(rule.condition),
    });
  });
  return candidates;
}

/**
 * 编译保留用户规则的 priority 顺序，再只压缩 active priority sequence 中连续的纯响应头移除规则。
 * 物理 ID 按压缩后的顺序从保留段分配，因此 user-facing logical rule state 完全不变。
 */
export function compileNetworkRules(state: NetworkRuleState): chrome.declarativeNetRequest.Rule[] {
  if (!state.masterEnabled) return [];
  return compactEligibleRuns(compileLogicalCandidates(state)).map((candidate, index) => ({
    id: USER_RULE_ID_MIN + index,
    priority: candidate.priority,
    action: candidate.action,
    condition: candidate.condition,
  }));
}

export interface NetworkRuleApplier {
  apply(rules: chrome.declarativeNetRequest.Rule[]): Promise<void>;
}

type DynamicRuleUpdateOptions = {
  removeRuleIds: number[];
  addRules: chrome.declarativeNetRequest.Rule[];
};

function toApplyError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("DNR update failed");
}

export class DeclarativeNetRequestUserRuleApplier implements NetworkRuleApplier {
  /**
   * 与 getDynamicRules() 做全量对账：保留段内的 ID 一律先回收（含历史版本遗留的位次），
   * 段外的动态规则不出现在 removeRuleIds 里，因此其它功能注册的规则不会被误删。
   */
  async apply(rules: chrome.declarativeNetRequest.Rule[]): Promise<void> {
    let removeRuleIds: number[];
    try {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      removeRuleIds = existing.map((rule) => rule.id).filter(isUserRuleId);
    } catch (error) {
      throw toApplyError(error);
    }
    return this.updateDynamicRules({ removeRuleIds, addRules: rules });
  }

  private updateDynamicRules(options: DynamicRuleUpdateOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(toApplyError(error));
        else resolve();
      };

      try {
        const updateDynamicRules = chrome.declarativeNetRequest.updateDynamicRules as unknown as (
          this: typeof chrome.declarativeNetRequest,
          options: DynamicRuleUpdateOptions,
          callback: () => void
        ) => Promise<void> | void;
        const result = updateDynamicRules.call(chrome.declarativeNetRequest, options, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            done(lastError.message);
            return;
          }
          done();
        });
        if (result && typeof result.then === "function") {
          void result.then(
            () => done(),
            (error: unknown) => done(error)
          );
        }
      } catch (error) {
        done(error);
      }
    });
  }
}
