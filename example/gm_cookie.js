// ==UserScript==
// @name         GM cookie操作
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  操作浏览器 Cookie（需 @connect 授权）。每次一个新的域调用都需要用户确定
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM_cookie
// @grant        GM.cookie
// @connect      example.com
// ==/UserScript==

/**
 * GM_cookie（回调风格）
 * ----------------
 * set / list / delete Cookie
 * 每个新域名首次使用都需要用户授权
 */
GM_cookie("set", {
    url: "http://example.com/cookie",
    name: "cookie1",
    value: "value"
}, () => {

    GM_cookie("set", {
        url: "http://www.example.com/",
        domain: ".example.com",
        path: "/path",
        name: "cookie2",
        value: "path"
    }, () => {

        // 按 domain 查询 cookie
        GM_cookie("list", {
            domain: "example.com"
        }, (cookies) => {
            console.log("domain", cookies);
        });

        // 按 url 查询 cookie
        GM_cookie("list", {
            url: "http://example.com/cookie",
        }, (cookies) => {
            console.log("url", cookies);
        });

        // 删除 cookie
        GM_cookie("delete", {
            url: "http://www.example.com/path",
            name: "cookie2"
        }, () => {

            GM_cookie("list", {
                domain: "example.com"
            }, (cookies) => {
                console.log("delete", cookies);
            });

        });
    });
});

/**
 * GM.cookie（Promise / async 风格）
 * ----------------
 * ScriptCat / 新版 TM 推荐写法
 */
console.log(
  "async GM.cookie.list",
  await GM.cookie.list({ domain: "example.com" })
);
