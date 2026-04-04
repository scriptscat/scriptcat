// ==UserScript==
// @name         once(...) 示例 - 工作时间内每小时执行一次
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  演示 once(...) 语法：每天 9 时至 17 时期间，每小时执行一次
// @author       You
// @crontab      * once(9-17) * * *
// @grant        GM_log
// @grant        GM_xmlhttpRequest
// @connect      httpbin.org
// ==/UserScript==

/**
 * `once(expr)` 语法说明：
 *
 *   * once(9-17) * * *
 *   ↑ ↑
 *   分 时位
 *
 * - `once(9-17)` 写在时位：
 *   - 括号内 `9-17` 是时位的候选值，即只有 9 时至 17 时才会触发
 *   - `once` 锁定"每小时"这个周期，每小时重置一次
 *
 * 效果：每天 9:00–17:59，每小时在当小时内第一次命中时执行，共执行 9 次/天。
 * 18 时起不再触发，次日 9 时重新开始。
 *
 * 与 `* 9-17 * * *` 的区别：
 *   - `* 9-17 * * *`      每小时的每一分钟都执行（共 60×9 = 540 次/天）
 *   - `* once(9-17) * * *` 每小时只执行一次（共 9 次/天）
 *
 * 常见用途：工作时间内定期轮询、状态检查、数据同步等。
 */
return new Promise((resolve, reject) => {
    const hour = new Date().getHours();
    GM_log(`当前时间：${hour} 时，本小时内第一次触发，开始执行……`);

    GM_xmlhttpRequest({
        url: "https://httpbin.org/get",
        method: "GET",
        responseType: "json",
        anonymous: true,

        onload(resp) {
            if (resp.status === 200) {
                GM_log(`${hour} 时执行成功，本小时内不再重复。`);
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
