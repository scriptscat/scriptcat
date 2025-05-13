// ==UserScript==
// @name         gm download
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant GM_download
// ==/UserScript==

GM_download({
    url: "https://scriptcat.org/api/v2/open/crx-download/ndcooeababalnlpkfedmmbbbgkljhpjf",
    name: "scriptcat.crx",
    headers: {
        "referer": "http://www.example.com/",
        "origin": "www.example.com"
    }, onprogress(data) {
        console.log(data);
    }
});
