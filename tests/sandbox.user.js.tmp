// ==UserScript==
// @name         油猴兼容测试
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @icon         https://www.google.com/s2/favicons?domain=tampermonkey.net.cn
// @resource icon https://bbs.tampermonkey.net.cn/favicon.ico
// @resource html https://bbs.tampermonkey.net.cn/
// @resource xml https://bbs.tampermonkey.net.cn/sitemap.xml
// @grant GM_getResourceText
// @grant GM_getResourceURL
// @grant GM_cookie
// @grant GM_saveTab
// @grant GM_getTabs
// @grant GM_getTab
// @grant GM_registerMenuCommand
// ==/UserScript==

GM_registerMenuCommand('test', () => {
    console.log(123);
})

setTimeout(() => {

    GM_registerMenuCommand('test', () => {
        console.log(121231233);
    })
}, 1000);

console.log(window.scrollX, window.scrollY);

console.log(addEventListener);

let uia = (function () {
    console.log('123');
    return {
        tip: () => {
            console.log('aqwe');
        }
    }
})()

uia.tip();

function evalTest() {
    console.log('okk');
}

setTimeout(() => {
    console.log('okk2', window.scrollX, window.scrollY);
    window.scrollY = 633;
    console.log('okk2', window.scrollX, window.scrollY);
}, 1000)

let f = eval('()=>{evalTest()}');
f();
console.log(this);
eval('console.log(this)');

window.onload = () => {
    console.log('onload1');
}

window.onload = () => {
    console.log('onload2');
}

globalThis.a = 1;

console.log(globalThis.a == 2, globalThis.a);

GM_cookie('store', {}, function () {
    console.log(arguments);
});

setTimeout(() => {
    console.log(GM_getTab((e) => {
        console.log(e)
        e.op = '123';
        GM_saveTab(e);
    }));
    GM_getTabs(e => {
        console.log(e);
    })
}, 1000)
