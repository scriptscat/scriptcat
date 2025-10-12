// ==UserScript==
// @name         ScriptCat PR #831 菜单演示（二级菜单 & 分隔线）
// @namespace    demo.pr831.scriptcat
// @version      1.0.0
// @description  演示 GM_registerMenuCommand 新增的 nested（二级菜单）与 separator（分隔线）选项；兼容 TM/SC。
// @author       you
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(async function () {
  "use strict";

  const test = 4;

  if (test === 1) {
    // 1 测试分隔线

    GM_registerMenuCommand("Item 1");
    GM_registerMenuCommand("");
    let itemId = GM_registerMenuCommand("Some Item");
    GM_registerMenuCommand("Item 2");
    GM_registerMenuCommand("");
    GM_registerMenuCommand("Some Item");
    GM_unregisterMenuCommand(itemId); // 可注䆁掉看看
  }

  if (test === 2) {
    // 2 测试分隔线 + 单独菜单项目

    GM_registerMenuCommand("Item 1");
    GM_registerMenuCommand("");
    let itemId = GM_registerMenuCommand("Some Item", { individual: true }); // 单独显示，不合并
    GM_registerMenuCommand("Item 2");
    GM_registerMenuCommand("");
    GM_registerMenuCommand("Some Item", { individual: true }); // 单独显示，不合并
    // GM_unregisterMenuCommand(itemId);
  }

  if (test === 3) {
    // 3 测试nested: false + 分隔线

    GM_registerMenuCommand("Item 1");
    GM_registerMenuCommand("");
    let itemId = GM_registerMenuCommand("Some Item", { nested: false }); // 单独显示，不合并
    GM_registerMenuCommand("Item 2");
    GM_registerMenuCommand("");
    GM_registerMenuCommand("", { nested: false });
    GM_registerMenuCommand("Some Item", { nested: false }); // 单独显示，不合并
    // GM_unregisterMenuCommand(itemId);
  }

  if (test === 4) {
    // 4 测试nested: false + 分隔线 + 单独菜单项目

    GM_registerMenuCommand("Item 1");
    GM_registerMenuCommand("");
    let itemId = GM_registerMenuCommand("Some Item", { individual: true, nested: false }); // 单独显示，不合并
    GM_registerMenuCommand("Item 2");
    GM_registerMenuCommand("");
    GM_registerMenuCommand("", { nested: false });
    GM_registerMenuCommand("Some Item", { individual: true, nested: false }); // 单独显示，不合并
    // GM_unregisterMenuCommand(itemId);
  }
})();
