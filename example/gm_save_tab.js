// ==UserScript==
// @name         gm get/save tab
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  用于保存当前标签页的数据, 关闭后会自动删除, 可以获取其它标签页的数据
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant GM_saveTab
// @grant GM_getTab
// @grant GM_getTabs
// ==/UserScript==

GM_saveTab({ test: "save" });

GM_getTab(data => {
    console.log(data);
});

GM_getTabs(data => {
    console.log(data);
});
