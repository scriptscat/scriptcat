// ==UserScript==
// @name         GM cookie操作
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  可以控制浏览器的cookie, 必须指定@connect, 并且每次一个新的域调用都需要用户确定
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM_cookie
// @grant        GM.cookie
// @connect      example.com
// ==/UserScript==

GM_cookie("set", {
    url: "http://example.com/cookie",
    name: "cookie1", value: "value"
}, () => {
    GM_cookie("set", {
        url: "http://www.example.com/",
        domain: ".example.com", path: "/path",
        name: "cookie2", value: "path"
    }, () => {
        GM_cookie("list", {
            domain: "example.com"
        }, (cookies) => {
            console.log("domain", cookies);
        });
        GM_cookie("list", {
            url: "http://example.com/cookie",
        }, (cookies) => {
            console.log("domain", cookies);
        });
        GM_cookie("delete", {
            url: "http://www.example.com/path",
            name: "cookie2"
        }, () => {
            GM_cookie("list", {
                domain: "example.com"
            }, (cookies) => {
                console.log("delete", cookies);
            });
        })
    });
});

console.log("async GM.cookie.list", await GM.cookie.list({
    domain: "example.com"
}));
