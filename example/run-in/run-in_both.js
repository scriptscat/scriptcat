// ==UserScript==
// @name         Test @run-in both
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  @run-in normal-tabs & @run-in incognito-tabs 既注入正常标签又注入隐身标签
// @author       You
// @match        https://bbs.tampermonkey.net.cn/*
// @run-in       normal-tabs
// @run-in       incognito-tabs
// ==/UserScript==
console.log(GM_info.script["run-in"]);
