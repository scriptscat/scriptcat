// ==UserScript==
// @name         Unwrap E2E Test
// @namespace    https://docs.scriptcat.org/
// @version      1.0.0
// @description  E2E 测试 @unwrap 功能
// @author       ScriptCat
// @match        https://content-security-policy.com/?unwrap_e2e_test
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @unwrap
// ==/UserScript==

var __unwrap_e2e_global_var = "unwrap_success";

(function () {
  "use strict";

  const { describe, it, expect, run } = SCTest.create({ name: "@unwrap E2E 测试" });

  describe("@unwrap 环境", () => {
    it("GM 对象在 unwrap 模式下为 undefined", () => {
      expect(typeof GM).toBe("undefined");
    });

    it("GM_setValue 在 unwrap 模式下为 undefined", () => {
      expect(typeof GM_setValue).toBe("undefined");
    });

    it("全局变量可在页面作用域访问", () => {
      expect(window.__unwrap_e2e_global_var).toBe("unwrap_success");
    });
  });

  run();
})();
