// ==UserScript==
// @name         Pre Document Start
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  使用 early-start 可以比网页更快的加载脚本进行执行，但是会存在一些性能问题与GM API使用限制
// @author       You
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        CAT_ScriptLoaded
// @early-start
// @match        http://test-case.ggnb.top/is_trusted/is_trusted.html
// ==/UserScript==

console.log("early-start 获取值", GM_getValue("test"));

console.log("early-start 设置值", GM_setValue("test", Math.random()));

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

unsafeWindow.onload = () => {
  document.querySelector("#btn").click();
};

CAT_ScriptLoaded().then(() => {
  console.log("脚本完全加载完成");
});
