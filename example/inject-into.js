// ==UserScript==
// @name         Inject into
// @namespace    https://docs.scriptcat.org/
// @version      0.1.0
// @description  将脚本注入到content环境，以绕过CSP检测，请注意此环境无法访问页面的window，只与页面共享document
// @author       You
// @match        https://benjamin-philipp.com/test-trusted-types.php
// @icon         https://www.google.com/s2/favicons?sz=64&domain=benjamin-philipp.com
// @inject-into  content
// ==/UserScript==

// 插入元素
const div = document.createElement("div");
div.innerHTML = "hello scriptcat";
document.body.append(div);
