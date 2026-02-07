// ==UserScript==
// @name         A Scriptlet for @grant unwrap test
// @namespace    none
// @version      2026-02-07
// @description  try to take over the world!
// @author       You
// @match        https://*/*?test_grant_unwrap
// @grant        GM_setValue
// @unwrap
// ==/UserScript==

var test_global_injection = "success"; // User can access the variable "test_global_injection" directly in DevTools
console.log(`Expected Result: typeof GM = ${typeof GM} = undefined; typeof GM_setValue = ${typeof GM_setValue} = undefined`);
