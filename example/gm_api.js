// ==UserScript==
// @name         GM_api Example
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  实现document-superStart
// @author       You
// @run-at       document-start
// @grant        GM_api
// @grant        GM_getValue
// @grant        GM_setValue
// @match        http://test-case.ggnb.top/is_trusted/is_trusted.html
// ==/UserScript==

console.log("await GM_api() 前为网页环境 用于执行注入时机敏感代码");

const realAdd = document.addEventListener;
document.addEventListener = function (type, fuc) {
  if (type == "click") {
    const realFuc = fuc;
    fuc = function (e) {
      const obj = { isTrusted: true, target: e.target };
      Object.setPrototypeOf(obj, MouseEvent.prototype);
      realFuc.call(this, obj);
    };
  }
  realAdd.call(this, type, fuc);
};

// 伪代码 用于分割代码
await GM_api();

console.log("await GM_api() 后为沙盒环境");

unsafeWindow.onload = () => {
  document.querySelector("#btn").click();
};

console.log(GM_getValue("test"));
GM_setValue("test", Math.random());
