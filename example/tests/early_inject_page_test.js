// ==UserScript==
// @name         Early-start Test (page 环境)
// @namespace    https://docs.scriptcat.org/
// @version      0.1.0
// @description  early-start 可以比 document-start 更早执行
// @match        https://content-security-policy.com/?early_inject_page
// @early-start
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

// reporter: "console" — 用例本身在断言 document-start 时 DOM 应保持原始态(head/body 均不存在、
// 唯一节点 innerHTML 为空);Panel reporter 会在 run() 开始时把浮层面板挂到 document.documentElement
// 下,抢在该断言之前弄脏这个待验证的原始态,所以这里必须关闭 Panel,只留 Console 通道。
const { describe, it, expect, run } = SCTest.create({ name: "Early-start 测试(page 环境)", reporter: "console" });

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
    // 清理测试元素
    element.parentNode.removeChild(element);
  });

  it("GM_addStyle", () => {
    const styleElement = GM_addStyle(`
            .gm-style-test {
                color: #10b981 !important;
            }
        `);
    expect(styleElement !== null && styleElement !== undefined).toBeTruthy();
    expect(styleElement.tagName === "STYLE" || styleElement.sheet).toBeTruthy();
    // 清理测试样式
    styleElement.parentNode.removeChild(styleElement);
  });
});

(async function () {
  "use strict";

  describe("早期脚本环境检查", () => {
    it("检查 document.head 不存在", () => {
      console.log("document.head 存在:", !!document.head);
      console.log("document.head 值:", document.head);
      // 早期脚本运行时 document.head 应该不存在
      expect(document.head === null || document.head === undefined).toBeTruthy();
    });

    it("检查 document.body 不存在", () => {
      console.log("document.body 存在:", !!document.body);
      console.log("document.body 值:", document.body);
      // 早期脚本运行时 document.body 应该不存在
      expect(document.body === null || document.body === undefined).toBeTruthy();
    });

    it("检查可用的DOM节点应该是HTML元素", () => {
      const firstElement = document.querySelector("*");
      console.log("querySelector('*') 找到的第一个元素:", firstElement?.tagName);
      expect(firstElement !== null).toBeTruthy();
      expect(firstElement.tagName).toBe("HTML");
      expect(firstElement.innerHTML).toBe("");
    });

    it("检查页面CSP", async () => {
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
        expect(true).toBeTruthy();
      } else if (loadResult.success) {
        console.log("%c✗ 页面无CSP限制或已允许该资源（不符合预期）", "color: #ef4444; font-weight: bold;");
        expect(false).toBeTruthy();
      }
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
      await GM.setValue("test_key", "早期脚本测试值");
      const value = GM_getValue("test_key");
      expect(value).toBe("早期脚本测试值");
    });

    it("GM_setValue - 数字", () => {
      GM_setValue("test_number", 12345);
      const value = GM_getValue("test_number");
      expect(value).toBe(12345);
    });

    it("GM_setValue - 对象", () => {
      const obj = { name: "ScriptCat", type: "early" };
      GM_setValue("test_object", obj);
      const value = GM_getValue("test_object", {});
      expect(value.name).toBe("ScriptCat");
      expect(value.type).toBe("early");
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
