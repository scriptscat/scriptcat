// ==UserScript==
// @name         gm notification
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant GM_notification
// ==/UserScript==

GM_notification({
    title: "title",
    text: "test notification",
    timeout: 2000,
    ondone() {
        console.log("done", arguments);
    }
});