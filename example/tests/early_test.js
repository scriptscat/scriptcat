// ==UserScript==
// @name         早期脚本
// @namespace    https://docs.scriptcat.org/
// @version      0.1.0
// @description  早期脚本可以比页面更早到执行
// @match        https://content-security-policy.com/
// @early-start
// @grant        GM_addElement
// @grant        GM_addStyle
// @grant        GM_log
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-start
// ==/UserScript==

(async function () {
  "use strict";

  console.log("%c=== 早期脚本 GM API 测试开始 ===", "color: blue; font-size: 16px; font-weight: bold;");

  let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  // 测试辅助函数（支持同步和异步）
  async function test(name, fn) {
    testResults.total++;
    try {
      await fn();
      testResults.passed++;
      console.log(`%c✓ ${name}`, "color: green;");
      return true;
    } catch (error) {
      testResults.failed++;
      console.error(`%c✗ ${name}`, "color: red;", error);
      return false;
    }
  }

  // assert(expected, actual, message) - 比较两个值是否相等
  function assert(expected, actual, message) {
    if (expected !== actual) {
      const valueInfo = `期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`;
      const error = message ? `${message} - ${valueInfo}` : `断言失败: ${valueInfo}`;
      throw new Error(error);
    }
  }

  // assertTrue(condition, message) - 断言条件为真
  function assertTrue(condition, message) {
    if (!condition) {
      throw new Error(message || "断言失败: 期望条件为真");
    }
  }

  // ============ 早期脚本环境检查 ============
  console.log("\n%c--- 早期脚本环境检查 ---", "color: orange; font-weight: bold;");

  await test("检查 document.head 不存在", () => {
    console.log("document.head 存在:", !!document.head);
    console.log("document.head 值:", document.head);
    // 早期脚本运行时 document.head 应该不存在
    assertTrue(document.head === null || document.head === undefined, "早期脚本运行时 document.head 应该不存在");
  });

  await test("检查 document.body 不存在", () => {
    console.log("document.body 存在:", !!document.body);
    console.log("document.body 值:", document.body);
    // 早期脚本运行时 document.body 应该不存在
    assertTrue(document.body === null || document.body === undefined, "早期脚本运行时 document.body 应该不存在");
  });

  await test("检查可用的DOM节点应该是HTML元素", () => {
    const firstElement = document.querySelector("*");
    console.log("querySelector('*') 找到的第一个元素:", firstElement?.tagName);
    assertTrue(firstElement !== null, "应该能找到第一个DOM节点");
    assert("HTML", firstElement.tagName, "早期脚本运行时，第一个可用节点应该是HTML元素");
    assert("", firstElement.innerHTML, "HTML元素内容应该为空");
    console.log("节点详情:", {
      tagName: firstElement.tagName,
      childNodes: firstElement.childNodes.length,
      children: firstElement.children.length,
      innerHTML: firstElement.innerHTML,
    });
  });

  await test("检查页面CSP", async () => {
    console.log("开始CSP检测...");
    console.log("当前页面URL:", window.location.href);

    // 尝试插入外部script来测试CSP
    console.log("\n%c测试外部script插入", "color: #3b82f6;");

    const testScript = document.createElement("script");
    testScript.src = "data:application/javascript,window.__cspTestExternal=true;";
    testScript.id = "csp-test-external";

    // 使用Promise等待加载结果
    const loadResult = await new Promise((resolve, reject) => {
      testScript.onload = () => {
        console.log("%c✓ 外部script加载成功 - 无CSP限制或已允许", "color: #ef4444;");
        resolve({ success: true, blocked: false });
      };

      testScript.onerror = (error) => {
        console.log("%c✓ 外部script加载失败 - 被CSP阻止（符合预期）", "color: #10b981;");
        console.log("CSP错误详情:", error);
        resolve({ success: false, blocked: true, error });
      };

      // 设置超时（1秒）
      setTimeout(() => {
        reject(new Error("Script加载超时"));
      }, 1000);

      // 插入元素到DOM
      console.log("正在插入script元素到DOM...");
      document.documentElement.appendChild(testScript);
      console.log("script元素已同步插入DOM，等待异步加载结果...");
    });

    // 验证检测结果
    if (loadResult.blocked) {
      console.log("%c✓ 页面存在CSP策略限制（符合预期）", "color: #10b981; font-weight: bold;");
      assertTrue(true, "CSP正确阻止了外部script加载");
    } else if (loadResult.success) {
      console.log("%c✗ 页面无CSP限制或已允许该资源（不符合预期）", "color: #ef4444; font-weight: bold;");
      assertTrue(false, "期望CSP阻止外部script，但实际加载成功");
    }
  });

  // ============ GM_addElement/GM_addStyle 测试 ============
  console.log("\n%c--- DOM操作 API 测试 ---", "color: orange; font-weight: bold;");

  await test("GM_addElement", () => {
    const element = GM_addElement("div", {
      textContent: "GM_addElement测试元素",
      style: "display:none;",
      id: "gm-test-element",
    });
    assertTrue(element !== null && element !== undefined, "GM_addElement应该返回元素");
    assert("gm-test-element", element.id, "元素ID应该正确");
    assert("DIV", element.tagName, "元素标签应该是DIV");
    console.log("返回元素:", element);
  });

  await test("GM_addStyle", () => {
    const styleElement = GM_addStyle(`
            .gm-style-test {
                color: #10b981 !important;
            }
        `);
    assertTrue(styleElement !== null && styleElement !== undefined, "GM_addStyle应该返回样式元素");
    assertTrue(styleElement.tagName === "STYLE" || styleElement.sheet, "应该返回STYLE元素或样式对象");
    console.log("返回样式元素:", styleElement);
  });

  // ============ GM_log 测试 ============
  console.log("\n%c--- GM_log 测试 ---", "color: orange; font-weight: bold;");

  await test("GM_log", () => {
    GM_log("测试日志输出", { type: "test", value: 123 });
    // GM_log本身不返回值,只要不抛出异常就算成功
    assertTrue(true, "GM_log应该能正常输出");
  });

  // ============ GM_info 测试 ============
  console.log("\n%c--- GM_info 测试 ---", "color: orange; font-weight: bold;");

  await test("GM_info", () => {
    assertTrue(typeof GM_info === "object", "GM_info应该是对象");
    assertTrue(!!GM_info.script, "GM_info.script应该存在");
    assertTrue(!!GM_info.script.name, "GM_info.script.name应该存在");
    console.log("脚本信息:", GM_info.script.name);
  });

  // ============ GM 存储 API 测试 ============
  console.log("\n%c--- GM 存储 API 测试 ---", "color: orange; font-weight: bold;");

  await test("GM_setValue - 字符串", () => {
    GM_setValue("test_key", "早期脚本测试值");
    const value = GM_getValue("test_key");
    assert("早期脚本测试值", value, "应该正确保存和读取字符串");
  });

  await test("GM_setValue - 数字", () => {
    GM_setValue("test_number", 12345);
    const value = GM_getValue("test_number");
    assert(12345, value, "应该正确保存和读取数字");
  });

  await test("GM_setValue - 对象", () => {
    const obj = { name: "ScriptCat", type: "early" };
    GM_setValue("test_object", obj);
    const value = GM_getValue("test_object", {});
    assert("ScriptCat", value.name, "对象的name属性应该正确");
    assert("early", value.type, "对象的type属性应该正确");
  });

  await test("GM_getValue - 默认值", () => {
    const value = GM_getValue("non_existent_key", "默认值");
    assert("默认值", value, "不存在的键应该返回默认值");
  });

  await test("GM_listValues", () => {
    const keys = GM_listValues();
    assertTrue(Array.isArray(keys), "GM_listValues应该返回数组");
    assertTrue(keys.length >= 3, "应该至少有3个存储键");
    console.log("存储的键:", keys);
  });

  await test("GM_deleteValue", () => {
    GM_setValue("test_delete", "to_be_deleted");
    assert("to_be_deleted", GM_getValue("test_delete"), "值应该存在");
    GM_deleteValue("test_delete");
    assert(null, GM_getValue("test_delete", null), "值应该被删除");
  });

  // ============ 输出测试结果 ============
  console.log("\n%c=== 测试完成 ===", "color: blue; font-size: 16px; font-weight: bold;");
  console.log(
    `%c总计: ${testResults.total} | 通过: ${testResults.passed} | 失败: ${testResults.failed}`,
    testResults.failed === 0 ? "color: green; font-weight: bold;" : "color: red; font-weight: bold;"
  );

  if (testResults.failed === 0) {
    console.log("%c🎉 所有测试通过!", "color: green; font-size: 14px; font-weight: bold;");
  } else {
    console.log("%c⚠️ 部分测试失败，请检查上面的错误信息", "color: red; font-size: 14px; font-weight: bold;");
  }
})();
