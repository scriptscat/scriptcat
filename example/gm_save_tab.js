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

/**
 * GM_saveTab
 * ----------------
 * 向「当前浏览器标签页」保存一份数据
 *
 * - 数据仅与当前标签页绑定
 * - 刷新页面数据仍然存在
 * - 关闭该标签页后，数据会被自动清除
 *
 * 这里我们保存一个对象：{ test: "save" }
 */
GM_saveTab({ test: "save" });

/**
 * GM_getTab
 * ----------------
 * 获取「当前标签页」之前通过 GM_saveTab 保存的数据
 *
 * 回调函数会接收到保存的数据对象
 */
GM_getTab(data => {
    console.log(data);
});

/**
 * GM_getTabs
 * ----------------
 * 获取「同一个脚本在所有打开的标签页」中保存的数据
 *
 * 返回的是一个对象：
 * {
 *   tabId1: { ... },
 *   tabId2: { ... },
 *   ...
 * }
 */
GM_getTabs(data => {
    console.log(data);
});
