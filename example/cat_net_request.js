// ==UserScript==
// @name         CAT_netRequestRules
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @match        {{match}}
// @grant        CAT_netRequestRules
// ==/UserScript==

/**
 * @typedef {import('../src/types/scriptcat')} ScriptCat
 */

CAT_netRequestRules("list", {
  ondone(data) {
    console.log("list", data);
  },
});
