// ==UserScript==
// @name         A Scriptlet for @unwrap test
// @namespace    none
// @version      2026-02-07
// @description  try to take over the world!
// @author       You
// @match        https://*/*?test_unwrap*
// @exclude      /test_\w+_excluded/
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js#sha384-vtXRMe3mGCbOeY7l30aIg8H9p3GdeSe4IFlP6G8JMa7o7lXvnz3GFKzPxzJdPfGK
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@479d31cc494f68a4e66a33a9c2c47cdb0e0bd428/example/tests/lib/sctest.js
// @unwrap
// ==/UserScript==

// include: https://example.com/?test_unwrap_123
// exclude: https://example.com/?test_unwrap_excluded

var test_global_injection = "success";
// User can access the variable "test_global_injection" directly in DevTools

(function () {
  const { describe, check, expect, run } = SCTest.create({ name: "@unwrap 测试" });

  describe("@unwrap 环境", () => {
    check("自动断言", "GM 不应暴露", () => expect(typeof GM).toBe("undefined"), null, null, null);
    check("自动断言", "GM_setValue 不应暴露", () => expect(typeof GM_setValue).toBe("undefined"), null, null, null);
    check("自动断言", "jQuery 应可用", () => expect(typeof jQuery).toBe("function"), null, null, null);
  });

  run();
})();
