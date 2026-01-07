// ==UserScript==
// @name         gm xhr
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  绕过 CORS 的跨域请求。可以设置各种unsafeHeader与cookie,需要使用@connect获取权限,或者由用户确认
// @author       You
// @grant        GM_xmlhttpRequest
// @match        https://bbs.tampermonkey.net.cn/
// @connect      tampermonkey.net.cn
// ==/UserScript==

/**
 * 构造 FormData
 */
const data = new FormData();
data.append("username", "admin");
data.append(
  "file",
  new File(["foo"], "foo.txt", { type: "text/plain" })
);

/**
 * GM_xmlhttpRequest
 * ----------------
 * 脚本级网络请求：
 * - 无视 CORS
 * - 可自定义 cookie / header
 * - 支持文件上传
 */
GM_xmlhttpRequest({
  url: "https://bbs.tampermonkey.net.cn/",
  method: "POST",
  responseType: "blob",
  data,
  cookie: "ceshi=123",
  anonymous: true,

  headers: {
    referer: "http://www.example.com/",
    origin: "www.example.com",
    // 为空将不会发送此header
    "sec-ch-ua-mobile": "",
  },

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
