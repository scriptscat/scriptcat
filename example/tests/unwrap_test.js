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
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @unwrap
// ==/UserScript==

// include: https://example.com/?test_unwrap_123
// exclude: https://example.com/?test_unwrap_excluded

var test_global_injection = "success";
// User can access the variable "test_global_injection" directly in DevTools

(function () {
  const { describe, it, expect, run } = SCTest.create({ name: "@unwrap 测试" });

  describe("@unwrap 环境", () => {
    it("GM 不应暴露", () => expect(typeof GM).toBe("undefined"));
    it("GM_setValue 不应暴露", () => expect(typeof GM_setValue).toBe("undefined"));
    it("jQuery 应可用", () => expect(typeof jQuery).toBe("function"));
  });

  run();
})();
