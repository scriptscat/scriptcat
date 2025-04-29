// ==UserScript==
// @name         gm value storage 读取与监听方 - 后台脚本
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  多个脚本之间共享数据 读取与监听方 - 后台脚本
// @author       You
// @run-at document-start
// @grant GM_getValue
// @grant GM_addValueChangeListener
// @grant GM_listValues
// @grant GM_cookie
// @storageName example
// @background
// ==/UserScript==

return new Promise((resolve) => {
  GM_addValueChangeListener("test_set", function (name, oldval, newval, remote) {
    console.log("value change", name, oldval, newval, remote);
  });

  setInterval(() => {
    console.log("test_set: ", GM_getValue("test_set"));
    console.log("value list:", GM_listValues());
  }, 2000);
  // 永不返回resolve表示永不结束
  // resolve()
});
