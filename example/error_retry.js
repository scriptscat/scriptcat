// ==UserScript==
// @name         重试示例
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @crontab      * * once * *
// @grant        GM_notification
// ==/UserScript==

return new Promise((resolve, reject) => {
	// Your code here...
	GM_notification({
		title: "retry",
		text: "10秒后重试"
	});
	reject(new CATRetryError("xxx错误", 10));
});
