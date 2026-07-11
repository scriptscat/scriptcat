// ==UserScript==
// @name         crontab example
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.2.0
// @description  定时脚本示例
// @author       You
// @crontab      */15 14-16 * * *
// @grant        GM_log
// @grant        GM_xmlhttpRequest
// @connect      httpbun.com
// ==/UserScript==

return new Promise((resolve, reject) => {
  GM_log("下午两点至四点每十五分钟运行一次");

  GM_xmlhttpRequest({
    url: "https://httpbun.com/get",
    method: "GET",
    responseType: "json",
    anonymous: true,

    onload(resp) {
      const data = resp.response;
      if (resp.status !== 200 || data?.url !== "https://httpbun.com/get") {
        reject("服务器回应错误。");
        return;
      }

      GM_log(`定时请求成功：\n${data.url}`);
      resolve();
    },
    onerror() {
      reject("服务器回应错误。");
    },
  });
});
