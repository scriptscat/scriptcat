// ==UserScript==
// @name         once(...) 示例 - 每小时整点或半点执行一次
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  演示 once(...) 语法：每小时仅在 0 分或 30 分时触发，且每小时最多执行一次
// @author       You
// @crontab      once(0,30) * * * *
// @grant        GM_log
// @grant        GM_xmlhttpRequest
// @connect      httpbin.org
// ==/UserScript==

/**
 * `once(...)` 语法说明：
 *
 *   once(0,30) * * * *
 *   ↑          ↑
 *   分位        时位及后续字段
 *
 * - `once(0,30)` 写在分位：
 *   - 括号内 `0,30` 是该字段实际的 cron 值，即候选分钟为 0 分和 30 分
 *   - `once` 限定在"每分钟"这个周期……？
 *
 * 等等，once 在分位（位置1），对应 ONCE_MAP 中的 minute 周期——
 * 即"每分钟只执行一次"。结合候选值 0,30，实际效果为：
 * 每小时的 0 分或 30 分时，各自作为独立的"分钟周期"，各执行一次。
 *
 * 更常见的用法是把 once(...) 放在时位，精确指定候选小时：
 *
 *   * once(9,12,18) * * *
 *
 * - 时位 `once(9,12,18)`：每天 9点、12点、18点为候选时间
 * - 日位为 `*`，once 在时位（位置2），周期为"每小时"
 * - 效果：每天 9点/12点/18点各在当小时内执行一次
 *
 * 本示例使用：
 *   * once(9,12,18) * * *
 * 每天仅在 9、12、18 点时段内各执行一次，其余小时不执行。
 *
 * 与 `* 9,12,18 * * *` 的区别：
 *   - 后者在 9/12/18 点的每一分钟都会执行（共 60×3 次/天）
 *   - once(9,12,18) 在 9/12/18 点各只执行一次（共 3 次/天）
 */
return new Promise((resolve, reject) => {
    const hour = new Date().getHours();
    GM_log(`当前小时：${hour}，本小时内第一次执行，开始请求……`);

    GM_xmlhttpRequest({
        url: "https://httpbin.org/get",
        method: "GET",
        responseType: "json",
        anonymous: true,

        onload(resp) {
            if (resp.status === 200) {
                GM_log(`${hour} 点执行成功，本小时内不再重复。`);
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
