/** Methods injected when these APIs are granted. */
export const API_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "GM.getValues": ["GM_getValues"],
  "GM.addValueChangeListener": ["GM_addValueChangeListener"],
  "GM.removeValueChangeListener": ["GM_removeValueChangeListener"],
  "GM.log": ["GM_log"],
  "GM.registerMenuCommand": ["GM_registerMenuCommand"],
  CAT_registerMenuInput: ["GM_registerMenuCommand"],
  "GM.addStyle": ["GM_addStyle"],
  "GM.addElement": ["GM_addElement"],
  "GM.unregisterMenuCommand": ["GM_unregisterMenuCommand"],
  CAT_unregisterMenuInput: ["GM_unregisterMenuCommand"],
  CAT_fileStorage: ["CAT_fetchBlob"],
  GM_openInTab: ["GM_closeInTab"],
  "GM.openInTab": ["GM_openInTab", "GM_closeInTab"],
  "GM.getTab": ["GM_getTab"],
  "GM.saveTab": ["GM_saveTab"],
  "GM.getTabs": ["GM_getTabs"],
  "GM.setClipboard": ["GM_setClipboard"],
  "GM.getResourceText": ["GM_getResourceText"],
  "GM.getResourceURL": ["GM_getResourceURL"],
  "GM.getResourceUrl": ["GM_getResourceURL"],
};

/** Backing GM grants needed by convenience APIs that forward their calls. */
export const PAGE_RPC_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "GM.cookie": ["GM.cookie.set", "GM.cookie.list", "GM.cookie.delete"],
  GM_cookie: ["GM_cookie.set", "GM_cookie.list", "GM_cookie.delete"],
  "GM.deleteValue": ["GM_setValue"],
  GM_deleteValue: ["GM_setValue"],
  "GM.deleteValues": ["GM_setValues"],
  GM_deleteValues: ["GM_setValues"],
  "GM.setValue": ["GM_setValue"],
  "GM.setValues": ["GM_setValues"],
  "GM.listValues": ["GM_listValues"],
  "GM.download": ["GM_download"],
  "GM.notification": ["GM_notification"],
};

/** Calls forwarded by a granted API to an internal Service Worker endpoint. */
export const INTERNAL_APIS_BY_GRANT: Readonly<Record<string, readonly string[]>> = {
  "CAT.agent.conversation": ["CAT_agentConversation", "CAT_agentConversationChat", "CAT_agentAttachToConversation"],
  "CAT.agent.dom": ["CAT_agentDom"],
  "CAT.agent.model": ["CAT_agentModel"],
  "CAT.agent.opfs": ["CAT_agentOPFS", "CAT_fetchBlob"],
  "CAT.agent.skills": ["CAT_agentSkills"],
  "CAT.agent.task": ["CAT_agentTask"],
  CAT_fileStorage: ["CAT_fetchBlob", "CAT_createBlobUrl"],
  "GM.xmlHttpRequest": ["GM_xmlhttpRequest"],
};

const hasOwn = Object.prototype.hasOwnProperty;

export const getApiDependencies = (api: string): readonly string[] =>
  hasOwn.call(API_DEPENDENCIES, api) ? API_DEPENDENCIES[api] : [];

export const getPageRpcDependencies = (api: string): readonly string[] =>
  hasOwn.call(API_DEPENDENCIES, api)
    ? API_DEPENDENCIES[api]
    : hasOwn.call(PAGE_RPC_DEPENDENCIES, api)
      ? PAGE_RPC_DEPENDENCIES[api]
      : [];
