import type { Deferred } from "@App/pkg/utils/utils";
import { deferred } from "@App/pkg/utils/utils";

let sessionRuleIdsPromise: Promise<Set<number>> | null = null;
let sessionRuleIds: Set<number> | null = null;

let SESSION_RULE_ID_BEGIN = 10000;
export const LIMIT_SESSION_RULES =
  process.env.VI_TESTING === "true" ? 1234 : chrome.declarativeNetRequest.MAX_NUMBER_OF_SESSION_RULES - 300;
let lockSessionRuleCreation: Deferred<void> | null = null;

export const getSessionRuleIds = async (): Promise<Set<number>> => {
  if (!sessionRuleIdsPromise) {
    sessionRuleIdsPromise = chrome.declarativeNetRequest
      .getSessionRules()
      .then((rules) => {
        sessionRuleIds = new Set(rules.map((rule) => rule.id).filter(Boolean));
        return sessionRuleIds;
      })
      .catch((e) => {
        console.warn(e);
        sessionRuleIds = new Set<number>([]);
        return sessionRuleIds;
      });
  }
  const ruleIds = sessionRuleIds || (await sessionRuleIdsPromise);
  return ruleIds;
};

export const removeSessionRuleIdEntry = (ruleId: number) => {
  if (ruleId <= 10000) {
    throw new Error("removeSessionRuleIdEntry cannot remove ids not created by nextSessionRuleId");
  }
  if (sessionRuleIds) {
    if (sessionRuleIds.delete(ruleId) === true) {
      if (ruleId <= SESSION_RULE_ID_BEGIN + 1) {
        SESSION_RULE_ID_BEGIN = ruleId - 1;
      }
      if (sessionRuleIds.size < LIMIT_SESSION_RULES) {
        lockSessionRuleCreation?.resolve();
        lockSessionRuleCreation = null;
      }
    }
  }
};

export const nextSessionRuleId = async () => {
  const ruleIds = await getSessionRuleIds();
  if (!lockSessionRuleCreation && ruleIds.size + 1 > LIMIT_SESSION_RULES) lockSessionRuleCreation = deferred<void>();
  if (lockSessionRuleCreation) await lockSessionRuleCreation.promise;
  let id;
  do {
    id = ++SESSION_RULE_ID_BEGIN;
  } while (ruleIds.has(id));
  return id;
};
