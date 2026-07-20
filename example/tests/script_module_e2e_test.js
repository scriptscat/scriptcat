// ==UserScript==
// @name         @script-module E2E Test
// @namespace    https://docs.scriptcat.org/
// @version      1.0.0
// @description  E2E 测试 @script-module 功能（以 <script type="module"> 注入）
// @author       ScriptCat
// @match        https://content-security-policy.com/?script_module_e2e_test
// @grant        GM.getValue
// @grant        GM.setValue
// @script-module
// ==/UserScript==

// 真正的 ES module 才能使用静态 `import ... from`；普通 <script>（非 module）遇到此语法
// 会直接抛出 SyntaxError，导致整份脚本都无法执行。以此验证注入的确是 <script type="module">
import { addNumbers, MODULE_LIB_MARKER } from "/module-lib.js";

// module 顶层的 this 应为 undefined（普通 <script> 顶层 this 为 window），
// 必须在模块顶层（而非函数内）读取才能反映真实的执行上下文
const __sc_module_top_level_this_is_undefined = typeof this === "undefined";

// module 顶层的 const 声明不会挂载到 window 上（与普通注入脚本的顶层 var 不同）
const __sc_module_e2e_marker = true;

(async function () {
  "use strict";

  console.log("%c=== @script-module E2E 测试开始 ===", "color: blue; font-size: 16px; font-weight: bold;");

  let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  async function test(name, fn) {
    testResults.total++;
    try {
      await fn();
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
      const valueInfo = "期望 " + JSON.stringify(expected) + ", 实际 " + JSON.stringify(actual);
      const error = message ? message + " - " + valueInfo : "断言失败: " + valueInfo;
      throw new Error(error);
    }
  }

  await test("module 顶层 this 为 undefined", async () => {
    assert(true, __sc_module_top_level_this_is_undefined, "module 顶层 this 应为 undefined");
  });

  await test("document.currentScript 在 module 内为 null", async () => {
    assert(null, document.currentScript, "module 脚本的 document.currentScript 应为 null");
  });

  await test("module 顶层声明不会挂载到 window", async () => {
    assert("undefined", typeof window.__sc_module_e2e_marker, "module 顶层变量不应出现在 window 上");
  });

  // 与其他 GM 脚本一致：window 为沙盒 window（与页面隔离），unsafeWindow 才是真实页面 window
  // 参见 window_message_test.js 中同样的约定
  await test("window 为沙盒 window，与 unsafeWindow（真实页面 window）不同", async () => {
    assert(true, window !== unsafeWindow, "window 不应等于 unsafeWindow");
    assert(document, unsafeWindow.document, "unsafeWindow.document 应等于真实 document");
  });

  await test("静态 import 的模块（/module-lib.js）被正确加载并可用", async () => {
    assert("script-module-e2e-import-ok", MODULE_LIB_MARKER, "导入的常量值应与 module-lib.js 导出的一致");
    assert(7, addNumbers(3, 4), "导入的函数应可正常调用");
  });

  await test("GM.setValue / GM.getValue 正常工作", async () => {
    await GM.setValue("script_module_e2e_key", "script_module_e2e_value");
    const v = await GM.getValue("script_module_e2e_key");
    assert("script_module_e2e_value", v, "GM.getValue 应读取到刚写入的值");
  });

  console.log("\n%c=== 测试结果总结 ===", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("总测试数: " + testResults.total);
  console.log("%c通过: " + testResults.passed, "color: green; font-weight: bold;");
  console.log("%c失败: " + testResults.failed, "color: red; font-weight: bold;");
})();
