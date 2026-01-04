// ==UserScript==
// @name         gm get resource
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  读取 @resource 声明的静态资源。这个资源会被管理器进行缓存,不可修改
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @resource     bbs https://bbs.tampermonkey.net.cn/
// @grant        GM_getResourceURL
// @grant        GM_getResourceText
// ==/UserScript==

/**
 * GM_getResourceURL
 * ----------------
 * 获取资源的本地 blob / data URL
 */
console.log(GM_getResourceURL("bbs"));
console.log(GM_getResourceURL("bbs", false));
console.log(GM_getResourceURL("bbs", true));

/**
 * GM_getResourceText
 * ----------------
 * 以纯文本方式读取资源内容
 */
console.log(GM_getResourceText("bbs"));
