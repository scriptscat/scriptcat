// ==UserScript==
// @name         window.onurlchange 示例
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  监听页面 URL 变化（兼容 Tampermonkey）
// @author       You
// @match        *://*/*
// @grant        window.onurlchange
// ==/UserScript==

if (window.onurlchange === null) {
  // feature is supported

  // 方式一：使用 window.onurlchange 赋值
  window.onurlchange = function (e) {
    console.log("URL changed to:", e.url);
  };

  // 方式二：使用 addEventListener
  window.addEventListener("urlchange", function (e) {
    console.log("URL changed (addEventListener):", e.url);
  });
}
