/**
 * scheduler 用于 Service Worker 或 Event Page, Chrome 94+, Firefox 142+
 */
const scheduler_ =
  typeof scheduler !== "undefined" &&
  typeof scheduler?.postTask === "function" &&
  typeof scheduler?.yield === "function"
    ? scheduler
    : null;

// 用于扩充初始化时新增 SessionRules. FireFox 需要等一等才加，否则会失效。
export const addSessionRules = async (rules: chrome.declarativeNetRequest.Rule[]) => {
  await scheduler_?.yield?.();
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [...rules.map((rule) => rule.id)],
      addRules: rules,
    });
    return true;
  } catch (e) {
    console.error("chrome.declarativeNetRequest.updateSessionRules:", e);
    return e;
  }
};

export const sessionRuleDynamicAdd = async (rule: chrome.declarativeNetRequest.Rule): Promise<any> => {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [rule.id],
      addRules: [rule],
    });
    return true;
  } catch (e) {
    console.error("chrome.declarativeNetRequest.updateSessionRules:", e);
    return e;
  }
};

export const sessionRuleDynamicRemove = async (ruleId: number): Promise<any> => {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
    });
    return true;
  } catch (e) {
    console.error("chrome.declarativeNetRequest.updateSessionRules:", e);
    return e;
  }
};
