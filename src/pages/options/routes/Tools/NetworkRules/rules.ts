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
