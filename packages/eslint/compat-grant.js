// Fork from eslint-plugin-userscripts
// Documentation:
// - Tampermonkey: https://www.tampermonkey.net/documentation.php#_grant
// - Violentmonkey: https://violentmonkey.github.io/api/gm
// - Greasemonkey: https://wiki.greasespot.net/Greasemonkey_Manual:API
// - ScriptCat: https://docs.scriptcat.org/docs/dev/cat-api/
const compatMap = {
  CAT_userConfig: [{ type: "scriptcat", versionConstraint: ">=0.11.0-beta" }],
  CAT_fileStorage: [{ type: "scriptcat", versionConstraint: ">=0.11.0" }],
  "GM.addElement": [
    { type: "tampermonkey", versionConstraint: ">=4.11.6113" },
    { type: "violentmonkey", versionConstraint: ">=2.13.0-beta.3" },
  ],
  GM_addElement: [
    { type: "tampermonkey", versionConstraint: ">=4.11.6113" },
    { type: "violentmonkey", versionConstraint: ">=2.13.0-beta.3" },
    { type: "scriptcat", versionConstraint: "*" },
  ],
  "GM.addStyle": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
  ],
  GM_addStyle: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.6.1.4 <4" },
  ],
  "GM.addValueChangeListener": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_addValueChangeListener: [
    { type: "tampermonkey", versionConstraint: ">=2.3.2607" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
  ],
  "GM.cookie": [
    { type: "tampermonkey", versionConstraint: ">=4.8" },
    { type: "scriptcat", versionConstraint: "*" },
  ],
  GM_cookie: [
    { type: "tampermonkey", versionConstraint: ">=4.8" },
    { type: "scriptcat", versionConstraint: "*" },
  ],
  "GM.deleteValue": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4.0" },
  ],
  GM_deleteValue: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.8.20090123.1 <4" },
  ],
  "GM.download": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_download: [
    { type: "tampermonkey", versionConstraint: ">=3.8" },
    { type: "violentmonkey", versionConstraint: ">=2.9.5" },
  ],
  "GM.getResourceText": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_getResourceText: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.8.20080609.0 <4" },
  ],
  "GM.getResourceURL": [{ type: "violentmonkey", versionConstraint: ">=2.12.0 <2.13.0.10" }],
  GM_getResourceURL: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.8.20080609.0 <4" },
  ],
  "GM.getResourceUrl": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.13.0.10" },
    { type: "greasemonkey", versionConstraint: ">=4.0" },
  ],
  "GM.getTab": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_getTab: [{ type: "tampermonkey", versionConstraint: ">=4.0.10" }],
  "GM.getTabs": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_getTabs: [{ type: "tampermonkey", versionConstraint: ">=4.0.10" }],
  "GM.getValue": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4.0" },
  ],
  GM_getValue: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.3-beta <4" },
  ],
  "GM.info": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4" },
  ],
  GM_info: [
    { type: "tampermonkey", versionConstraint: ">=2.4.2718" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.9.16 <4" },
  ],
  "GM.listValues": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4" },
  ],
  GM_listValues: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.8.20090123.1 <4" },
  ],
  "GM.log": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "greasemonkey", versionConstraint: ">=4" },
  ],
  GM_log: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.3-beta <4" },
  ],
  "GM.notification": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4" },
  ],
  GM_notification: [
    { type: "tampermonkey", versionConstraint: ">=2.0.2344" },
    { type: "violentmonkey", versionConstraint: ">=2.5.0" },
  ],
  "GM.openInTab": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4" },
  ],
  GM_openInTab: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.5-beta <4" },
  ],
  "GM.registerMenuCommand": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4.11" },
  ],
  GM_registerMenuCommand: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.2.5 <4" },
  ],
  "GM.removeValueChangeListener": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_removeValueChangeListener: [
    { type: "tampermonkey", versionConstraint: ">=2.3.2607" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
  ],
  "GM.saveTab": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_saveTab: [{ type: "tampermonkey", versionConstraint: ">=4.0.10" }],
  "GM.setClipboard": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4" },
  ],
  GM_setClipboard: [
    { type: "tampermonkey", versionConstraint: ">=2.6.2767" },
    { type: "violentmonkey", versionConstraint: ">=2.5.0" },
    { type: "greasemonkey", versionConstraint: ">=1.10 <4" },
  ],
  "GM.setValue": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4" },
  ],
  GM_setValue: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.3-beta <4" },
  ],
  "GM.unregisterMenuCommand": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_unregisterMenuCommand: [
    { type: "tampermonkey", versionConstraint: ">=3.6.3737" },
    { type: "violentmonkey", versionConstraint: ">=2.9.4" },
  ],
  "GM.webRequest": [{ type: "tampermonkey", versionConstraint: ">=4.5" }],
  GM_webRequest: [{ type: "tampermonkey", versionConstraint: ">=4.4" }],
  GM_xmlhttpRequest: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.2.5 <4" },
  ],
  "GM.xmlHttpRequest": [
    { type: "tampermonkey", versionConstraint: ">=4.5" },
    { type: "violentmonkey", versionConstraint: ">=2.12.0" },
    { type: "greasemonkey", versionConstraint: ">=4.0" },
  ],
  none: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: "*" },
  ],
  unsafeWindow: [
    { type: "tampermonkey", versionConstraint: "*" },
    { type: "violentmonkey", versionConstraint: "*" },
    { type: "greasemonkey", versionConstraint: ">=0.5-beta" },
  ],
  "window.close": [
    { type: "tampermonkey", versionConstraint: ">=3.12.58" },
    { type: "violentmonkey", versionConstraint: ">=2.6.2" },
  ],
  "window.focus": [
    { type: "tampermonkey", versionConstraint: ">=3.12.58" },
    { type: "violentmonkey", versionConstraint: ">=2.12.10" },
  ],
  "window.onurlchange": [{ type: "tampermonkey", versionConstraint: ">=4.11" }],
};

const gmPolyfillOverride = {
  GM_addStyle: "ignore",
  GM_registerMenuCommand: "ignore",
  GM_getResourceText: {
    deps: ["GM.getResourceUrl", "GM.log"],
  },
  "GM.log": "ignore",
  "GM.info": {
    deps: ["GM_info"],
  },
  "GM.addStyle": {
    deps: ["GM_addStyle"],
  },
  "GM.deleteValue": {
    deps: ["GM_deleteValue"],
  },
  "GM.getResourceUrl": {
    deps: ["GM_getResourceURL"],
  },
  "GM.getValue": {
    deps: ["GM_getValue"],
  },
  "GM.listValues": {
    deps: ["GM_listValues"],
  },
  "GM.notification": {
    deps: ["GM_notification"],
  },
  "GM.openInTab": {
    deps: ["GM_openInTab"],
  },
  "GM.registerMenuCommand": {
    deps: ["GM_registerMenuCommand"],
  },
  "GM.setClipboard": {
    deps: ["GM_setClipboard"],
  },
  "GM.setValue": {
    deps: ["GM_setValue"],
  },
  "GM.xmlHttpRequest": {
    deps: ["GM_xmlhttpRequest"],
  },
  "GM.getResourceText": {
    deps: ["GM_getResourceText"],
  },
};

module.exports.compatMap = compatMap;
module.exports.gmPolyfillOverride = gmPolyfillOverride;
