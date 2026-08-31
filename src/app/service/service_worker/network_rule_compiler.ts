import type {
  NetworkRule,
  NetworkRuleAction,
  NetworkRuleCondition,
  NetworkRuleState,
} from "@App/app/repo/network_rule";
import { NETWORK_RULE_RESOURCE_TYPES } from "@App/pkg/utils/network_rule_condition";
import { USER_RULE_ID_MIN, isUserRuleId } from "./dnr_rule_ids";

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

/**
 * 一条用户规则编译成一条 DNR 规则：ID 按位次从保留段顺序分配，priority 由位次倒序映射，
 * 因此列表第一行拿到最高优先级，且用户段整体严格低于 INTERNAL_DNR_PRIORITY。
 */
export function compileNetworkRules(state: NetworkRuleState): chrome.declarativeNetRequest.Rule[] {
  if (!state.masterEnabled) return [];
  const byId = new Map<string, NetworkRule>(state.rules.map((rule) => [rule.id, rule]));
  const compiled: chrome.declarativeNetRequest.Rule[] = [];
  state.order.forEach((ruleId, index) => {
    const rule = byId.get(ruleId);
    if (!rule?.enabled) return;
    compiled.push({
      id: USER_RULE_ID_MIN + compiled.length,
      priority: state.order.length - index,
      action: compileAction(rule.action),
      condition: compileCondition(rule.condition),
    });
  });
  return compiled;
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
