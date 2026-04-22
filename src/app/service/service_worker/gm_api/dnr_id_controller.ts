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
        const existingRuleIds = rules.map((rule) => rule.id).filter(Boolean);
        // 根据历史 session rule 的最大 id 更新 SESSION_RULE_ID_BEGIN
        // 避免 SW 重启后从 10001 起做大量 do/while 递增扫描
        if (existingRuleIds.length > 0) {
          SESSION_RULE_ID_BEGIN = Math.max(SESSION_RULE_ID_BEGIN, ...existingRuleIds);
        }
        sessionRuleIds = new Set(existingRuleIds);
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
      // 唤醒所有等待者: 每个等待者会在 while 循环内重新判定 size 并决定是继续分配还是再次等待
      // 这样 "1 次释放 => 1 个等待者通过"，避免 N 个等待者同时放行再次撑爆上限
      lockSessionRuleCreation?.resolve();
      lockSessionRuleCreation = null;
    }
  }
};

export const nextSessionRuleId = async () => {
  const ruleIds = await getSessionRuleIds();
  // 用 while 循环反复判定上限: 等待者被唤醒后如果 slot 已被其他等待者抢占，会再次进入等待
  while (ruleIds.size + 1 > LIMIT_SESSION_RULES) {
    if (!lockSessionRuleCreation) lockSessionRuleCreation = deferred<void>();
    await lockSessionRuleCreation.promise;
  }
  let id;
  do {
    id = ++SESSION_RULE_ID_BEGIN;
  } while (ruleIds.has(id));
  ruleIds.add(id);
  return id;
};
