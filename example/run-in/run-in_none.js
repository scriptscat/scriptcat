// ==UserScript==
// @name         Test @run-in none
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  不设置@run-in默认既注入正常标签又注入隐身标签
// @author       You
// @match        https://bbs.tampermonkey.net.cn/*
// ==/UserScript==
console.log(GM_info.script["run-in"]);
