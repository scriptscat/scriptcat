import type {
  NetworkRule,
  NetworkRuleActionType,
  NetworkRuleCondition,
  NetworkRuleState,
} from "@App/app/repo/network_rule";

export const NETWORK_RULES_PAGE_SIZE = 20;

export type StatusFilter = "all" | "enabled" | "disabled";
export type ActionFilter = "all" | NetworkRuleActionType;

export const ACTION_FILTER_OPTIONS: NetworkRuleActionType[] = [
  "removeResponseHeaders",
  "modifyRequestHeaders",
  "modifyResponseHeaders",
  "block",
  "redirect",
  "allow",
];

/** 顺序数组是优先级的唯一来源，rules 数组的下标没有语义。 */
export function orderedRules(rules: NetworkRule[], order: string[]): NetworkRule[] {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  return order.flatMap((id) => {
    const rule = byId.get(id);
    return rule ? [rule] : [];
  });
}

export function ruleDomains(rule: NetworkRule): string[] {
  return rule.condition.requestDomains ?? [];
}

export type RuleFilters = { query: string; action: ActionFilter; status: StatusFilter };

export function filtersActive({ query, action, status }: RuleFilters): boolean {
  return query.trim() !== "" || action !== "all" || status !== "all";
}

export function filterRules(rules: NetworkRule[], { query, action, status }: RuleFilters): NetworkRule[] {
  const needle = query.trim().toLowerCase();
  return rules.filter((rule) => {
    if (action !== "all" && rule.action.type !== action) return false;
    if (status !== "all" && rule.enabled !== (status === "enabled")) return false;
    if (!needle) return true;
    if (rule.name.toLowerCase().includes(needle)) return true;
    if (rule.condition.urlFilter?.toLowerCase().includes(needle)) return true;
    return ruleDomains(rule).some((domain) => domain.toLowerCase().includes(needle));
  });
}

/** 把一条规则移动到完整顺序中的目标位次，其余规则相对次序不变。 */
export function moveRuleTo(order: string[], id: string, targetIndex: number): string[] {
  const rest = order.filter((current) => current !== id);
  if (rest.length === order.length) return order;
  const index = Math.min(Math.max(targetIndex, 0), rest.length);
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

export function enabledCount(state: NetworkRuleState): number {
  return state.rules.filter((rule) => rule.enabled).length;
}

/** 「所有网站」在条件里只有这一种写法，列表、编辑与高危确认都以它判定。 */
export const ALL_SITES_URL_FILTER = "*";

export function isAllSitesCondition(condition: NetworkRuleCondition): boolean {
  return condition.urlFilter === ALL_SITES_URL_FILTER;
}

/**
 * DNR 把 modifyHeaders / redirect / allow 归为 unsafe 规则，它们的配额池比 block 所在的总池小得多，
 * 所以数量提示必须按动作类型分别算。三种改头动作都编译成 modifyHeaders，同属 unsafe。
 */
const UNSAFE_ACTION_TYPES: NetworkRuleActionType[] = [
  "removeResponseHeaders",
  "modifyRequestHeaders",
  "modifyResponseHeaders",
  "redirect",
  "allow",
];

export type NetworkRuleQuotaUsage = { total: number; unsafe: number };

/** 只有启用的规则会被编译成 DNR 规则，停用的不占配额。 */
export function quotaUsage(rules: NetworkRule[]): NetworkRuleQuotaUsage {
  const active = rules.filter((rule) => rule.enabled);
  return {
    total: active.length,
    unsafe: active.filter((rule) => UNSAFE_ACTION_TYPES.includes(rule.action.type)).length,
  };
}

export type NetworkRuleQuotaLimits = { total?: number; unsafe?: number };

/**
 * 配额上限只从运行时常量读，不写死数字：Chrome 的总池与 unsafe 池是两个常量，
 * Firefox 不区分 unsafe，只暴露动态与会话规则共用的那一个。
 */
export function quotaLimits(): NetworkRuleQuotaLimits {
  const dnr: Partial<typeof chrome.declarativeNetRequest> = chrome.declarativeNetRequest;
  return {
    total: dnr.MAX_NUMBER_OF_DYNAMIC_RULES ?? dnr.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES,
    unsafe: dnr.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES,
  };
}
