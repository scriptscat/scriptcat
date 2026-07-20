import type { CspRuleState } from "@App/app/repo/csp_rule";

export const CSP_RULE_ID = 2001;

const CSP_HEADERS: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
  { header: "content-security-policy", operation: "remove" },
  { header: "content-security-policy-report-only", operation: "remove" },
  { header: "x-content-security-policy", operation: "remove" },
  { header: "x-webkit-csp", operation: "remove" },
];

const RESOURCE_TYPES = ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[];

export function compileCspRules(state: CspRuleState): chrome.declarativeNetRequest.Rule[] {
  if (!state.masterEnabled) return [];
  const enabledRules = state.rules.filter((rule) => rule.enabled);
  if (enabledRules.length === 0) return [];

  const hasAllSites = enabledRules.some((rule) => rule.target.type === "allSites");
  const condition: chrome.declarativeNetRequest.RuleCondition = hasAllSites
    ? { urlFilter: "*", resourceTypes: RESOURCE_TYPES }
    : {
        requestDomains: [
          ...new Set(
            enabledRules.flatMap((rule) => (rule.target.type === "domains" ? rule.target.domains : [])).sort()
          ),
        ],
        resourceTypes: RESOURCE_TYPES,
      };

  return [
    {
      id: CSP_RULE_ID,
      priority: 1,
      action: { type: "modifyHeaders", responseHeaders: CSP_HEADERS.map((header) => ({ ...header })) },
      condition,
    },
  ];
}

export interface CspRuleApplier {
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

export class DeclarativeNetRequestCspApplier implements CspRuleApplier {
  apply(rules: chrome.declarativeNetRequest.Rule[]): Promise<void> {
    const options = { removeRuleIds: [CSP_RULE_ID], addRules: rules };
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
