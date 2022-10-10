// ==UserScript==
// @name         gm notification
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  用来发送一个浏览器通知, 支持图标/文字/进度条(进度条只在 Chrome 有效)
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant GM_notification
// ==/UserScript==

let i;
GM_notification({
    title: '倒计时',
    text: '准备进入倒计时,创建和获取通知id',
    ondone: (byUser) => {
        console.log('done user:', byUser);
        clearInterval(i);
    },
    onclick: () => {
        console.log('click');
    },
    oncreate: (id) => {
        let t = 1;
        i = setInterval(() => {
            GM_updateNotification(id, {
                title: '倒计时',
                text: (60 - t) + 's倒计时',
                progress: 100 / 60 * t
            });
            if (t == 60) {
                clearInterval(i);
                GM_updateNotification(id, {
                    title: '倒计时',
                    text: '倒计时结束',
                    progress: 100
                });
            }
            t++;
        }, 1000);
    },
    // 开启进度条模式
    progress: 0,
});
