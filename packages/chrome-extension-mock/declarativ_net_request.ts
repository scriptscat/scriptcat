export default class DeclarativeNetRequest {
  MAX_NUMBER_OF_SESSION_RULES = 5000;

  private _sessionRules: chrome.declarativeNetRequest.Rule[] = [];
  private _dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
  dynamicUpdateError: string | undefined;

  HeaderOperation = {
    APPEND: "append",
    SET: "set",
    REMOVE: "remove",
  };

  RuleActionType = {
    BLOCK: "block",
    REDIRECT: "redirect",
    ALLOW: "allow",
    UPGRADE_SCHEME: "upgradeScheme",
    MODIFY_HEADERS: "modifyHeaders",
    ALLOW_ALL_REQUESTS: "allowAllRequests",
  };

  ResourceType = {
    MAIN_FRAME: "main_frame",
    SUB_FRAME: "sub_frame",
    STYLESHEET: "stylesheet",
    SCRIPT: "script",
    IMAGE: "image",
    FONT: "font",
    OBJECT: "object",
    XMLHTTPREQUEST: "xmlhttprequest",
    PING: "ping",
    CSP_REPORT: "csp_report",
    MEDIA: "media",
    WEBSOCKET: "websocket",
    OTHER: "other",
  };

  updateSessionRules(arg1: any, arg2: any): Promise<void> {
    let options: {
      addRules?: chrome.declarativeNetRequest.Rule[];
      removeRuleIds?: number[];
    } = {};
    let callback: undefined | ((...args: any) => any) = undefined;

    if (typeof arg1 === "function") {
      callback = arg1;
    } else if (typeof arg2 === "function") {
      callback = arg2;
    }
    if (typeof arg1 === "object" && arg1) options = arg1;

    return new Promise<void>((resolve) => {
      const { addRules = [], removeRuleIds = [] } = options;

      // Remove rules by ID
      if (removeRuleIds.length > 0) {
        this._sessionRules = this._sessionRules.filter((rule) => !removeRuleIds.includes(rule.id));
      }

      // Add or update rules (upsert by ID)
      for (const newRule of addRules) {
        const existingIndex = this._sessionRules.findIndex((rule) => rule.id === newRule.id);
        if (existingIndex !== -1) {
          this._sessionRules[existingIndex] = newRule; // update
        } else {
          this._sessionRules.push(newRule); // add
        }
      }

      resolve();
      callback?.();
    });
  }

  getSessionRules(): Promise<chrome.declarativeNetRequest.Rule[]> {
    return Promise.resolve([...this._sessionRules]);
  }

  updateDynamicRules(options: chrome.declarativeNetRequest.UpdateRuleOptions, callback?: () => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.dynamicUpdateError) {
        const message = this.dynamicUpdateError;
        this.dynamicUpdateError = undefined;
        (chrome.runtime as typeof chrome.runtime & { lastError?: chrome.runtime.LastError }).lastError = { message };
        callback?.();
        delete (chrome.runtime as typeof chrome.runtime & { lastError?: chrome.runtime.LastError }).lastError;
        reject(new Error(message));
        return;
      }
      const removeRuleIds = options.removeRuleIds ?? [];
      const rules = this._dynamicRules.filter((rule) => !removeRuleIds.includes(rule.id));
      for (const newRule of options.addRules ?? []) {
        const index = rules.findIndex((rule) => rule.id === newRule.id);
        if (index === -1) rules.push(newRule);
        else rules[index] = newRule;
      }
      this._dynamicRules = rules;
      callback?.();
      resolve();
    });
  }

  getDynamicRules(): Promise<chrome.declarativeNetRequest.Rule[]> {
    return Promise.resolve([...this._dynamicRules]);
  }

  resetMock() {
    this._sessionRules = [];
    this._dynamicRules = [];
    this.dynamicUpdateError = undefined;
  }
}
