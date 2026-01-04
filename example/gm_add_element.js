// ==UserScript==
// @name         gm add element
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  在页面中插入元素，可以绕过 CSP（内容安全策略）限制
// @author       You
// @match        https://github.com/scriptscat/scriptcat
// @grant        GM_addElement
// ==/UserScript==

/**
 * GM_addElement
 * ----------------
 * 在指定父节点下创建并插入一个 DOM 元素
 *
 * 与 document.createElement + appendChild 不同：
 * - 可绕过页面 CSP 对 inline / remote 资源的限制
 * - 适合插入 img / script / style 等受限元素
 *
 * 参数说明：
 * 1. 父节点
 * 2. 元素标签名
 * 3. 属性对象
 */
const el = GM_addElement(document.querySelector('.BorderGrid-cell'), "img", {
    src: "https://bbs.tampermonkey.net.cn/uc_server/avatar.php?uid=4&size=small&ts=1"
});

// 打印创建出来的 DOM 元素
console.log(el);
