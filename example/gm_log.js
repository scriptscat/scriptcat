// ==UserScript==
// @name         gm log
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  脚本日志系统，支持分级与标签。为你的脚本加上丰富的日志吧
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM_log
// ==/UserScript==

/**
 * GM_log
 * ----------------
 * 结构化日志输出
 *
 * 参数：
 * 1. 日志内容
 * 2. 日志级别（info / warn / error）
 * 3. 附加标签信息
 */
GM_log("log message", "info", {
  component: "example"
});
