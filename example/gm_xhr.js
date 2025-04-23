// ==UserScript==
// @name         gm xhr
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  无视浏览器的cors的跨域请求,可以设置各种unsafeHeader与cookie,需要使用@connect获取权限,或者由用户确认
// @author       You
// @grant        GM_xmlhttpRequest
// @match        https://bbs.tampermonkey.net.cn/
// @connect      tampermonkey.net.cn
// ==/UserScript==

const data = new FormData();

data.append("username", "admin");

data.append(
  "file",
  new File(["foo"], "foo.txt", {
    type: "text/plain",
  })
);

GM_xmlhttpRequest({
  url: "https://bbs.tampermonkey.net.cn/",
  method: "POST",
  responseType: "blob",
  data: data,
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
