export default class DeclarativeNetRequest {
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

  updateSessionRules() {
    return new Promise<void>((resolve) => {
      resolve();
    });
  }
}
