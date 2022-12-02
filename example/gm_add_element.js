// ==UserScript==
// @name         gm add element
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  在页面中插入元素,可以绕过CSP限制
// @author       You
// @match        https://github.com/scriptscat/scriptcat
// @grant        GM_addElement
// ==/UserScript==

const el = GM_addElement(document.querySelector('.BorderGrid-cell'), "img", {
    src: "https://bbs.tampermonkey.net.cn/uc_server/avatar.php?uid=4&size=small&ts=1"
});

console.log(el);