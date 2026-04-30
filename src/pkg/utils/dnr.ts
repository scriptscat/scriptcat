const NOCSP_RULES_DOMAIN_MAX_COUNT = 32768;
const NOCSP_RULES_URLFILTER_MAX_COUNT = 512;

export const isValidDNRUrlFilter = (text: string) => {
  // https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest?hl=en#property-RuleCondition-urlFilter

  const domainNameAnchor = text.startsWith("||");

  const leftAnchor = !domainNameAnchor && text.startsWith("|");

  const rightAnchor = text.endsWith("|");

  try {
    let s = text;

    if (domainNameAnchor) s = s.slice(2);
    if (leftAnchor) s = s.slice(1);
    if (rightAnchor) s = s.slice(0, -1);

    const t = s.replace(/\*/g, "").replace(/^/g, "_");

    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\xFF]/.test(t)) return false;

    new URL(t);

    return true;
  } catch {
    return false;
  }
};

export const convertDomainToDNRUrlFilter = (text: string) => {
  // will match its domain and subdomain
  let ret;
  text = text.toLowerCase();
  try {
    if (text.startsWith("http") && /^http[s*]?:\/\//.test(text)) {
      const u = new URL(`${text.replace("http*://", "http-wildcard://")}`);
      ret = `|${u.origin.replace("http-wildcard://", "http://")}`;
    } else {
      const u = new URL(`https://${text}/`);
      ret = `||${u.hostname}`;
    }
  } catch {
    throw new Error("invalid domain");
  }
  return ret;
};

export const createNoCSPRules = (domains: string[], urlFilters: string[]) => {
  // domains = max 32768 domains
  // urlFilters = max 512
  if (domains.length > NOCSP_RULES_DOMAIN_MAX_COUNT) {
    throw new Error(
      `createNoCSPRules: The number of domains = ${domains.length} exceeding ${NOCSP_RULES_DOMAIN_MAX_COUNT}`
    );
  }
  if (urlFilters.length > NOCSP_RULES_URLFILTER_MAX_COUNT) {
    throw new Error(
      `createNoCSPRules: The number of urlFilters = ${urlFilters.length} exceeding ${NOCSP_RULES_URLFILTER_MAX_COUNT}`
    );
  }
  const REMOVE_HEADERS = [
    `content-security-policy`,
    `content-security-policy-report-only`,
    `x-webkit-csp`,
    `x-content-security-policy`,
    `x-frame-options`,
  ];
  const { RuleActionType, HeaderOperation, ResourceType } = chrome.declarativeNetRequest;
  const rules: chrome.declarativeNetRequest.Rule[] = urlFilters.map((urlFilter, index) => {
    return {
      id: 2002 + index,
      action: {
        type: RuleActionType.MODIFY_HEADERS,
        responseHeaders: REMOVE_HEADERS.map((header) => ({
          operation: HeaderOperation.REMOVE,
          header,
        })),
      },
      condition: {
        urlFilter: urlFilter,
        resourceTypes: [ResourceType.MAIN_FRAME, ResourceType.SUB_FRAME],
      },
    } satisfies chrome.declarativeNetRequest.Rule;
  });
  const requestDomains = domains
    .map((s) => {
      try {
        const u = new URL(`https://${s}/`); // 取编码后的 hostname
        return u.hostname;
      } catch {
        // ingored
      }
    })
    .filter(Boolean) as string[]; // 去除错误或空字串
  if (domains.length > 0) {
    rules.push({
      id: 2001,
      action: {
        type: RuleActionType.MODIFY_HEADERS,
        responseHeaders: REMOVE_HEADERS.map((header) => ({
          operation: HeaderOperation.REMOVE,
          header,
        })),
      },
      condition: {
        requestDomains: requestDomains,
        resourceTypes: [ResourceType.MAIN_FRAME, ResourceType.SUB_FRAME],
      },
    } satisfies chrome.declarativeNetRequest.Rule);
  }
  return rules;
};

export const removeDynamicRulesInRange = async (minId: number, maxId: number) => {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();

  const idsToRemove = existingRules.filter((rule) => rule.id >= minId && rule.id <= maxId).map((rule) => rule.id);

  if (idsToRemove.length === 0) return;

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: idsToRemove,
  });
};
