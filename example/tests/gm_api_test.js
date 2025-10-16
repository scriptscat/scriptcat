// ==UserScript==
// @name         GM API 完整测试
// @namespace    https://docs.scriptcat.org/
// @version      1.0.0
// @description  全面测试ScriptCat的所有GM API功能
// @author       ScriptCat
// @match        https://content-security-policy.com/
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_getResourceText
// @grant        GM_getResourceURL
// @grant        GM_addStyle
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_info
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_cookie
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js#sha384-vtXRMe3mGCbOeY7l30aIg8H9p3GdeSe4IFlP6G8JMa7o7lXvnz3GFKzPxzJdPfGK
// @resource     testCSS https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css#sha256=62f74b1cf824a89f03554c638e719594c309b4d8a627a758928c0516fa7890ab
// @connect      api.github.com
// @connect      example.com
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  console.log("%c=== ScriptCat GM API 测试开始 ===", "color: blue; font-size: 16px; font-weight: bold;");

  let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  // 测试辅助函数
  function test(name, fn) {
    testResults.total++;
    try {
      fn();
      testResults.passed++;
      console.log(`%c✓ ${name}`, "color: green;");
      return true;
    } catch (error) {
      testResults.failed++;
      console.error(`%c✗ ${name}`, "color: red;", error);
      return false;
    }
  }

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

  // assert(expected, actual, message) - 比较两个值是否相等
  function assert(expected, actual, message) {
    if (expected !== actual) {
      const valueInfo = `期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`;
      const error = message ? `${message} - ${valueInfo}` : `断言失败: ${valueInfo}`;
      throw new Error(error);
    }
  }

  // ============ GM_info 测试 ============
  console.log("\n%c--- GM_info 测试 ---", "color: orange; font-weight: bold;");
  test("GM_info 存在", () => {
    assert("object", typeof GM_info, "GM_info 应该是一个对象");
    assert(true, !!GM_info.script, "GM_info.script 应该存在");
    assert(true, !!GM_info.scriptMetaStr, "GM_info.scriptMetaStr 应该存在");
    console.log("GM_info:", GM_info);
  });

  // ============ GM_getValue/setValue 测试 ============
  console.log("\n%c--- GM 存储 API 测试 ---", "color: orange; font-weight: bold;");

  test("GM_setValue - 字符串", () => {
    GM_setValue("test_string", "Hello ScriptCat");
    const value = GM_getValue("test_string");
    assert("Hello ScriptCat", value, "GM_getValue 应该返回正确的字符串值");
  });

  test("GM_setValue - 数字", () => {
    GM_setValue("test_number", 42);
    const value = GM_getValue("test_number");
    assert(42, value, "GM_getValue 应该返回正确的数字值");
  });

  test("GM_setValue - 布尔值", () => {
    GM_setValue("test_boolean", true);
    const value = GM_getValue("test_boolean");
    assert(true, value, "GM_getValue 应该返回正确的布尔值");
  });

  test("GM_setValue - 对象", () => {
    const obj = { name: "ScriptCat", version: "1.2.0", features: ["GM API", "Background"] };
    GM_setValue("test_object", obj);
    const value = GM_getValue("test_object");
    assert(JSON.stringify(obj), JSON.stringify(value), "对象应该相等");
  });

  test("GM_setValue - 数组", () => {
    const arr = [1, 2, 3, "test", { key: "value" }];
    GM_setValue("test_array", arr);
    const value = GM_getValue("test_array");
    assert(JSON.stringify(arr), JSON.stringify(value), "数组应该相等");
  });

  test("GM_getValue - 默认值", () => {
    const value = GM_getValue("non_existent_key", "default_value");
    assert("default_value", value, "不存在的键应该返回默认值");
  });

  test("GM_listValues", () => {
    const values = GM_listValues();
    assert(true, Array.isArray(values), "GM_listValues 应该返回数组");
    assert(true, values.includes("test_string"), "应该包含已存储的键");
    console.log("存储的键:", values);
  });

  test("GM_deleteValue", () => {
    GM_setValue("test_delete", "to be deleted");
    assert("to be deleted", GM_getValue("test_delete"), "值应该存在");
    GM_deleteValue("test_delete");
    assert("not_found", GM_getValue("test_delete", "not_found"), "值应该被删除");
  });

  // ============ GM_addValueChangeListener 测试 ============
  (async () => {
    await testAsync("GM_addValueChangeListener", () => {
      return new Promise((resolve, reject) => {
        let listenerId = null;
        let timeoutId = null;

        // 设置 2 秒超时
        timeoutId = setTimeout(() => {
          if (listenerId && typeof GM_removeValueChangeListener === "function") {
            GM_removeValueChangeListener(listenerId);
          }
          reject(new Error("监听器超时：2秒内未触发值变化事件"));
        }, 2000);

        // 先设置初始值，然后再添加监听器
        GM_setValue("test_listener", "initial");
        console.log("已设置初始值: initial");

        // 使用 setTimeout 确保初始值已完全设置
        setTimeout(() => {
          // 添加监听器
          listenerId = GM_addValueChangeListener("test_listener", (name, oldValue, newValue, remote) => {
            console.log(`值变化监听器触发: ${name}, ${oldValue} -> ${newValue}, remote: ${remote}`);

            // 清除超时
            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            // 验证参数
            try {
              assert("test_listener", name, "监听器名称应该匹配");
              assert("initial", oldValue, "旧值应该是 'initial'");
              assert("changed", newValue, "新值应该是 'changed'");
              assert(false, remote, "remote 应该是 false（本地修改）");

              console.log("✓ 监听器成功触发并验证参数");

              // 清理监听器
              if (typeof GM_removeValueChangeListener === "function") {
                GM_removeValueChangeListener(listenerId);
              }

              resolve();
            } catch (error) {
              // 清理监听器
              if (typeof GM_removeValueChangeListener === "function") {
                GM_removeValueChangeListener(listenerId);
              }
              reject(error);
            }
          });

          // 验证返回的监听器 ID
          const idType = typeof listenerId;
          if (idType !== "number" && idType !== "string") {
            clearTimeout(timeoutId);
            reject(new Error(`监听器ID类型错误: 期望 number 或 string, 实际 ${idType}`));
            return;
          }
          console.log("监听器已注册，ID:", listenerId);

          // 延迟后修改值触发监听器
          setTimeout(() => {
            GM_setValue("test_listener", "changed");
            console.log("已修改值为: changed");
          }, 100);
        }, 50);
      });
    });
  })();

  // ============ GM_addStyle 测试 ============
  console.log("\n%c--- GM 样式 API 测试 ---", "color: orange; font-weight: bold;");

  test("GM_addStyle - CSS字符串", () => {
    const css = `
            .scriptcat-test {
                color: red;
                font-weight: bold;
            }
        `;
    const element = GM_addStyle(css);
    assert(true, element && element.tagName === "STYLE", "应该返回 style 元素");
    console.log("添加的样式元素:", element);
  });

  // ============ GM_addElement 测试 ============
  test("GM_addElement - 创建元素", () => {
    assert("function", typeof GM_addElement, "GM_addElement 应该是函数");

    const div = GM_addElement("div", {
      textContent: "ScriptCat GM_addElement 测试",
      style: "position: fixed; top: 10px; right: 10px; background: yellow; padding: 10px; z-index: 9999;",
    });
    assert(true, div && div.tagName === "DIV", "应该返回 div 元素");
    console.log("添加的元素:", div);

    // 3秒后移除
    setTimeout(() => div.remove(), 3000);
  });

  // ============ GM_getResourceText/URL 测试 ============
  console.log("\n%c--- GM 资源 API 测试 ---", "color: orange; font-weight: bold;");

  test("GM_getResourceText", () => {
    assert("function", typeof GM_getResourceText, "GM_getResourceText 应该是函数");

    const css = GM_getResourceText("testCSS");
    assert("string", typeof css, "应该返回字符串");
    assert(163870, css.length, "资源内容长度应该是 163870");
    console.log("资源文本长度:", css.length);
  });

  test("GM_getResourceURL", () => {
    assert("function", typeof GM_getResourceURL, "GM_getResourceURL 应该是函数");

    const url = GM_getResourceURL("testCSS");
    assert("string", typeof url, "应该返回字符串");
    assert(true, url.startsWith("data:") || url.startsWith("blob:"), "应该返回 data URL 或 blob URL");
    console.log("资源 URL:", url.substring(0, 50) + "...");
  });

  // ============ GM_xmlhttpRequest 测试 ============
  console.log("\n%c--- GM 网络请求 API 测试 ---", "color: orange; font-weight: bold;");

  (async () => {
    await testAsync("GM_xmlhttpRequest - GET 请求", () => {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: "https://api.github.com/repos/scriptscat/scriptcat",
          timeout: 10000,
          onload: (response) => {
            try {
              assert(200, response.status, `请求状态码应该是 200`);
              assert(true, !!response.responseText, "响应内容不应为空");
              const data = JSON.parse(response.responseText);
              assert("scriptcat", data.name, "应该返回 scriptcat 仓库信息");
              console.log("GitHub 仓库信息:", data.name, data.description);
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

    // ============ GM_notification 测试 ============
    console.log("\n%c--- GM 通知 API 测试 ---", "color: orange; font-weight: bold;");

    test("GM_notification", () => {
      assert("function", typeof GM_notification, "GM_notification 应该是函数");

      GM_notification({
        text: "ScriptCat GM API 测试通知",
        title: "ScriptCat 测试",
        image: "https://scriptcat.org/logo.png",
        onclick: () => {
          console.log("通知被点击");
        },
      });
      console.log("通知已发送（请检查系统通知）");
    });

    // ============ GM_setClipboard 测试 ============
    console.log("\n%c--- GM 剪贴板 API 测试 ---", "color: orange; font-weight: bold;");

    test("GM_setClipboard", () => {
      assert("function", typeof GM_setClipboard, "GM_setClipboard 应该是函数");

      GM_setClipboard("ScriptCat GM API 测试文本 - " + new Date().toLocaleString());
      console.log("文本已复制到剪贴板（可以尝试粘贴验证）");
    });

    // ============ GM_openInTab 测试 ============
    console.log("\n%c--- GM 标签页 API 测试 ---", "color: orange; font-weight: bold;");

    test("GM_openInTab (不执行)", () => {
      // 不实际打开标签页，只测试函数是否存在
      assert("function", typeof GM_openInTab, "GM_openInTab 应该是函数");
      console.log("GM_openInTab 可用 (未实际打开标签页)");
    });

    // ============ GM_registerMenuCommand 测试 ============
    console.log("\n%c--- GM 菜单 API 测试 ---", "color: orange; font-weight: bold;");

    test("GM_registerMenuCommand", () => {
      const menuId = GM_registerMenuCommand("ScriptCat 测试菜单", () => {
        alert("测试菜单被点击！");
      });
      assert(true, menuId !== undefined, "应该返回菜单ID");
      console.log("菜单已注册，ID:", menuId);
    });

    // ============ GM_cookie 测试 ============
    console.log("\n%c--- GM Cookie API 测试 ---", "color: orange; font-weight: bold;");

    test("GM_cookie 函数存在", () => {
      assert("function", typeof GM_cookie, "GM_cookie 应该是函数");
      console.log("GM_cookie API 可用");
    });

    // 测试 GM_cookie(action, details, callback)
    await testAsync("GM_cookie - 回调风格 set", () => {
      return new Promise((resolve, reject) => {
        GM_cookie(
          "set",
          {
            url: "http://example.com/cookie",
            name: "scriptcat_test1",
            value: "test_value_1",
          },
          (error) => {
            if (error) {
              reject(new Error("设置 cookie 失败: " + error));
            } else {
              console.log("Cookie 已设置: scriptcat_test1 @ example.com");
              resolve();
            }
          }
        );
      });
    });

    await testAsync("GM_cookie - 回调风格 set (带 domain 和 path)", () => {
      return new Promise((resolve, reject) => {
        GM_cookie(
          "set",
          {
            url: "http://www.example.com/",
            domain: ".example.com",
            path: "/path",
            name: "scriptcat_test2",
            value: "test_value_2",
          },
          (error) => {
            if (error) {
              reject(new Error("设置 cookie 失败: " + error));
            } else {
              console.log("Cookie 已设置: scriptcat_test2 @ .example.com/path");
              resolve();
            }
          }
        );
      });
    });

    await testAsync("GM_cookie - 回调风格 list (by domain)", () => {
      return new Promise((resolve, reject) => {
        GM_cookie(
          "list",
          {
            domain: "example.com",
          },
          (cookies, error) => {
            if (error) {
              reject(new Error("列出 cookies 失败: " + error));
            } else {
              try {
                assert(true, Array.isArray(cookies), "应该返回数组");
                assert(true, cookies.length >= 1, "应该至少有一个 cookie");
                console.log("列出 example.com 的 cookies:", cookies.length, "个");
                console.log("示例 Cookie:", cookies[0]);
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          }
        );
      });
    });

    await testAsync("GM_cookie - 回调风格 list (by url)", () => {
      return new Promise((resolve, reject) => {
        GM_cookie(
          "list",
          {
            url: "http://example.com/cookie",
          },
          (cookies, error) => {
            if (error) {
              reject(new Error("列出 cookies 失败: " + error));
            } else {
              try {
                assert(true, Array.isArray(cookies), "应该返回数组");
                console.log("通过 URL 列出的 cookies:", cookies.length, "个");
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          }
        );
      });
    });

    await testAsync("GM_cookie - 回调风格 delete", () => {
      return new Promise((resolve, reject) => {
        GM_cookie(
          "delete",
          {
            url: "http://www.example.com/path",
            name: "scriptcat_test2",
          },
          (error) => {
            if (error) {
              reject(new Error("删除 cookie 失败: " + error));
            } else {
              console.log("Cookie 已删除: scriptcat_test2");
              resolve();
            }
          }
        );
      });
    });

    await testAsync("GM_cookie - 验证删除后", () => {
      return new Promise((resolve, reject) => {
        GM_cookie(
          "list",
          {
            domain: "example.com",
          },
          (cookies, error) => {
            if (error) {
              reject(new Error("列出 cookies 失败: " + error));
            } else {
              try {
                const test2Cookie = cookies.find((c) => c.name === "scriptcat_test2");
                assert(true, !test2Cookie, "scriptcat_test2 应该已被删除");
                console.log("验证：scriptcat_test2 已被删除");
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          }
        );
      });
    });

    // 清理所有测试 cookies
    await testAsync("清理测试 cookies", () => {
      return new Promise((resolve, reject) => {
        GM_cookie("list", { domain: "example.com" }, (cookies, error) => {
          if (error) {
            reject(new Error("列出 cookies 失败: " + error));
            return;
          }

          const testCookies = cookies.filter((c) => c.name.startsWith("scriptcat_test"));

          if (testCookies.length === 0) {
            console.log("没有需要清理的测试 cookies");
            resolve();
            return;
          }

          let deleteCount = 0;
          testCookies.forEach((cookie, index) => {
            GM_cookie(
              "delete",
              {
                url: `http://${cookie.domain}${cookie.path}`,
                name: cookie.name,
              },
              (error) => {
                deleteCount++;
                if (error) {
                  console.warn(`删除 cookie ${cookie.name} 失败:`, error);
                }
                if (deleteCount === testCookies.length) {
                  console.log(`已清理 ${testCookies.length} 个测试 cookies`);
                  resolve();
                }
              }
            );
          });
        });
      });
    });

    // ============ unsafeWindow 测试 ============
    console.log("\n%c--- unsafeWindow 测试 ---", "color: orange; font-weight: bold;");

    test("unsafeWindow", () => {
      assert("object", typeof unsafeWindow, "unsafeWindow 应该存在");
      assert(document, unsafeWindow.document, "unsafeWindow.document 应该等于 document");
      console.log("unsafeWindow 可用");
    });

    // ============ @require 测试 ============
    console.log("\n%c--- @require 测试 ---", "color: orange; font-weight: bold;");

    test("jQuery 加载 (@require)", () => {
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

    // 使用 GM_addElement 在页面上显示结果
    const successRate = ((testResults.passed / testResults.total) * 100).toFixed(2);
    const bgColor =
      testResults.failed === 0 ? "#d4edda" : testResults.failed < testResults.total / 2 ? "#fff3cd" : "#f8d7da";
    const borderColor =
      testResults.failed === 0 ? "#28a745" : testResults.failed < testResults.total / 2 ? "#ffc107" : "#dc3545";

    const resultContainer = GM_addElement(document.body, "div", {
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
    GM_addStyle(`
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
    GM_addElement(resultContainer, "h3", {
      textContent: "🐱 ScriptCat GM API 测试结果",
      style:
        "margin: 0 0 15px 0; color: #333; font-size: 18px; font-weight: bold; border-bottom: 2px solid " +
        borderColor +
        "; padding-bottom: 10px;",
    });

    // 测试统计容器
    const statsContainer = GM_addElement(resultContainer, "div", {
      style: "margin-bottom: 15px;",
    });

    // 总测试数
    const totalLine = GM_addElement(statsContainer, "div", {
      style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
    });
    GM_addElement(totalLine, "span", { textContent: "📊 总测试数:" });
    GM_addElement(totalLine, "strong", {
      textContent: testResults.total,
      style: "font-size: 16px;",
    });

    // 通过数
    const passedLine = GM_addElement(statsContainer, "div", {
      style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
    });
    GM_addElement(passedLine, "span", { textContent: "✅ 通过:" });
    GM_addElement(passedLine, "strong", {
      textContent: testResults.passed,
      style: "color: #28a745; font-size: 16px;",
    });

    // 失败数
    const failedLine = GM_addElement(statsContainer, "div", {
      style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
    });
    GM_addElement(failedLine, "span", { textContent: "❌ 失败:" });
    GM_addElement(failedLine, "strong", {
      textContent: testResults.failed,
      style: "color: #dc3545; font-size: 16px;",
    });

    // 成功率
    const rateLine = GM_addElement(statsContainer, "div", {
      style: "margin: 8px 0; font-size: 14px; display: flex; justify-content: space-between;",
    });
    GM_addElement(rateLine, "span", { textContent: "📈 成功率:" });
    GM_addElement(rateLine, "strong", {
      textContent: successRate + "%",
      style:
        "color: " + (successRate >= 90 ? "#28a745" : successRate >= 70 ? "#ffc107" : "#dc3545") + "; font-size: 16px;",
    });

    // 进度条
    const progressBar = GM_addElement(resultContainer, "div", {
      style: "background: #e9ecef; height: 20px; border-radius: 10px; overflow: hidden; margin: 15px 0;",
    });
    GM_addElement(progressBar, "div", {
      style: `
                background: linear-gradient(90deg, #28a745, #20c997);
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
    const buttonContainer = GM_addElement(resultContainer, "div", {
      style: "display: flex; gap: 10px; margin-top: 15px;",
    });

    // 关闭按钮
    const closeBtn = GM_addElement(buttonContainer, "button", {
      textContent: "关闭",
      style: `
                flex: 1;
                padding: 8px 15px;
                cursor: pointer;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 14px;
                font-weight: bold;
                transition: background 0.3s;
            `,
    });
    closeBtn.onmouseover = () => (closeBtn.style.background = "#5a6268");
    closeBtn.onmouseout = () => (closeBtn.style.background = "#6c757d");
    closeBtn.onclick = () => resultContainer.remove();

    // 查看日志按钮
    const logBtn = GM_addElement(buttonContainer, "button", {
      textContent: "查看详细日志",
      style: `
                flex: 1;
                padding: 8px 15px;
                cursor: pointer;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 14px;
                font-weight: bold;
                transition: background 0.3s;
            `,
    });
    logBtn.onmouseover = () => (logBtn.style.background = "#0056b3");
    logBtn.onmouseout = () => (logBtn.style.background = "#007bff");
    logBtn.onclick = () => {
      console.log("%c=== 完整测试报告 ===", "color: blue; font-size: 16px; font-weight: bold;");
      alert("请查看控制台中的详细测试日志");
    };

    console.log("%c=== ScriptCat GM API 测试完成 ===", "color: blue; font-size: 16px; font-weight: bold;");
  })();
})();
