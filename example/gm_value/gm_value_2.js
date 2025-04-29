// ==UserScript==
// @name         gm value storage 读取与监听方
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  多个脚本之间共享数据 读取与监听方
// @author       You
// @match https://bbs.tampermonkey.net.cn/
// @run-at document-start
// @grant GM_getValue
// @grant GM_addValueChangeListener
// @grant GM_listValues
// @grant GM_cookie
// @storageName example
// ==/UserScript==

GM_addValueChangeListener("test_set", function (name, oldval, newval, remote) {
  console.log("test_set change", name, oldval, newval, remote);
});

setInterval(() => {
  console.log("test_set: ", GM_getValue("test_set"));
  console.log("value list:", GM_listValues());
}, 2000);
