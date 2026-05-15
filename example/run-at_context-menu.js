// ==UserScript==
// @name         Context Menu Demo: Search Selection
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  Demo for @run-at context-menu
// @author       You
// @match        *://*/*
// @run-at       context-menu
// @grant        GM_openInTab
// ==/UserScript==

(function () {
  'use strict';
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) {
    alert("Please select some texts first.");
    return;
  }
  GM_openInTab(`https://scriptcat.org/search?keyword=${encodeURIComponent(selectedText)}`)
})();
