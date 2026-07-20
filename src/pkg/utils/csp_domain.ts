export type CspDomainMessageKey =
  | "domain_required"
  | "domain_invalid"
  | "domain_credentials"
  | "domain_wildcard"
  | "domain_single_label"
  | "domain_too_long"
  | "domain_count_invalid";

export class CspDomainError extends Error {
  constructor(public readonly messageKey: CspDomainMessageKey) {
    super(messageKey);
    this.name = "CspDomainError";
  }
}

export type CspDomainIssue = {
  tokenIndex: number;
  input: string;
  messageKey: CspDomainMessageKey;
};

export type CspDomainParseResult = {
  domains: string[];
  errors: CspDomainIssue[];
};

const HTTP_URL_PATTERN = /^https?:\/\//i;
const IPV6_PATTERN = /^\[[0-9a-fA-F:.]+\]$/;

function fail(messageKey: CspDomainMessageKey): never {
  throw new CspDomainError(messageKey);
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
export function normalizeCspDomain(input: string): string {
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

export function parseCspDomains(input: string): CspDomainParseResult {
  const tokens = input.split(/[\n,]/);
  const domains: string[] = [];
  const errors: CspDomainIssue[] = [];

  for (const [tokenIndex, rawToken] of tokens.entries()) {
    const token = rawToken.trim();
    if (!token) continue;
    try {
      const domain = normalizeCspDomain(token);
      if (!domains.includes(domain)) domains.push(domain);
    } catch (error) {
      const messageKey = error instanceof CspDomainError ? error.messageKey : "domain_invalid";
      errors.push({ tokenIndex, input: token, messageKey });
    }
  }

  if (domains.length === 0 && errors.length === 0) {
    errors.push({ tokenIndex: 0, input: input.trim(), messageKey: "domain_required" });
  }
  return { domains, errors };
}
