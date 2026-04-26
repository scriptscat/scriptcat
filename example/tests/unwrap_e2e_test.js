// ==UserScript==
// @name         Unwrap E2E Test
// @namespace    https://docs.scriptcat.org/
// @version      1.0.0
// @description  E2E 测试 @unwrap 功能
// @author       ScriptCat
// @match        https://content-security-policy.com/*
// @grant        GM_setValue
// @unwrap
// ==/UserScript==

var __unwrap_e2e_global_var = "unwrap_success";

(function () {
  "use strict";

  let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  function test(name, fn) {
    testResults.total++;
    try {
      fn();
      testResults.passed++;
      console.log("%c✓ " + name, "color: green;");
      return true;
    } catch (error) {
      testResults.failed++;
      console.error("%c✗ " + name, "color: red;", error);
      return false;
    }
  }

  function assert(expected, actual, message) {
    if (expected !== actual) {
      var valueInfo = "期望 " + JSON.stringify(expected) + ", 实际 " + JSON.stringify(actual);
      var error = message ? message + " - " + valueInfo : "断言失败: " + valueInfo;
      throw new Error(error);
    }
  }

  // ============ @unwrap 测试 ============
  console.log("%c=== @unwrap E2E 测试开始 ===", "color: blue; font-size: 16px; font-weight: bold;");

  // 测试1: GM API 在 unwrap 模式下为 undefined
  test("GM 对象在 unwrap 模式下为 undefined", function () {
    assert("undefined", typeof GM, "GM 应为 undefined");
  });

  test("GM_setValue 在 unwrap 模式下为 undefined", function () {
    assert("undefined", typeof GM_setValue, "GM_setValue 应为 undefined");
  });

  // 测试2: 脚本代码在页面全局作用域执行
  test("全局变量可在页面作用域访问", function () {
    assert("unwrap_success", window.__unwrap_e2e_global_var, "全局变量应可访问");
  });

  // ============ 测试总结 ============
  console.log("\n%c=== 测试结果总结 ===", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("总测试数: " + testResults.total);
  console.log("%c通过: " + testResults.passed, "color: green; font-weight: bold;");
  console.log("%c失败: " + testResults.failed, "color: red; font-weight: bold;");
})();
