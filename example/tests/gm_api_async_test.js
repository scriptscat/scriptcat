// ==UserScript==
// @name         GM.* API 完整测试 (异步版本)
// @namespace    https://docs.scriptcat.org/
// @version      1.0.1
// @description  全面测试ScriptCat的所有GM.* (异步Promise版本) API功能
// @author       ScriptCat
// @match        https://content-security-policy.com/?gm_api_async
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @grant        GM.getResourceText
// @grant        GM.getResourceUrl
// @grant        GM.addStyle
// @grant        GM.addElement
// @grant        GM.xmlHttpRequest
// @grant        GM.notification
// @grant        GM.setClipboard
// @grant        GM.info
// @grant        GM.openInTab
// @grant        GM.registerMenuCommand
// @grant        GM.unregisterMenuCommand
// @grant        GM.cookie
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js#sha384-vtXRMe3mGCbOeY7l30aIg8H9p3GdeSe4IFlP6G8JMa7o7lXvnz3GFKzPxzJdPfGK
// @resource     testCSS https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css#sha256=62f74b1cf824a89f03554c638e719594c309b4d8a627a758928c0516fa7890ab
// @connect      httpbun.com
// @connect      example.com
// @run-at       document-start
// ==/UserScript==

(async function () {
  "use strict";

  console.log("%c=== ScriptCat GM.* API 测试开始 ===", "color: blue; font-size: 16px; font-weight: bold;");

  let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  // 测试辅助函数
  async function testAsync(name, fn) {
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

  // assert 函数
  function assert(expected, actual, message) {
    if (expected !== actual) {
      const valueInfo = `期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`;
      const error = message ? `${message} - ${valueInfo}` : `断言失败: ${valueInfo}`;
      throw new Error(error);
    }
  }

  // ============ GM.info 测试 ============
  console.log("\n%c--- GM.info 测试 ---", "color: orange; font-weight: bold;");
  await testAsync("GM.info 存在", async () => {
    assert("object", typeof GM.info, "GM.info 应该是一个对象");
    assert(true, !!GM.info.script, "GM.info.script 应该存在");
    assert(true, !!GM.info.scriptMetaStr, "GM.info.scriptMetaStr 应该存在");
    console.log("GM.info:", GM.info);
  });

  // ============ GM 存储 API 测试 ============
  console.log("\n%c--- GM 存储 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.setValue - 字符串", async () => {
    await GM.setValue("test_string", "Hello ScriptCat Async");
    const value = await GM.getValue("test_string");
    assert("Hello ScriptCat Async", value, "GM.getValue 应该返回正确的字符串值");
  });

  await testAsync("GM.setValue - 数字", async () => {
    await GM.setValue("test_number", 42);
    const value = await GM.getValue("test_number");
    assert(42, value, "GM.getValue 应该返回正确的数字值");
  });

  await testAsync("GM.setValue - 布尔值", async () => {
    await GM.setValue("test_boolean", true);
    const value = await GM.getValue("test_boolean");
    assert(true, value, "GM.getValue 应该返回正确的布尔值");
  });

  await testAsync("GM.setValue - 对象", async () => {
    const obj = { name: "ScriptCat", version: "1.3.0", features: ["GM API", "Async"] };
    await GM.setValue("test_object", obj);
    const value = await GM.getValue("test_object");
    assert("object", typeof value, "应该返回对象");
    assert(obj.name, value.name, "name 属性应该相等");
    assert(obj.version, value.version, "version 属性应该相等");
    assert(JSON.stringify(obj.features), JSON.stringify(value.features), "features 数组应该相等");
  });

  await testAsync("GM.setValue - 数组", async () => {
    const arr = [1, 2, 3, "test", { key: "value" }];
    await GM.setValue("test_array", arr);
    const value = await GM.getValue("test_array");
    assert(true, Array.isArray(value), "应该返回数组");
    assert(arr.length, value.length, "数组长度应该相等");
    assert(arr[0], value[0], "第1个元素应该相等");
    assert(arr[3], value[3], "第4个元素应该相等");
    assert(arr[4].key, value[4].key, "对象元素的属性应该相等");
  });

  await testAsync("GM.getValue - 默认值", async () => {
    const value = await GM.getValue("non_existent_key", "default_value");
    assert("default_value", value, "不存在的键应该返回默认值");
  });

  await testAsync("GM.listValues", async () => {
    const values = await GM.listValues();
    assert(true, Array.isArray(values), "GM.listValues 应该返回数组");
    assert(true, values.includes("test_string"), "应该包含已存储的键");
    console.log("存储的键:", values);
  });

  await testAsync("GM.deleteValue", async () => {
    await GM.setValue("test_delete", "to be deleted");
    assert("to be deleted", await GM.getValue("test_delete"), "值应该存在");
    await GM.deleteValue("test_delete");
    assert("not_found", await GM.getValue("test_delete", "not_found"), "值应该被删除");
  });

  // ============ GM.addStyle 测试 ============
  console.log("\n%c--- GM 样式 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.addStyle - CSS字符串", async () => {
    const css = `
      .scriptcat-test-async {
        color: blue;
        font-weight: bold;
      }
    `;
    const element = await GM.addStyle(css);
    assert(true, element && element.tagName === "STYLE", "应该返回 style 元素");
    console.log("添加的样式元素:", element);
  });

  // ============ GM.addElement 测试 ============
  await testAsync("GM.addElement - 创建元素", async () => {
    assert("function", typeof GM.addElement, "GM.addElement 应该是函数");

    const div = await GM.addElement("div", {
      textContent: "ScriptCat GM.addElement 测试",
      style: "position: fixed; top: 10px; right: 10px; background: lightblue; padding: 10px; z-index: 9999;",
    });
    assert(true, div && div.tagName === "DIV", "应该返回 div 元素");
    console.log("添加的元素:", div);

    // 3秒后移除
    setTimeout(() => div.remove(), 3000);
  });

  // ============ GM.getResourceText/Url 测试 ============
  console.log("\n%c--- GM 资源 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.getResourceText", async () => {
    assert("function", typeof GM.getResourceText, "GM.getResourceText 应该是函数");

    const css = await GM.getResourceText("testCSS");
    assert("string", typeof css, "应该返回字符串");
    assert(163870, css.length, "资源内容长度应该是 163870");
    console.log("资源文本长度:", css.length);
  });

  await testAsync("GM.getResourceUrl", async () => {
    assert("function", typeof GM.getResourceUrl, "GM.getResourceUrl 应该是函数");

    const url = await GM.getResourceUrl("testCSS");
    assert("string", typeof url, "应该返回字符串");
    assert(true, url.startsWith("data:") || url.startsWith("blob:"), "应该返回 data URL 或 blob URL");
    console.log("资源 URL:", url.substring(0, 50) + "...");
  });

  // ============ GM.xmlHttpRequest 测试 ============
  console.log("\n%c--- GM 网络请求 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.xmlHttpRequest - GET 请求", async () => {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: "https://httpbun.com/get",
        timeout: 10000,
        onload: (response) => {
          try {
            assert(200, response.status, `请求状态码应该是 200`);
            assert(true, !!response.responseText, "响应内容不应为空");
            const data = JSON.parse(response.responseText);
            assert("object", typeof data, "应该返回有效的 JSON 对象");
            assert(true, data.url, "响应应该包含 url 字段");
            console.log("httpbun 响应信息:", data.url);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        onerror: (error) => {
          reject(new Error("请求失败: " + error));
        },
        ontimeout: () => {
          reject(new Error("请求超时"));
        },
      });
    });
  });

  await testAsync("GM.xmlHttpRequest - 返回控制对象", async () => {
    const controller = GM.xmlHttpRequest({
      method: "GET",
      url: "https://httpbun.com/get",
      timeout: 10000,
      onload: () => {},
      onerror: () => {},
    });
    assert("object", typeof controller, "应该返回控制对象");
    assert("function", typeof controller.abort, "控制对象应该有 abort 方法");
    console.log("XHR 控制对象:", controller);
    controller.abort();
  });

  // ============ GM.notification 测试 ============
  console.log("\n%c--- GM 通知 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.notification - Promise 版本", async () => {
    assert("function", typeof GM.notification, "GM.notification 应该是函数");

    const notificationPromise = GM.notification({
      text: "ScriptCat GM.* API 测试通知",
      title: "ScriptCat 异步测试",
      image: "https://scriptcat.org/logo.png",
      onclick: () => {
        console.log("通知被点击");
      },
    });

    // GM.notification 可能返回 Promise 或控制对象
    if (notificationPromise && typeof notificationPromise.then === "function") {
      await notificationPromise;
      console.log("通知已发送（Promise 已完成）");
    } else {
      console.log("通知已发送（请检查系统通知）");
    }
  });

  // ============ GM.setClipboard 测试 ============
  console.log("\n%c--- GM 剪贴板 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.setClipboard", async () => {
    assert("function", typeof GM.setClipboard, "GM.setClipboard 应该是函数");

    await GM.setClipboard("ScriptCat GM.* API 测试文本 - " + new Date().toLocaleString());
    console.log("文本已复制到剪贴板（可以尝试粘贴验证）");
  });

  // ============ GM.openInTab 测试 ============
  console.log("\n%c--- GM 标签页 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.openInTab (不执行)", async () => {
    // 不实际打开标签页，只测试函数是否存在
    assert("function", typeof GM.openInTab, "GM.openInTab 应该是函数");
    console.log("GM.openInTab 可用 (未实际打开标签页)");
  });

  // ============ GM.registerMenuCommand 测试 ============
  console.log("\n%c--- GM 菜单 API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.registerMenuCommand", async () => {
    const menuId = await GM.registerMenuCommand("ScriptCat 异步测试菜单", () => {
      alert("异步测试菜单被点击！");
    });
    assert(true, menuId !== undefined, "应该返回菜单ID");
    console.log("菜单已注册，ID:", menuId);
  });

  // ============ GM.cookie 测试 ============
  console.log("\n%c--- GM.cookie API 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("GM.cookie 函数存在", async () => {
    assert("function", typeof GM.cookie, "GM.cookie 应该是一个函数");
    console.log("GM.cookie API 可用");
  });

  await testAsync("GM.cookie.set", async () => {
    await GM.cookie.set({
      url: "http://example.com/cookie",
      name: "scriptcat_async_test1",
      value: "async_test_value_1",
    });
    console.log("Cookie 已设置: scriptcat_async_test1 @ example.com");
  });

  await testAsync("GM.cookie.set (带 domain 和 path)", async () => {
    await GM.cookie.set({
      url: "http://www.example.com/",
      domain: ".example.com",
      path: "/path",
      name: "scriptcat_async_test2",
      value: "async_test_value_2",
    });
    console.log("Cookie 已设置: scriptcat_async_test2 @ .example.com/path");
  });

  await testAsync("GM.cookie.list (by domain)", async () => {
    const cookies = await GM.cookie.list({
      domain: "example.com",
    });
    assert(true, Array.isArray(cookies), "应该返回数组");
    assert(true, cookies.length >= 1, "应该至少有一个 cookie");
    console.log("列出 example.com 的 cookies:", cookies.length, "个");
    console.log("示例 Cookie:", cookies[0]);
  });

  await testAsync("GM.cookie.list (by url)", async () => {
    const cookies = await GM.cookie.list({
      url: "http://example.com/cookie",
    });
    assert(true, Array.isArray(cookies), "应该返回数组");
    console.log("通过 URL 列出的 cookies:", cookies.length, "个");
  });

  await testAsync("GM.cookie.delete", async () => {
    await GM.cookie.delete({
      url: "http://www.example.com/path",
      name: "scriptcat_async_test2",
    });
    console.log("Cookie 已删除: scriptcat_async_test2");
  });

  await testAsync("GM.cookie - 验证删除后", async () => {
    const cookies = await GM.cookie.list({
      domain: "example.com",
    });
    const test2Cookie = cookies.find((c) => c.name === "scriptcat_async_test2");
    assert(true, !test2Cookie, "scriptcat_async_test2 应该已被删除");
    console.log("验证：scriptcat_async_test2 已被删除");
  });

  // 清理所有测试 cookies
  await testAsync("清理测试 cookies", async () => {
    const cookies = await GM.cookie.list({ domain: "example.com" });
    const testCookies = cookies.filter((c) => c.name.startsWith("scriptcat_async_test"));

    if (testCookies.length === 0) {
      console.log("没有需要清理的测试 cookies");
      return;
    }

    await Promise.all(
      testCookies.map((cookie) =>
        GM.cookie.delete({
          url: `http://${cookie.domain}${cookie.path}`,
          name: cookie.name,
        })
      )
    );
    console.log(`已清理 ${testCookies.length} 个测试 cookies`);
  });

  // ============ unsafeWindow 测试 ============
  console.log("\n%c--- unsafeWindow 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("unsafeWindow", async () => {
    assert("object", typeof unsafeWindow, "unsafeWindow 应该存在");
    assert(document, unsafeWindow.document, "unsafeWindow.document 应该等于 document");
    console.log("unsafeWindow 可用");
  });

  // ============ @require 测试 ============
  console.log("\n%c--- @require 测试 ---", "color: orange; font-weight: bold;");

  await testAsync("jQuery 加载 (@require)", async () => {
    assert("function", typeof jQuery, "jQuery 应该已加载");
    assert("function", typeof $, "$ 应该已加载");
    console.log("jQuery 版本:", jQuery.fn.jquery);
  });

  // ============ 测试总结 ============
  console.log("\n%c=== 测试结果总结 ===", "color: blue; font-size: 16px; font-weight: bold;");
  console.log(`总测试数: ${testResults.total}`);
  console.log(`%c通过: ${testResults.passed}`, "color: green; font-weight: bold;");
  console.log(`%c失败: ${testResults.failed}`, "color: red; font-weight: bold;");
  console.log(`成功率: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);

  // 使用 GM.addElement 在页面上显示结果
  const successRate = ((testResults.passed / testResults.total) * 100).toFixed(2);
  const bgColor =
    testResults.failed === 0 ? "#e8f5e9" : testResults.failed < testResults.total / 2 ? "#fff9c4" : "#ffebee";
  const borderColor =
    testResults.failed === 0 ? "#4caf50" : testResults.failed < testResults.total / 2 ? "#ffc107" : "#f44336";

  const resultContainer = await GM.addElement(document.body, "div", {
    style: `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${bgColor};
      border: 3px solid ${borderColor};
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      z-index: 10000;
      min-width: 350px;
      animation: slideIn 0.5s ease-out;
    `,
  });

  // 添加动画样式
  await GM.addStyle(`
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `);

  // 标题
  await GM.addElement(resultContainer, "h3", {
    textContent: "🐱 ScriptCat GM.* API 测试结果 (异步版本)",
    style:
      "margin: 0 0 15px 0; color: #333; font-size: 18px; font-weight: bold; border-bottom: 2px solid " +
      borderColor +
      "; padding-bottom: 10px;",
  });

  // 测试统计容器
  const statsContainer = await GM.addElement(resultContainer, "div", {
    style: "margin-bottom: 15px;",
  });

  // 总测试数
  const totalLine = await GM.addElement(statsContainer, "div", {
    style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
  });
  await GM.addElement(totalLine, "span", { textContent: "📊 总测试数:" });
  await GM.addElement(totalLine, "strong", {
    textContent: testResults.total,
    style: "font-size: 16px;",
  });

  // 通过数
  const passedLine = await GM.addElement(statsContainer, "div", {
    style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
  });
  await GM.addElement(passedLine, "span", { textContent: "✅ 通过:" });
  await GM.addElement(passedLine, "strong", {
    textContent: testResults.passed,
    style: "color: #4caf50; font-size: 16px;",
  });

  // 失败数
  const failedLine = await GM.addElement(statsContainer, "div", {
    style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
  });
  await GM.addElement(failedLine, "span", { textContent: "❌ 失败:" });
  await GM.addElement(failedLine, "strong", {
    textContent: testResults.failed,
    style: "color: #f44336; font-size: 16px;",
  });

  // 成功率
  const rateLine = await GM.addElement(statsContainer, "div", {
    style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
  });
  await GM.addElement(rateLine, "span", { textContent: "📈 成功率:" });
  await GM.addElement(rateLine, "strong", {
    textContent: successRate + "%",
    style:
      "color: " + (successRate >= 90 ? "#4caf50" : successRate >= 70 ? "#ffc107" : "#f44336") + "; font-size: 16px;",
  });

  // 进度条
  const progressBar = await GM.addElement(resultContainer, "div", {
    style: "background: #e0e0e0; height: 20px; border-radius: 10px; overflow: hidden; margin: 15px 0;",
  });
  await GM.addElement(progressBar, "div", {
    style: `
      background: linear-gradient(90deg, #4caf50, #81c784);
      height: 100%;
      width: ${successRate}%;
      transition: width 1s ease-out;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: bold;
    `,
    textContent: successRate + "%",
  });

  // 按钮容器
  const buttonContainer = await GM.addElement(resultContainer, "div", {
    style: "display: flex; gap: 10px; margin-top: 15px;",
  });

  // 关闭按钮
  const closeBtn = await GM.addElement(buttonContainer, "button", {
    textContent: "关闭",
    style: `
      flex: 1;
      padding: 8px 15px;
      cursor: pointer;
      background: #757575;
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 14px;
      font-weight: bold;
      transition: background 0.3s;
    `,
  });
  closeBtn.onmouseover = () => (closeBtn.style.background = "#616161");
  closeBtn.onmouseout = () => (closeBtn.style.background = "#757575");
  closeBtn.onclick = () => resultContainer.remove();

  // 查看日志按钮
  const logBtn = await GM.addElement(buttonContainer, "button", {
    textContent: "查看详细日志",
    style: `
      flex: 1;
      padding: 8px 15px;
      cursor: pointer;
      background: #2196f3;
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 14px;
      font-weight: bold;
      transition: background 0.3s;
    `,
  });
  logBtn.onmouseover = () => (logBtn.style.background = "#1976d2");
  logBtn.onmouseout = () => (logBtn.style.background = "#2196f3");
  logBtn.onclick = () => {
    console.log("%c=== 完整测试报告 ===", "color: blue; font-size: 16px; font-weight: bold;");
    alert("请查看控制台中的详细测试日志");
  };

  console.log("%c=== ScriptCat GM.* API 测试完成 ===", "color: blue; font-size: 16px; font-weight: bold;");
})();
