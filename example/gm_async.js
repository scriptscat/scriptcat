// ==UserScript==
// @name         异步GM函数
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM.getValue
// @grant        GM.setValue
// @resource     test.html https://bbs.tampermonkey.net.cn/
// @grant        GM.getResourceUrl
// ==/UserScript==

(async function () {
    'use strict';
    GM.setValue("test-key", 1).then(() => {
        GM.getValue("test-key").then(value => {
            console.log("get test-key value: ", value);
        })
    });
    const resourceUrl = await GM.getResourceUrl("test.html");
    console.log(resourceUrl);
})();