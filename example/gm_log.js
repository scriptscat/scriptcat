// ==UserScript==
// @name         gm log
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  日志功能,为你的脚本加上丰富的日志吧,支持日志分级与日志标签
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant GM_log
// ==/UserScript==

GM_log("log message", "info", { component: "example" });