// ==UserScript==
// @name         gm value listener change
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  监听脚本数据变更
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_listValues
// @grant        GM_setValue
// ==/UserScript==

GM_addValueChangeListener("test_set", function (name, oldval, newval, remote) {
    console.log("test_set change", name, oldval, newval, remote);
});

setInterval(() => {
    console.log("test_set: ", GM_getValue("test_set"));
    console.log("value list:", GM_listValues());
    GM_setValue("test_set", Date.now());
}, 2000);
