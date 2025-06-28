// ==UserScript==
// @name         gm add style
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  在页面中插入style元素,可以绕过CSP限制
// @author       You
// @match        https://github.com/scriptscat/scriptcat
// @grant        GM_addStyle
// ==/UserScript==

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