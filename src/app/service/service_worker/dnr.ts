/**
 * scheduler 用于 Service Worker 或 Event Page, Chrome 94+, Firefox 142+
 */
const scheduler_ =
  //@ts-ignore
  typeof scheduler !== "undefined" && typeof scheduler?.postTask === "function" && typeof scheduler.yield === "function"
    ? //@ts-ignore
      scheduler
    : null;

// 用于扩充初始化时新增 SessionRules. FireFox 需要等一等才加，否则会失效。
export const addSessionRules = async (rules: chrome.declarativeNetRequest.Rule[], resolve?: ResolveFn) => {
  await scheduler_?.yield?.();
  chrome.declarativeNetRequest.updateSessionRules(
    {
      removeRuleIds: [...rules.map((rule) => rule.id)],
      addRules: rules,
    },
    () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.declarativeNetRequest.updateSessionRules:", lastError);
      }
      resolve?.();
    }
  );
};

export const sessionRuleDynamicAdd = (rule: chrome.declarativeNetRequest.Rule, resolve?: ResolveFn) => {
  chrome.declarativeNetRequest.updateSessionRules(
    {
      removeRuleIds: [rule.id],
      addRules: [rule],
    },
    () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.declarativeNetRequest.updateSessionRules:", lastError);
      }
      resolve?.();
    }
  );
};

export const sessionRuleDynamicRemove = (ruleId: number, resolve?: ResolveFn) => {
  chrome.declarativeNetRequest.updateSessionRules(
    {
      removeRuleIds: [ruleId],
    },
    () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.declarativeNetRequest.updateSessionRules:", lastError);
      }
      resolve?.();
    }
  );
};
