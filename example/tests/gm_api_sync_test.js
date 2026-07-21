// ==UserScript==
// @name         GM API 完整测试 (同步版本)
// @namespace    https://docs.scriptcat.org/
// @version      1.1.1
// @description  全面测试ScriptCat的所有GM API功能
// @author       ScriptCat
// @match        https://content-security-policy.com/?gm_api_sync
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
// @grant        GM.setValue
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js#sha384-vtXRMe3mGCbOeY7l30aIg8H9p3GdeSe4IFlP6G8JMa7o7lXvnz3GFKzPxzJdPfGK
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @resource     testCSS https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css#sha256=62f74b1cf824a89f03554c638e719594c309b4d8a627a758928c0516fa7890ab
// @connect      httpbun.com
// @connect      example.com
// @run-at       document-start
// ==/UserScript==

(async function () {
  "use strict";

  const { describe, it, expect, run } = SCTest.create({ name: "GM API 完整测试(同步)" });

  describe("GM_info", () => {
    it("GM_info 存在", () => {
      expect(GM_info).toBeTypeOf("object");
      expect(GM_info.script).toBeTruthy();
      expect(GM_info.scriptMetaStr).toBeTruthy();
    });
  });

  describe("GM 存储 API", () => {
    it("GM_setValue - 字符串", () => {
      GM_setValue("test_string", "Hello ScriptCat");
      const value = GM_getValue("test_string");
      expect(value).toBe("Hello ScriptCat");
    });

    it("GM_setValue - 数字", () => {
      GM_setValue("test_number", 42);
      const value = GM_getValue("test_number");
      expect(value).toBe(42);
    });

    it("GM_setValue - 布尔值", () => {
      GM_setValue("test_boolean", true);
      const value = GM_getValue("test_boolean");
      expect(value).toBe(true);
    });

    it("GM_setValue - 对象", () => {
      const obj = { name: "ScriptCat", version: "1.2.0", features: ["GM API", "Background"] };
      GM_setValue("test_object", obj);
      const value = GM_getValue("test_object");
      expect(value).toEqual(obj);
    });

    it("GM_setValue - 数组", () => {
      const arr = [1, 2, 3, "test", { key: "value" }];
      GM_setValue("test_array", arr);
      const value = GM_getValue("test_array");
      expect(value).toEqual(arr);
    });

    it("GM_getValue - 默认值", () => {
      const value = GM_getValue("non_existent_key", "default_value");
      expect(value).toBe("default_value");
    });

    it("GM_listValues", () => {
      const values = GM_listValues();
      expect(Array.isArray(values)).toBeTruthy();
      expect(values.includes("test_string")).toBeTruthy();
    });

    it("GM_deleteValue", () => {
      GM_setValue("test_delete", "to be deleted");
      expect(GM_getValue("test_delete")).toBe("to be deleted");
      GM_deleteValue("test_delete");
      expect(GM_getValue("test_delete", "not_found")).toBe("not_found");
    });

    it("GM_addValueChangeListener", () => {
      return new Promise(async (resolve, reject) => {
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
        await GM.setValue("test_listener", "initial");

        // 使用 setTimeout 确保初始值已完全设置
        setTimeout(() => {
          // 添加监听器
          listenerId = GM_addValueChangeListener("test_listener", (name, oldValue, newValue, remote) => {
            // 清除超时
            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            // 验证参数
            try {
              expect(name).toBe("test_listener");
              expect(oldValue).toBe("initial");
              expect(newValue).toBe("changed");
              expect(remote).toBe(false);

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

          // 延迟后修改值触发监听器
          setTimeout(() => {
            GM_setValue("test_listener", "changed");
          }, 100);
        }, 50);
      });
    });
  });

  describe("GM 样式 API", () => {
    it("GM_addStyle - CSS字符串", () => {
      const css = `
            .scriptcat-test {
                color: red;
                font-weight: bold;
            }
        `;
      const element = GM_addStyle(css);
      expect(element && element.tagName === "STYLE").toBeTruthy();
    });
  });

  describe("GM_addElement", () => {
    it("GM_addElement - 创建元素", async () => {
      expect(GM_addElement).toBeTypeOf("function");

      const div = GM_addElement("div", {
        textContent: "ScriptCat GM_addElement 测试",
        style: "position: fixed; top: 10px; right: 10px; background: yellow; padding: 10px; z-index: 9999;",
      });
      expect(div && div.tagName === "DIV").toBeTruthy();

      // 创建脚本元素测试
      const script = GM_addElement("script", {
        textContent: 'window.foo = "bar";',
      });
      expect(script && script.tagName === "SCRIPT").toBeTruthy();
      expect(unsafeWindow.foo).toBe("bar");

      document.querySelector(".container").insertBefore(script, document.querySelector(".masthead"));

      // onload 和 onerror 测试 - 插入图片元素
      let img;
      await new Promise((resolve, reject) => {
        img = GM_addElement(document.body, "img", {
          src: "https://www.tampermonkey.net/favicon.ico",
          onload: () => {
            resolve();
          },
          onerror: (error) => {
            reject(new Error("图片加载失败: " + error));
          },
        });
      });
      expect(img && img.tagName === "IMG").toBeTruthy();

      // 3秒后移除
      setTimeout(() => {
        script.remove();
        div.remove();
        img.remove();
      }, 3000);
    });
  });

  describe("GM 资源 API", () => {
    it("GM_getResourceText", () => {
      expect(GM_getResourceText).toBeTypeOf("function");

      const css = GM_getResourceText("testCSS");
      expect(css).toBeTypeOf("string");
      expect(css.length).toBe(163870);
    });

    it("GM_getResourceURL", () => {
      expect(GM_getResourceURL).toBeTypeOf("function");

      const url = GM_getResourceURL("testCSS");
      expect(url).toBeTypeOf("string");
      expect(url.startsWith("data:") || url.startsWith("blob:")).toBeTruthy();
    });
  });

  describe("GM 网络请求 API", () => {
    it("GM_xmlhttpRequest - GET 请求", () => {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: "https://httpbun.com/get",
          timeout: 10000,
          onload: (response) => {
            try {
              expect(response.status).toBe(200);
              expect(response.responseText).toBeTruthy();
              const data = JSON.parse(response.responseText);
              expect(data).toBeTypeOf("object");
              expect(data.url).toBe("https://httpbun.com/get");
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
  });

  describe("GM 通知 API", () => {
    it("GM_notification", () => {
      expect(GM_notification).toBeTypeOf("function");

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
  });

  describe("GM 剪贴板 API", () => {
    it("GM_setClipboard", () => {
      expect(GM_setClipboard).toBeTypeOf("function");

      GM_setClipboard("ScriptCat GM API 测试文本 - " + new Date().toLocaleString());
      console.log("文本已复制到剪贴板（可以尝试粘贴验证）");
    });
  });

  describe("GM 标签页 API", () => {
    it("GM_openInTab (不执行)", () => {
      // 不实际打开标签页，只测试函数是否存在
      expect(GM_openInTab).toBeTypeOf("function");
    });
  });

  describe("GM 菜单 API", () => {
    it("GM_registerMenuCommand", () => {
      const menuId = GM_registerMenuCommand("ScriptCat 测试菜单", () => {
        alert("测试菜单被点击！");
      });
      expect(menuId !== undefined).toBeTruthy();
    });
  });

  describe("GM Cookie API", () => {
    it("GM_cookie 函数存在", () => {
      expect(GM_cookie).toBeTypeOf("function");
    });

    // 测试 GM_cookie(action, details, callback)
    it("GM_cookie - 回调风格 set", () => {
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
              resolve();
            }
          }
        );
      });
    });

    it("GM_cookie - 回调风格 set (带 domain 和 path)", () => {
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
              resolve();
            }
          }
        );
      });
    });

    it("GM_cookie - 回调风格 list (by domain)", () => {
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
                expect(Array.isArray(cookies)).toBeTruthy();
                expect(cookies.length >= 1).toBeTruthy();
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          }
        );
      });
    });

    it("GM_cookie - 回调风格 list (by url)", () => {
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
                expect(Array.isArray(cookies)).toBeTruthy();
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          }
        );
      });
    });

    it("GM_cookie - 回调风格 delete", () => {
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
              resolve();
            }
          }
        );
      });
    });

    it("GM_cookie - 验证删除后", () => {
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
                expect(!test2Cookie).toBeTruthy();
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
    it("清理测试 cookies", () => {
      return new Promise((resolve, reject) => {
        GM_cookie("list", { domain: "example.com" }, (cookies, error) => {
          if (error) {
            reject(new Error("列出 cookies 失败: " + error));
            return;
          }

          const testCookies = cookies.filter((c) => c.name.startsWith("scriptcat_test"));

          if (testCookies.length === 0) {
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
                  resolve();
                }
              }
            );
          });
        });
      });
    });
  });

  describe("unsafeWindow", () => {
    it("unsafeWindow", () => {
      expect(unsafeWindow).toBeTypeOf("object");
      expect(unsafeWindow.document).toBe(document);
    });
  });

  describe("@require", () => {
    it("jQuery 加载 (@require)", () => {
      expect(jQuery).toBeTypeOf("function");
      expect($).toBeTypeOf("function");
    });
  });

  await run();
})();
