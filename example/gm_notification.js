// ==UserScript==
// @name         gm notification
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  用来发送一个浏览器通知, 支持图标/文字/进度条(进度条只在 Chrome 有效)
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM_notification
// ==/UserScript==

/**
 * @typedef {import('../src/types/scriptcat')} ScriptCat
 */

let i;
GM_notification({
  title: "倒计时",
  text: "准备进入倒计时,创建和获取通知id",
  ondone: (byUser) => {
    console.log("done user:", byUser);
    clearInterval(i);
  },
  onclick: () => {
    console.log("click");
  },
  oncreate: (id) => {
    let t = 1;
    i = setInterval(() => {
      GM_updateNotification(id, {
        title: "倒计时",
        text: 60 - t + "s倒计时",
        progress: (100 / 60) * t,
      });
      if (t == 60) {
        clearInterval(i);
        GM_updateNotification(id, {
          title: "倒计时",
          text: "倒计时结束",
          progress: 100,
        });
      }
      t++;
    }, 1000);
  },
  // 开启进度条模式
  progress: 0,
});

// 示例2: 综合功能通知 - 使用更多特性
GM_notification({
  title: "综合功能通知",
  text: "这是一个展示多种特性的通知示例",
  tag: "feature-demo", // 使用相同的tag可以覆盖之前的通知，否则会创建新的通知
  image: "https://bbs.tampermonkey.net.cn/favicon.ico", // 自定义图标
  timeout: 10000, // 10秒后自动关闭
  url: "https://bbs.tampermonkey.net.cn/", // 关联URL
  onclick: (event) => {
    console.log("通知被点击:", event);
    // event.preventDefault(); // 阻止打开url
  },
  oncreate: (event) => {
    console.log("综合功能通知已创建，ID:", event.id);
  },
  ondone: (user) => {
    console.log("综合功能通知完成，用户操作:", user);
  },
});
