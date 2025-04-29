// ==UserScript==
// @name         gm menu
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  创建菜单, 可以显示在右上角的插件弹出页和浏览器右键菜单中
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant GM_registerMenuCommand
// @grant GM_unregisterMenuCommand
// ==/UserScript==

const id = GM_registerMenuCommand(
  "测试菜单",
  () => {
    console.log(id);
    GM_unregisterMenuCommand(id);
  },
  "h"
);

const id2 = GM_registerMenuCommand(
  "测试菜单2",
  () => {
    console.log(id2);
    GM_unregisterMenuCommand(id2);
  },
  "j"
);
