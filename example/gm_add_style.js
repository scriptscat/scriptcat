// ==UserScript==
// @name         gm add style
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  在页面中插入 style 元素，可以绕过 CSP（内容安全策略）限制
// @author       You
// @match        https://github.com/scriptscat/scriptcat
// @grant        GM_addStyle
// ==/UserScript==

/**
 * GM_addStyle
 * ----------------
 * 向页面注入一段 CSS 样式
 *
 * - 会自动创建 <style> 标签
 * - 可绕过 CSP 对 inline style 的限制
 * - 常用于整站换肤 / 隐藏元素 / UI 调整
 */
const el = GM_addStyle(`
body {
    background: #000;
    color: #fff;
}
a { text-decoration: none }
a:link { color: #00f }
a:visited { color: #003399 }
a:hover { color: #ff0000; text-decoration: underline }
a:active { color: #ff0000 }
`);

console.log(el);
