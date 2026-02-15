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

// 1. 下载网络资源

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

// 2. 下载 Blob 资源
// 参考： https://github.com/Tampermonkey/tampermonkey/issues/2591

const pngData = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0xae, 0xb4, 0xfa, 0x77, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

const testImageUrl = URL.createObjectURL(new Blob([pngData], { type: 'image/png' }));

GM_download({
    url: testImageUrl,
    name: 'test/test.png', // 储存在 test 资料夹内
    conflictAction: 'overwrite', // 每次都使用固定的档案名
});
