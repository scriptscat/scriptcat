// ==UserScript==
// @name         Test @run-in normal-tabs
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  @run-in normal-tabs 只注入正常标签
// @author       You
// @match        https://bbs.tampermonkey.net.cn/*
// @run-in       normal-tabs
// ==/UserScript==
console.log(GM_info.script["run-in"]);
