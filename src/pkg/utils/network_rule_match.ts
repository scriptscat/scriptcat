import type { NetworkRule, NetworkRuleActionType, NetworkRuleCondition } from "@App/app/repo/network_rule";
import { NETWORK_RULE_RESOURCE_TYPES } from "./network_rule_condition";
import type { NetworkRuleRequestMethod, NetworkRuleResourceType } from "./network_rule_condition";

/**
 * 规则条件的前端匹配与整套规则的裁决模拟。编辑抽屉的「试一试」与「测试匹配」共用这里的匹配核心，
 * 避免两处对同一条规则给出不同答案。
 *
 * 模拟的输入只有 URL、资源类型与请求方法，因此 initiatorDomains / excludedInitiatorDomains
 * 无从判定——当前编辑界面也产生不了这两个字段。
 */

/** `scope-only`：网址落在规则范围内，但这次请求被资源类型或请求方法排除。 */
export type RuleUrlMatch = "match" | "scope-only" | "no-match" | "invalid";

export type SimulatedRequest = {
  url: string;
  resourceType: NetworkRuleResourceType;
  /** 未指定时按 GET 模拟，界面只让用户选资源类型。 */
  method?: NetworkRuleRequestMethod;
};

/**
 * `applied` 会执行；其余三种都不会执行：
 * `blocked` 被某条 block 短路，`overridden` 被顺序更靠前的竞争规则决定了结果，
 * `allowed` 被顺序更靠前的 allow 放行而跳过。
 */
export type NetworkRuleHitStatus = "applied" | "blocked" | "overridden" | "allowed";

export type NetworkRuleHit = {
  rule: NetworkRule;
  /** 规则在完整列表中的位次（从 1 起），与列表页展示的顺序一致。 */
  position: number;
  status: NetworkRuleHitStatus;
  /** 使该规则不执行的那条规则的位次。 */
  causedBy?: number;
};

export type NetworkRuleOutcome = "none" | "blocked" | "redirected" | "allowed" | "modified";

export type NetworkRuleSimulation = {
  /** URL 不是可解析的 http(s) 地址时为 false，此时没有任何结果可给。 */
  valid: boolean;
  outcome: NetworkRuleOutcome;
  redirectUrl?: string;
  hits: NetworkRuleHit[];
};

/** block / redirect / allow 互相竞争，靠前者胜出；其余动作是叠加型的改头规则。 */
const COMPETING_ACTIONS: NetworkRuleActionType[] = ["block", "redirect", "allow"];

function isCompeting(type: NetworkRuleActionType): boolean {
  return COMPETING_ACTIONS.includes(type);
}

