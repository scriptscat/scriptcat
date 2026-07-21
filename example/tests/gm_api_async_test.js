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
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @resource     testCSS https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css#sha256=62f74b1cf824a89f03554c638e719594c309b4d8a627a758928c0516fa7890ab
// @connect      httpbun.com
// @connect      example.com
// @run-at       document-start
// ==/UserScript==

(async function () {
  "use strict";

  const { describe, it, expect, run } = SCTest.create({ name: "GM.* API 完整测试(异步)" });

  describe("GM.info", () => {
    it("GM.info 存在", async () => {
      expect(GM.info).toBeTypeOf("object");
      expect(GM.info.script).toBeTruthy();
      expect(GM.info.scriptMetaStr).toBeTruthy();
    });
  });

  describe("GM 存储 API", () => {
    it("GM.setValue - 字符串", async () => {
      await GM.setValue("test_string", "Hello ScriptCat Async");
      const value = await GM.getValue("test_string");
      expect(value).toBe("Hello ScriptCat Async");
    });

    it("GM.setValue - 数字", async () => {
      await GM.setValue("test_number", 42);
      const value = await GM.getValue("test_number");
      expect(value).toBe(42);
    });

    it("GM.setValue - 布尔值", async () => {
      await GM.setValue("test_boolean", true);
      const value = await GM.getValue("test_boolean");
      expect(value).toBe(true);
    });

    it("GM.setValue - 对象", async () => {
      const obj = { name: "ScriptCat", version: "1.3.0", features: ["GM API", "Async"] };
      await GM.setValue("test_object", obj);
      const value = await GM.getValue("test_object");
      expect(value).toBeTypeOf("object");
      expect(value.name).toBe(obj.name);
      expect(value.version).toBe(obj.version);
      expect(JSON.stringify(value.features)).toBe(JSON.stringify(obj.features));
    });

    it("GM.setValue - 数组", async () => {
      const arr = [1, 2, 3, "test", { key: "value" }];
      await GM.setValue("test_array", arr);
      const value = await GM.getValue("test_array");
      expect(Array.isArray(value)).toBeTruthy();
      expect(value.length).toBe(arr.length);
      expect(value[0]).toBe(arr[0]);
      expect(value[3]).toBe(arr[3]);
      expect(value[4].key).toBe(arr[4].key);
    });

    it("GM.getValue - 默认值", async () => {
      const value = await GM.getValue("non_existent_key", "default_value");
      expect(value).toBe("default_value");
    });

    it("GM.listValues", async () => {
      const values = await GM.listValues();
      expect(Array.isArray(values)).toBeTruthy();
      expect(values.includes("test_string")).toBeTruthy();
    });

    it("GM.deleteValue", async () => {
      await GM.setValue("test_delete", "to be deleted");
      expect(await GM.getValue("test_delete")).toBe("to be deleted");
      await GM.deleteValue("test_delete");
      expect(await GM.getValue("test_delete", "not_found")).toBe("not_found");
    });
  });

  describe("GM 样式 API", () => {
    it("GM.addStyle - CSS字符串", async () => {
      const css = `
      .scriptcat-test-async {
        color: blue;
        font-weight: bold;
      }
    `;
      const element = await GM.addStyle(css);
      expect(element && element.tagName === "STYLE").toBeTruthy();
    });
  });

  describe("GM.addElement", () => {
    it("GM.addElement - 创建元素", async () => {
      expect(GM.addElement).toBeTypeOf("function");

      const div = await GM.addElement("div", {
        textContent: "ScriptCat GM.addElement 测试",
        style: "position: fixed; top: 10px; right: 10px; background: lightblue; padding: 10px; z-index: 9999;",
      });
      expect(div && div.tagName === "DIV").toBeTruthy();

      // 3秒后移除
      setTimeout(() => div.remove(), 3000);
    });
  });

  describe("GM 资源 API", () => {
    it("GM.getResourceText", async () => {
      expect(GM.getResourceText).toBeTypeOf("function");

      const css = await GM.getResourceText("testCSS");
      expect(css).toBeTypeOf("string");
      expect(css.length).toBe(163870);
    });

    it("GM.getResourceUrl", async () => {
      expect(GM.getResourceUrl).toBeTypeOf("function");

      const url = await GM.getResourceUrl("testCSS");
      expect(url).toBeTypeOf("string");
      expect(url.startsWith("data:") || url.startsWith("blob:")).toBeTruthy();
    });
  });

  describe("GM 网络请求 API", () => {
    it("GM.xmlHttpRequest - GET 请求", async () => {
      return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
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

    it("GM.xmlHttpRequest - 返回控制对象", async () => {
      const controller = GM.xmlHttpRequest({
        method: "GET",
        url: "https://httpbun.com/get",
        timeout: 10000,
        onload: () => {},
        onerror: () => {},
      });
      expect(controller).toBeTypeOf("object");
      expect(controller.abort).toBeTypeOf("function");
      controller.abort();
    });
  });

  describe("GM 通知 API", () => {
    it("GM.notification - Promise 版本", async () => {
      expect(GM.notification).toBeTypeOf("function");

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
  });

  describe("GM 剪贴板 API", () => {
    it("GM.setClipboard", async () => {
      expect(GM.setClipboard).toBeTypeOf("function");

      await GM.setClipboard("ScriptCat GM.* API 测试文本 - " + new Date().toLocaleString());
      console.log("文本已复制到剪贴板（可以尝试粘贴验证）");
    });
  });

  describe("GM 标签页 API", () => {
    it("GM.openInTab (不执行)", async () => {
      // 不实际打开标签页，只测试函数是否存在
      expect(GM.openInTab).toBeTypeOf("function");
    });
  });

  describe("GM 菜单 API", () => {
    it("GM.registerMenuCommand", async () => {
      const menuId = await GM.registerMenuCommand("ScriptCat 异步测试菜单", () => {
        alert("异步测试菜单被点击！");
      });
      expect(menuId !== undefined).toBeTruthy();
    });
  });

  describe("GM Cookie API", () => {
    it("GM.cookie 函数存在", async () => {
      expect(GM.cookie).toBeTypeOf("function");
    });

    it("GM.cookie.set", async () => {
      await GM.cookie.set({
        url: "http://example.com/cookie",
        name: "scriptcat_async_test1",
        value: "async_test_value_1",
      });
    });

    it("GM.cookie.set (带 domain 和 path)", async () => {
      await GM.cookie.set({
        url: "http://www.example.com/",
        domain: ".example.com",
        path: "/path",
        name: "scriptcat_async_test2",
        value: "async_test_value_2",
      });
    });

    it("GM.cookie.list (by domain)", async () => {
      const cookies = await GM.cookie.list({
        domain: "example.com",
      });
      expect(Array.isArray(cookies)).toBeTruthy();
      expect(cookies.length >= 1).toBeTruthy();
    });

    it("GM.cookie.list (by url)", async () => {
      const cookies = await GM.cookie.list({
        url: "http://example.com/cookie",
      });
      expect(Array.isArray(cookies)).toBeTruthy();
    });

    it("GM.cookie.delete", async () => {
      await GM.cookie.delete({
        url: "http://www.example.com/path",
        name: "scriptcat_async_test2",
      });
    });

    it("GM.cookie - 验证删除后", async () => {
      const cookies = await GM.cookie.list({
        domain: "example.com",
      });
      const test2Cookie = cookies.find((c) => c.name === "scriptcat_async_test2");
      expect(!test2Cookie).toBeTruthy();
    });

    // 清理所有测试 cookies
    it("清理测试 cookies", async () => {
      const cookies = await GM.cookie.list({ domain: "example.com" });
      const testCookies = cookies.filter((c) => c.name.startsWith("scriptcat_async_test"));

      if (testCookies.length === 0) {
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
    });
  });

  describe("unsafeWindow", () => {
    it("unsafeWindow", async () => {
      expect(unsafeWindow).toBeTypeOf("object");
      expect(unsafeWindow.document).toBe(document);
    });
  });

  describe("@require", () => {
    it("jQuery 加载 (@require)", async () => {
      expect(jQuery).toBeTypeOf("function");
      expect($).toBeTypeOf("function");
    });
  });

  await run();
})();
