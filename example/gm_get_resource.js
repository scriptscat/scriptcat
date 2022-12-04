// ==UserScript==
// @name         gm get resource
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  通过@resource引用资源,这个资源会被管理器进行缓存,不可修改
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @resource     bbs https://bbs.tampermonkey.net.cn/
// @grant        GM_getResourceURL
// @grant        GM_getResourceText
// ==/UserScript==


console.log(GM_getResourceURL("bbs"));
console.log(GM_getResourceURL("bbs", false));
console.log(GM_getResourceURL("bbs", true));
console.log(GM_getResourceText("bbs"));