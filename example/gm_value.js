// ==UserScript==
// @name         gm value
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  可以持久化存储数据, 并且可以监听数据变化
// @author       You
// @match https://bbs.tampermonkey.net.cn/
// @run-at document-start
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_addValueChangeListener
// @grant GM_listValues
// @grant GM_deleteValue
// @grant GM_cookie
// ==/UserScript==

GM_addValueChangeListener("test_set", function (name, oldval, newval, remote, tabid) {
  GM_cookie("store", tabid,(storeId) => {
    console.log("store",storeId);
  });
});

setInterval(() => {
  console.log(GM_getValue("test_set"));
  console.log(GM_listValues());
}, 2000);

setTimeout(() => {
  GM_deleteValue("test_set");
}, 3000);

GM_setValue("test_set", new Date().getTime());