function parseHttpUrl(input: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

const REGEXP_SPECIALS = /[.+?^${}()|[\]\\]/g;

/**
 * 把 DNR 的 urlFilter 语法翻译成正则：`*` 通配、`^` 分隔符、`|` 首尾锚点、`||` 域名锚点，
 * 其余情况是子串匹配。DNR 默认大小写不敏感（isUrlFilterCaseSensitive 缺省为 false），这里同样。
 */
function urlFilterToRegExp(filter: string): RegExp {
  let pattern = filter;
  let prefix = "";
  let suffix = "";
  if (pattern.startsWith("||")) {
    prefix = "^https?://([^/]*\\.)?";
    pattern = pattern.slice(2);
  } else if (pattern.startsWith("|")) {
    prefix = "^";
    pattern = pattern.slice(1);
  }
  if (pattern.endsWith("|")) {
    suffix = "$";
    pattern = pattern.slice(0, -1);
  }
  const body = pattern
    .split("*")
    .map((part) => part.replace(REGEXP_SPECIALS, "\\$&").replaceAll("^", "(?:[^a-zA-Z0-9_\\-.%]|$)"))
    .join(".*");
  return new RegExp(`${prefix}${body}${suffix}`, "i");
}

function matchesUrl(condition: NetworkRuleCondition, url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (condition.excludedRequestDomains?.some((domain) => hostMatchesDomain(hostname, domain))) return false;
  if (condition.requestDomains && !condition.requestDomains.some((domain) => hostMatchesDomain(hostname, domain))) {
    return false;
  }
  if (condition.urlFilter !== undefined && !urlFilterToRegExp(condition.urlFilter).test(url.href)) return false;
  return true;
}

function matchesRequest(condition: NetworkRuleCondition, url: URL, request: Required<SimulatedRequest>): boolean {
  if (!matchesUrl(condition, url)) return false;
  // DNR 自身的默认是「除 main_frame 外的全部资源类型」，但编译器在未显式指定时会把受控集合列全
  // （network_rule_compiler.ts 的 compileCondition），模拟必须复述编译结果而不是 DNR 的默认。
  const resourceTypes = condition.resourceTypes ?? NETWORK_RULE_RESOURCE_TYPES;
  if (!resourceTypes.includes(request.resourceType)) return false;
  if (condition.requestMethods && !condition.requestMethods.includes(request.method)) return false;
  return true;
}

/**
 * 保存前自查：把输入当作一次主文档 GET 导航，与模拟器共用 matchesRequest 这一个谓词。
 * 若只掺入 URL 范围，用户在高级区显式选了资源类型后就会被告知「匹配」，
 * 而编译出的条件根本不会作用于这次请求——所以这一档单独报 scope-only。
 */
export function matchRuleUrl(condition: NetworkRuleCondition, input: string): RuleUrlMatch {
  const url = parseHttpUrl(input);
  if (!url) return "invalid";
  if (!matchesUrl(condition, url)) return "no-match";
  const request: Required<SimulatedRequest> = { url: input, resourceType: "main_frame", method: "get" };
  return matchesRequest(condition, url, request) ? "match" : "scope-only";
}

/**
 * 按列表顺序（即优先级自高到低）模拟整套规则对一次请求的裁决。
 * `rules` 是完整的有序列表，停用的规则会被跳过但仍占位次，于是结果里的 `#N` 与列表页一致。
 */
export function simulateNetworkRules(rules: NetworkRule[], request: SimulatedRequest): NetworkRuleSimulation {
  const url = parseHttpUrl(request.url);
  if (!url) return { valid: false, outcome: "none", hits: [] };
  const target: Required<SimulatedRequest> = {
    url: request.url,
    resourceType: request.resourceType,
    method: request.method ?? "get",
  };

  const matched = rules.flatMap((rule, index) =>
    rule.enabled && matchesRequest(rule.condition, url, target) ? [{ rule, position: index + 1 }] : []
  );
  const winner = matched.find((hit) => isCompeting(hit.rule.action.type));
  const winnerAction = winner?.rule.action.type;

  const hits: NetworkRuleHit[] = matched.map(({ rule, position }) => {
    if (!winner || position === winner.position) return { rule, position, status: "applied" };
    // block 短路整个请求，连位次更靠前的改头规则都不会执行。
    if (winnerAction === "block") return { rule, position, status: "blocked", causedBy: winner.position };
    if (isCompeting(rule.action.type)) return { rule, position, status: "overridden", causedBy: winner.position };
    // allow 与 redirect 都只跳过优先级低于自己的改头规则，靠前的照常叠加。
    if (position > winner.position) {
      const status = winnerAction === "allow" ? "allowed" : "overridden";
      return { rule, position, status, causedBy: winner.position };
    }
    return { rule, position, status: "applied" };
  });

  if (winner?.rule.action.type === "block") return { valid: true, outcome: "blocked", hits };
  if (winner?.rule.action.type === "redirect") {
    return { valid: true, outcome: "redirected", redirectUrl: winner.rule.action.url, hits };
  }
  if (winner?.rule.action.type === "allow") return { valid: true, outcome: "allowed", hits };
  const outcome = hits.some((hit) => hit.status === "applied") ? "modified" : "none";
  return { valid: true, outcome, hits };
}
