// ==UserScript==
// @name         Inject-into content 环境测试
// @namespace    https://docs.scriptcat.org/
// @version      0.1.0
// @description  脚本注入到content环境，应该可以绕过CSP检测，但无法访问页面的window
// @match        https://content-security-policy.com/?inject_content
// @inject-into  content
// @grant        GM_addElement
// @grant        GM_addStyle
// @grant        GM_log
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @run-at       document-start
// ==/UserScript==

(async function () {
  "use strict";

  const { describe, it, expect, run } = SCTest.create({ name: "Inject-into content 环境测试" });

  describe("CSP绕过测试", () => {
    it("CSP绕过 - 内联脚本", () => {
      const script = document.createElement("script");
      script.textContent = 'console.log("Content环境绕过CSP测试");';
      document.head.appendChild(script);
      expect(script.parentNode === document.head).toBeTruthy();
    });
  });

  describe("DOM操作 API 测试", () => {
    it("GM_addElement", () => {
      const element = GM_addElement("div", {
        textContent: "GM_addElement测试元素",
        style: "display:none;",
        id: "gm-test-element",
      });
      expect(element !== null && element !== undefined).toBeTruthy();
      expect(element.id).toBe("gm-test-element");
      expect(element.tagName).toBe("DIV");
    });

    it("GM_addStyle", () => {
      const styleElement = GM_addStyle(`
            .gm-style-test {
                color: #10b981 !important;
            }
        `);
      expect(styleElement !== null && styleElement !== undefined).toBeTruthy();
      expect(styleElement.tagName === "STYLE" || styleElement.sheet).toBeTruthy();
    });
  });

  describe("GM_log 测试", () => {
    it("GM_log", () => {
      GM_log("测试日志输出", "info", { type: "test", value: 123 });
      // GM_log本身不返回值,只要不抛出异常就算成功
      expect(true).toBeTruthy();
    });
  });

  describe("GM_info 测试", () => {
    it("GM_info", () => {
      expect(typeof GM_info === "object").toBeTruthy();
      expect(!!GM_info.script).toBeTruthy();
      expect(!!GM_info.script.name).toBeTruthy();
    });
  });

  describe("GM 存储 API 测试", () => {
    it("GM_setValue - 字符串", async () => {
      await GM.setValue("test_key", "content环境测试值");
      const value = GM_getValue("test_key");
      expect(value).toBe("content环境测试值");
    });

    it("GM_setValue - 数字", () => {
      GM_setValue("test_number", 12345);
      const value = GM_getValue("test_number");
      expect(value).toBe(12345);
    });

    it("GM_setValue - 对象", () => {
      const obj = { name: "ScriptCat", type: "content" };
      GM_setValue("test_object", obj);
      const value = GM_getValue("test_object", {});
      expect(value.name).toBe("ScriptCat");
      expect(value.type).toBe("content");
    });

    it("GM_getValue - 默认值", () => {
      const value = GM_getValue("non_existent_key", "默认值");
      expect(value).toBe("默认值");
    });

    it("GM_listValues", () => {
      const keys = GM_listValues();
      expect(Array.isArray(keys)).toBeTruthy();
      expect(keys.length >= 3).toBeTruthy();
    });

    it("GM_deleteValue", () => {
      GM_setValue("test_delete", "to_be_deleted");
      expect(GM_getValue("test_delete")).toBe("to_be_deleted");
      GM_deleteValue("test_delete");
      expect(GM_getValue("test_delete", null)).toBe(null);
    });
  });

  await run();
})();
