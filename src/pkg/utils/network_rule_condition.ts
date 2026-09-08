/** 单条规则的域名条数上限，DNR 条件与表单共用同一个界。 */
export const MAX_RULE_DOMAINS = 100;

export type RuleDomainMessageKey =
  | "domain_required"
  | "domain_invalid"
  | "domain_credentials"
  | "domain_wildcard"
  | "domain_single_label"
  | "domain_too_long"
  | "domain_count_invalid";

export class RuleDomainError extends Error {
  constructor(public readonly messageKey: RuleDomainMessageKey) {
    super(messageKey);
    this.name = "RuleDomainError";
  }
}

export type RuleDomainIssue = {
  tokenIndex: number;
  input: string;
  messageKey: RuleDomainMessageKey;
};

export type RuleDomainParseResult = {
  domains: string[];
  errors: RuleDomainIssue[];
};

const HTTP_URL_PATTERN = /^https?:\/\//i;
const IPV6_PATTERN = /^\[[0-9a-fA-F:.]+\]$/;

function fail(messageKey: RuleDomainMessageKey): never {
  throw new RuleDomainError(messageKey);
}

function normalizeHostname(hostname: string): string {
  const isIpv6 = hostname.startsWith("[") && hostname.endsWith("]");
  const normalized = (isIpv6 ? hostname : hostname.replace(/\.$/, "")).toLowerCase();
  if (normalized.includes("*") || normalized.includes("%")) fail("domain_invalid");
  if (!isIpv6 && !normalized.includes(".")) fail("domain_single_label");
  if (normalized.length > 253) fail("domain_too_long");
  return normalized;
}

/** 只接受由用户明确配置的 HTTP(S) 域名，避免把路径语法带入 DNR。 */
export function normalizeRuleDomain(input: string): string {
  if (typeof input !== "string") fail("domain_invalid");
  const token = input.trim();
  if (!token) fail("domain_required");
  if (token.includes("\n") || token.includes("\r") || token.includes(",")) fail("domain_invalid");
  if (token.includes("*")) fail("domain_wildcard");

  let url: URL;
  if (HTTP_URL_PATTERN.test(token)) {
    try {
      url = new URL(token);
    } catch {
      fail("domain_invalid");
    }
    if (url.username || url.password) fail("domain_credentials");
    if (url.protocol !== "http:" && url.protocol !== "https:") fail("domain_invalid");
    return normalizeHostname(url.hostname);
  }

  if (token.startsWith("//") || token.includes("/") || token.includes("?") || token.includes("#")) {
    fail("domain_invalid");
  }

  if (token.startsWith("[") && token.endsWith("]")) {
    if (!IPV6_PATTERN.test(token)) fail("domain_invalid");
    try {
      url = new URL(`http://${token}`);
    } catch {
      fail("domain_invalid");
    }
    if (url.port || url.username || url.password) fail("domain_invalid");
    return normalizeHostname(url.hostname);
  }

  if (token.includes(":") || token.includes("@")) fail("domain_invalid");
  try {
    url = new URL(`http://${token}`);
  } catch {
    fail("domain_invalid");
  }
  if (url.username || url.password || url.port || url.pathname !== "/") fail("domain_invalid");
  return normalizeHostname(url.hostname);
}

export function parseRuleDomains(input: string): RuleDomainParseResult {
  const tokens = input.split(/[\n,]/);
  const domains: string[] = [];
  const errors: RuleDomainIssue[] = [];

  for (const [tokenIndex, rawToken] of tokens.entries()) {
    const token = rawToken.trim();
    if (!token) continue;
    try {
      const domain = normalizeRuleDomain(token);
      if (domains.includes(domain)) continue;
      if (domains.length === MAX_RULE_DOMAINS) {
        errors.push({ tokenIndex, input: token, messageKey: "domain_count_invalid" });
        break;
      }
      domains.push(domain);
    } catch (error) {
      const messageKey = error instanceof RuleDomainError ? error.messageKey : "domain_invalid";
      errors.push({ tokenIndex, input: token, messageKey });
    }
  }

  if (domains.length === 0 && errors.length === 0) {
    errors.push({ tokenIndex: 0, input: input.trim(), messageKey: "domain_required" });
  }
  return { domains, errors };
}

/**
 * DNR `RuleCondition` 中开放给用户配置的资源类型与请求方法。
 * 独立枚举而不是直接复用 chrome 类型，是为了让校验层有一个明确的输入白名单。
 */
export const NETWORK_RULE_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "other",
] as const;

export type NetworkRuleResourceType = (typeof NETWORK_RULE_RESOURCE_TYPES)[number];

export const NETWORK_RULE_REQUEST_METHODS = [
  "connect",
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "other",
] as const;

export type NetworkRuleRequestMethod = (typeof NETWORK_RULE_REQUEST_METHODS)[number];
