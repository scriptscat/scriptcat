export default class DeclarativeNetRequest {
  MAX_NUMBER_OF_SESSION_RULES = 5000;

  private _sessionRules: chrome.declarativeNetRequest.Rule[] = [];

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

  updateSessionRules(
    options: {
      addRules?: chrome.declarativeNetRequest.Rule[];
      removeRuleIds?: number[];
    } = {}
  ): Promise<void> {
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
    });
  }

  getSessionRules(): Promise<chrome.declarativeNetRequest.Rule[]> {
    return Promise.resolve([...this._sessionRules]);
  }
}
