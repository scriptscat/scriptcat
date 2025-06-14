// ==UserScript==
// @name         bg cat input menu
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  在后台脚本中带交互输入的快捷菜单
// @author       You
// @background
// @grant        CAT_registerMenuInput
// @grant        CAT_unregisterMenuInput
// @grant        GM_notification
// ==/UserScript==

return new Promise((resolve) => {
  const id = CAT_registerMenuInput(
    "测试菜单",
    () => {
      console.log(id);
      CAT_unregisterMenuInput(id);
    },
    "z"
  );

  CAT_registerMenuInput(
    "测试菜单boolean",
    (inputValue) => {
      GM_notification({
        title: "测试菜单boolean",
        text: "" + inputValue,
      });
    },
    {
      inputType: "boolean",
      inputLabel: "是否通知",
      inputDefaultValue: true,
      autoClose: false,
    }
  );

  CAT_registerMenuInput(
    "测试菜单text",
    (inputValue) => {
      GM_notification({
        title: "测试菜单text",
        text: "" + inputValue,
      });
    },
    {
      inputType: "text",
      inputLabel: "通知内容",
      inputValue: "text",
      autoClose: false,
    }
  );

  CAT_registerMenuInput(
    "测试菜单number",
    (inputValue) => {
      setTimeout(() => {
        GM_notification({
          title: "测试菜单number",
          text: "" + (1000 + inputValue),
        });
      }, 1000 + inputValue);
    },
    {
      inputType: "number",
      inputLabel: "延迟ms",
      inputPlaceholder: "最低1000ms",
    }
  );

  resolve();
});
