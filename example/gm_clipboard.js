// ==UserScript==
// @name         gm clipboard
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  操作系统剪贴板
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM_setClipboard
// ==/UserScript==

/**
 * GM_setClipboard
 * ----------------
 * 将指定内容写入系统剪贴板
 *
 * - 不需要用户手动复制
 * - 可写入文本 / HTML
 * - 常用于“一键复制”
 */
GM_setClipboard("我爱ScriptCat");
