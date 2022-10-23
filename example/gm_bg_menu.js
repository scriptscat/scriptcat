// ==UserScript==
// @name         bg gm menu
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  在后台脚本中使用菜单
// @author       You
// @background
// @grant GM_registerMenuCommand
// @grant GM_unregisterMenuCommand
// ==/UserScript==

return new Promise((resolve) => {
  const id = GM_registerMenuCommand("测试菜单", () => {
    console.log(id);
    GM_unregisterMenuCommand(id);
    resolve();
  }, "z");
});
