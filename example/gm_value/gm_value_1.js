// ==UserScript==
// @name         gm value storage 设置方
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  多个脚本之间共享数据 设置方
// @author       You
// @match https://bbs.tampermonkey.net.cn/
// @run-at document-start
// @grant GM_setValue
// @grant GM_deleteValue
// @storageName example
// ==/UserScript==

setTimeout(() => {
  GM_deleteValue("test_set");
}, 3000);

GM_setValue("test_set", new Date().getTime());
