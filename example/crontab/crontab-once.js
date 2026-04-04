// ==UserScript==
// @name         once 示例 - 每天只执行一次
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  演示 once 语法：每天在工作时间（9-18点）内第一次触发时执行，当天不再重复
// @author       You
// @crontab      * 9-18 once * *
// @grant        GM_log
// @grant        GM_xmlhttpRequest
// @connect      httpbin.org
// ==/UserScript==

/**
 * `once` 语法说明：
 *
 *   * 9-18 once * *
 *   ↑ ↑    ↑
 *   分 时   日位的 once
 *
 * - 分位 `*`、时位 `9-18`：每天 9:00–18:59 的每分钟都是候选时间
 * - 日位 `once`：在"每天"这个周期内，只允许执行一次
 *
 * 效果：每天工作时间内，第一次触发时执行；执行成功后，当天剩余时间不再执行。
 * 次日 9 点起重置，重新等待第一次触发。
 *
 * 常见用途：每天定时同步、上报、检查类任务。
 */
return new Promise((resolve, reject) => {
    GM_log("今天还没执行过，开始执行……");

    GM_xmlhttpRequest({
        url: "https://httpbin.org/get",
        method: "GET",
        responseType: "json",
        anonymous: true,

        onload(resp) {
            if (resp.status === 200) {
                GM_log("执行成功，今天不会再运行。");
                resolve("ok");
            } else {
                reject(`请求失败，状态码：${resp.status}`);
            }
        },
        onerror() {
            reject("网络错误，请求失败。");
        },
    });
});
