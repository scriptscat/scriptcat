// ==UserScript==
// @name         Test @run-in background
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  后台脚本支持 @run-in 区分正常窗口与隐身窗口；同时可透过 GM_info.isIncognito 与 GM_info.userAgentData 取得运行环境
// @author       You
// @background
// @run-in       incognito-tabs
// @grant        GM_log
// ==/UserScript==

return new Promise((resolve) => {
  // 后台脚本指定 @run-in incognito-tabs 后，仅在隐身窗口对应的扩展环境中执行
  // 若改为 normal-tabs 则仅在正常窗口环境执行；不写或写 @run-in normal-tabs 与 @run-in incognito-tabs 时两者皆执行
  GM_log(`run-in: ${GM_info.script["run-in"]}`);
  GM_log(`isIncognito: ${GM_info.isIncognito}`);
  GM_log(`userAgentData: ${JSON.stringify(GM_info.userAgentData)}`);
  resolve();
});
