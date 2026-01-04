// ==UserScript==
// @name         gm download
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  使用脚本下载文件
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        GM_download
// ==/UserScript==

/**
 * GM_download
 * ----------------
 * 直接由脚本发起下载
 *
 * 支持：
 * - 自定义文件名
 * - 自定义 header
 * - 进度回调 / 完成回调
 */
GM_download({
    url: "https://scriptcat.org/api/v2/open/crx-download/ndcooeababalnlpkfedmmbbbgkljhpjf",
    name: "scriptcat.crx",

    headers: {
        referer: "http://www.example.com/",
        origin: "www.example.com"
    },

    onprogress(data) {
        console.log("progress", data);
    },

    onload(data) {
        console.log("load", data);
    },
});
