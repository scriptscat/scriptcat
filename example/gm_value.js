// ==UserScript==
// @name         test gm value
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @match https://bbs.tampermonkey.net.cn/
// @run-at document-start
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_addValueChangeListener
// @grant GM_listValues
// @grant GM_deleteValue
// ==/UserScript==

GM_addValueChangeListener("test_set", function () {
  console.log("set_ok");
  console.log(arguments);
});

setInterval(() => {
  console.log(GM_getValue("test_set"));
  console.log(GM_listValues());
}, 2000);

setTimeout(() => {
  GM_deleteValue("test_set");
}, 3000);

GM_setValue("test_set", new Date().getTime());
