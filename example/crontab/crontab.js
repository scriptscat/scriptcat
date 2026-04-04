// ==UserScript==
// @name         crontab example
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  定时脚本示例
// @author       You
// @crontab      */15 14-16 * * *
// @grant        GM_log
// @grant        GM_xmlhttpRequest
// @connect      dog.ceo
// ==/UserScript==

return new Promise((resolve, reject) => {
    // Your code here...
    GM_log("下午两点至四点每十五分钟运行一次");
    

    GM_xmlhttpRequest({
        url: "https://dog.ceo/api/breeds/image/random",
        method: "GET",
        responseType: "json",
        anonymous: true,

        onload(resp) {
            if (typeof resp.response.message !== "string") {
                reject("服务器回应错误。");
            }
            else {
                GM_log(`你可能会遇到的狗狗是\n${resp.response.message}`);
                resolve();
            }
        },
        onerror(){
            reject("服务器回应错误。");
        }
    });
});
