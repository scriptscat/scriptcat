// ==UserScript==
// @name         异步GM函数
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  展示 GM.* 异步 Promise API 的使用方式
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.getResourceUrl
// @resource     test.html https://bbs.tampermonkey.net.cn/
// ==/UserScript==

/**
 * 使用立即执行的 async 函数
 * ----------------
 * - 允许在脚本顶层使用 await
 * - 避免污染全局作用域
 */
(async function () {
    'use strict';

    /**
     * GM.setValue / GM.getValue（Promise 风格）
     * ----------------
     * - 新版 GM API 返回 Promise
     * - 用于持久化存储数据（不随标签页关闭而消失）
     * - 作用域为当前脚本
     */

    // 设置一个键值对：test-key = 1
    GM.setValue("test-key", 1).then(() => {

        // 设置完成后再读取该值
        GM.getValue("test-key").then(value => {
            console.log("get test-key value:", value);
        });

    });

    /**
     * GM.getResourceUrl（异步版本）
     * ----------------
     * - 读取通过 @resource 声明的静态资源
     * - 返回的是一个 Promise
     * - resolve 后得到资源的本地 URL（blob / data URL）
     */

    const resourceUrl = await GM.getResourceUrl("test.html");

    // 打印资源对应的 URL
    console.log(resourceUrl);

})();
