// ==UserScript==
// @name         @script-module E2E Test
// @namespace    https://docs.scriptcat.org/
// @version      1.0.0
// @description  E2E 测试 @script-module 功能（以 <script type="module"> 注入）
// @author       ScriptCat
// @match        https://content-security-policy.com/?script_module_e2e_test
// @grant        none
// @script-module
// ==/UserScript==

// 首版限制：@script-module 强制要求 @grant none。module 无法复用外层 with(arguments[0])
// 沙盒 Proxy，若允许真实 GM_* 权限方法随之注入，页面 hook document.createElement/appendChild
// 即可在临时挂载点被删除前窃取具备权限的 GM 对象。因此 GM.getValue / GM.setValue 等在
// @script-module 下不可用，GM 只暴露一份序列化后的 GM.info（纯数据，无权限方法）。

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

  // @script-module 强制 @grant none：module 与真实页面运行在同一全局对象上，
  // 不像其他有权限的脚本那样存在沙盒 window，因此 window 与 unsafeWindow 应指向同一个对象
  await test("@grant none 下 window 与 unsafeWindow 为同一对象（无沙盒隔离）", async () => {
    assert(true, typeof unsafeWindow === "undefined" || unsafeWindow === window, "不应存在独立的沙盒 window");
  });

  await test("静态 import 的模块（/module-lib.js）被正确加载并可用", async () => {
    assert("script-module-e2e-import-ok", MODULE_LIB_MARKER, "导入的常量值应与 module-lib.js 导出的一致");
    assert(7, addNumbers(3, 4), "导入的函数应可正常调用");
  });

  await test("@grant none 下 module 只能拿到 GM.info（无权限方法），验证 GM 权限对象不会暴露给 module", async () => {
    assert("object", typeof GM.info, "GM.info 应为对象");
    assert("undefined", typeof GM.getValue, "GM.getValue 不应存在——@script-module 强制 @grant none");
    assert("undefined", typeof GM.setValue, "GM.setValue 不应存在——@script-module 强制 @grant none");
    assert("undefined", typeof GM_getValue, "全局 GM_getValue 不应存在——module 不应拿到任何 GM_* 权限方法");
  });

  console.log("\n%c=== 测试结果总结 ===", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("总测试数: " + testResults.total);
  console.log("%c通过: " + testResults.passed, "color: green; font-weight: bold;");
  console.log("%c失败: " + testResults.failed, "color: red; font-weight: bold;");
})();
