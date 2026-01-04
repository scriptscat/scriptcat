// ==UserScript==
// @name         gm open tab
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  打开并控制新标签页
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM_openInTab
// ==/UserScript==

/**
 * GM_openInTab
 * ----------------
 * 打开一个新标签页并返回控制对象
 */
const tab = GM_openInTab("https://scriptcat.org/search");

// 监听标签页关闭事件
tab.onclose = () => {
    console.log("close");
}

// 3 秒后主动关闭该标签页
setTimeout(() => {
    tab.close();
}, 3000);
