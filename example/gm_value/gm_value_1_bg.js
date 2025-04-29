// ==UserScript==
// @name         gm value storage 设置方 - 定时脚本
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  多个脚本之间共享数据 设置方 - 定时脚本
// @author       You
// @run-at document-start
// @grant GM_setValue
// @grant GM_deleteValue
// @storageName example
// @crontab */5 * * * * *
// ==/UserScript==

return new Promise((resolve) => {
  GM_setValue("test_set", new Date().getTime());
  resolve();
});
