// ==UserScript==
// @name         GM xhr test
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @grant        GM_xmlhttpRequest
// @match        https://bbs.tampermonkey.net.cn/
// @connect      tampermonkey.net.cn
// ==/UserScript==

GM_xmlhttpRequest({
  url: "https://bbs.tampermonkey.net.cn/",
  method: "POST",
  responseType: "blob",
  onload(resp) {
    console.log("onload", resp);
  },
  onreadystatechange(resp) {
    console.log("onreadystatechange", resp);
  },
  onloadend(resp) {
    console.log("onloadend", resp);
  },
});
