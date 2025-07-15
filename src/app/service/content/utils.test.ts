import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compileScriptCode, compileScript, compileInjectScript, addStyle } from "./utils";
import type { ScriptRunResource } from "@App/app/repo/scripts";
import type { ScriptFunc } from "./types";

// Mock chrome runtime
const mockChrome = {
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test-id${path}`),
  },
};

// 设置全局 chrome 对象
Object.defineProperty(global, "chrome", {
  value: mockChrome,
  writable: true,
});

describe("utils", () => {
  beforeEach(() => {
    // 重置所有 mock
    vi.clearAllMocks();

    // 设置 console mock 来避免测试输出污染
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // 清理 DOM
    document.head.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";

    vi.restoreAllMocks();
  });

  describe("compileScriptCode", () => {
    const createMockScriptRes = (overrides: Partial<ScriptRunResource> = {}): ScriptRunResource => ({
      uuid: "test-uuid",
      name: "Test Script",
      namespace: "test.namespace",
      type: 1,
      status: 1,
      sort: 0,
      runStatus: "complete",
      createtime: Date.now(),
      checktime: Date.now(),
      code: "console.log('test');",
      value: {},
      flag: "test-flag",
      resource: {},
      metadata: {},
      ...overrides,
    });

    it("应该正确编译基本脚本代码", () => {
      const scriptRes = createMockScriptRes({
        name: "Basic Script",
        code: "console.log('hello world');",
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("console.log('hello world');");
      expect(result).toContain("//# sourceURL=");
      expect(result).toContain("Basic%20Script.user.js");
      expect(result).toContain("try {");
      expect(result).toContain("} catch (e) {");
      expect(result).toContain("with(arguments[0]||this.$)");
      expect(result).toContain("return (async function(){");
    });

    it("应该处理自定义脚本代码参数", () => {
      const scriptRes = createMockScriptRes();
      const customCode = "alert('custom code');";

      const result = compileScriptCode(scriptRes, customCode);

      expect(result).toContain("alert('custom code');");
      expect(result).not.toContain("console.log('test');");
    });

    it("应该包含 require 资源", () => {
      const scriptRes = createMockScriptRes({
        metadata: {
          require: ["https://example.com/lib1.js", "https://example.com/lib2.js"],
        },
        resource: {
          "https://example.com/lib1.js": {
            url: "https://example.com/lib1.js",
            content: "// Library 1 content",
            base64: "",
            hash: {
              md5: "test",
              sha1: "test",
              sha256: "test",
              sha384: "test",
              sha512: "test",
            },
            type: "require",
            link: {},
            contentType: "text/javascript",
            createtime: Date.now(),
          },
          "https://example.com/lib2.js": {
            url: "https://example.com/lib2.js",
            content: "// Library 2 content",
            base64: "",
            hash: {
              md5: "test",
              sha1: "test",
              sha256: "test",
              sha384: "test",
              sha512: "test",
            },
            type: "require",
            link: {},
            contentType: "text/javascript",
            createtime: Date.now(),
          },
        },
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("// Library 1 content");
      expect(result).toContain("// Library 2 content");
    });

    it("应该忽略不存在的 require 资源", () => {
      const scriptRes = createMockScriptRes({
        metadata: {
          require: ["https://example.com/missing.js", "https://example.com/existing.js"],
        },
        resource: {
          "https://example.com/existing.js": {
            url: "https://example.com/existing.js",
            content: "// Existing content",
            base64: "",
            hash: {
              md5: "test",
              sha1: "test",
              sha256: "test",
              sha384: "test",
              sha512: "test",
            },
            type: "require",
            link: {},
            contentType: "text/javascript",
            createtime: Date.now(),
          },
        },
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("// Existing content");
      expect(result).not.toContain("missing.js");
    });

    it("应该正确处理脚本名称中的特殊字符", () => {
      const scriptRes = createMockScriptRes({
        name: "Test Script with 中文 & Special!@#$%^&*() Characters",
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("sourceURL=");
      // 验证 encodeURI 被正确应用
      expect(mockChrome.runtime.getURL).toHaveBeenCalledWith(
        "/Test%20Script%20with%20%E4%B8%AD%E6%96%87%20&%20Special!@#$%25%5E&*()%20Characters.user.js"
      );
    });

    it("应该包含错误处理逻辑", () => {
      const scriptRes = createMockScriptRes({
        name: "Error Test Script",
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("catch (e)");
      expect(result).toContain("console.error");
      expect(result).toContain("arguments[1]");
      expect(result).toContain("e.message && e.stack");
    });

    it("应该处理空的 metadata", () => {
      const scriptRes = createMockScriptRes({
        metadata: {},
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toBeDefined();
      expect(result).toContain("try {");
    });

    it("应该处理 undefined require", () => {
      const scriptRes = createMockScriptRes({
        metadata: {
          require: undefined,
        },
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toBeDefined();
      expect(result).toContain("try {");
    });
  });

  describe("compileScript", () => {
    it("应该返回一个函数", () => {
      const code = "return 'test result';";
      const result = compileScript(code);

      expect(typeof result).toBe("function");
    });

    it("应该编译并执行简单代码", () => {
      const code = "return arguments[0].value + arguments[1];";
      const func: ScriptFunc = compileScript(code);

      const result = func({ value: 10 }, "test-script");

      expect(result).toBe("10test-script");
    });

    it("应该处理复杂的脚本逻辑", () => {
      const code = `
        const named = arguments[0];
        const scriptName = arguments[1];
        if (named && named.multiply) {
          return named.value * named.multiply;
        }
        return scriptName;
      `;
      const func: ScriptFunc = compileScript(code);

      const result1 = func({ value: 5, multiply: 3 }, "test");
      const result2 = func({ value: 5 }, "fallback");

      expect(result1).toBe(15);
      expect(result2).toBe("fallback");
    });

    it("应该处理异步代码", async () => {
      const code = `
        return new Promise(resolve => {
          setTimeout(() => resolve(arguments[0].value * 2), 10);
        });
      `;
      const func: ScriptFunc = compileScript(code);

      const result = await func({ value: 5 }, "async-test");

      expect(result).toBe(10);
    });

    it("应该正确处理错误", () => {
      const code = "throw new Error('Test error');";
      const func: ScriptFunc = compileScript(code);

      expect(() => func({}, "error-test")).toThrow("Test error");
    });
  });

  describe("compileInjectScript", () => {
    const createMockScript = (overrides: Partial<ScriptRunResource> = {}): ScriptRunResource => ({
      uuid: "inject-test-uuid",
      name: "Inject Test Script",
      namespace: "inject.test",
      type: 1,
      status: 1,
      sort: 0,
      runStatus: "complete",
      createtime: Date.now(),
      checktime: Date.now(),
      code: "",
      value: {},
      flag: "inject-test-flag",
      resource: {},
      metadata: {},
      ...overrides,
    });

    it("应该生成基本的注入脚本代码", () => {
      const script = createMockScript();
      const scriptCode = "console.log('injected');";

      const result = compileInjectScript(script, scriptCode);

      expect(result).toBe(`window['inject-test-flag'] = function(){console.log('injected');}`);
    });

    it("应该包含自动删除挂载函数的代码", () => {
      const script = createMockScript();
      const scriptCode = "console.log('with auto delete');";

      const result = compileInjectScript(script, scriptCode, true);

      expect(result).toContain(`try{delete window['inject-test-flag']}catch(e){}`);
      expect(result).toContain("console.log('with auto delete');");
      expect(result).toBe(
        `window['inject-test-flag'] = function(){try{delete window['inject-test-flag']}catch(e){}console.log('with auto delete');}`
      );
    });

    it("默认情况下不应该包含自动删除代码", () => {
      const script = createMockScript();
      const scriptCode = "console.log('without auto delete');";

      const result = compileInjectScript(script, scriptCode);

      expect(result).not.toContain("try{delete window");
      expect(result).toBe(`window['inject-test-flag'] = function(){console.log('without auto delete');}`);
    });

    it("应该处理复杂的脚本代码", () => {
      const script = createMockScript({ flag: "complex-flag" });
      const scriptCode = `
        var x = 1;
        function test() { return x + 1; }
        console.log(test());
      `;

      const result = compileInjectScript(script, scriptCode, true);

      expect(result).toContain("window['complex-flag']");
      expect(result).toContain("var x = 1;");
      expect(result).toContain("function test()");
      expect(result).toContain("try{delete window['complex-flag']}catch(e){}");
    });

    it("应该正确转义脚本标志名称", () => {
      const script = createMockScript({ flag: "flag-with-special-chars_123" });
      const scriptCode = "console.log('test');";

      const result = compileInjectScript(script, scriptCode);

      expect(result).toContain(`window['flag-with-special-chars_123']`);
    });
  });

  describe("addStyle", () => {
    it("应该创建并添加 style 元素到 head", () => {
      const css = "body { background: red; }";

      const styleElement = addStyle(css);

      expect(styleElement).toBeInstanceOf(HTMLStyleElement);
      expect(styleElement.textContent).toBe(css);
      expect(document.head.contains(styleElement)).toBe(true);
    });

    it("应该在没有 head 时添加到 documentElement", () => {
      // 移除 head 元素
      const head = document.head;
      head.remove();

      const css = ".test { color: blue; }";
      const styleElement = addStyle(css);

      expect(styleElement).toBeInstanceOf(HTMLStyleElement);
      expect(styleElement.textContent).toBe(css);
      expect(document.documentElement.contains(styleElement)).toBe(true);

      // 恢复 head 元素以便其他测试
      document.documentElement.appendChild(head);
    });

    it("应该处理空的 CSS 字符串", () => {
      const css = "";

      const styleElement = addStyle(css);

      expect(styleElement.textContent).toBe("");
      expect(document.head.contains(styleElement)).toBe(true);
    });

    it("应该处理复杂的 CSS 规则", () => {
      const css = `
        .container {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        @media (max-width: 768px) {
          .container {
            flex-direction: column;
          }
        }
        
        .item:hover {
          transform: scale(1.1);
          transition: transform 0.3s ease;
        }
      `;

      const styleElement = addStyle(css);

      expect(styleElement.textContent).toBe(css);
      expect(document.head.contains(styleElement)).toBe(true);
    });

    it("应该允许添加多个样式", () => {
      const css1 = ".class1 { color: red; }";
      const css2 = ".class2 { color: blue; }";

      const style1 = addStyle(css1);
      const style2 = addStyle(css2);

      expect(document.head.contains(style1)).toBe(true);
      expect(document.head.contains(style2)).toBe(true);
      expect(style1.textContent).toBe(css1);
      expect(style2.textContent).toBe(css2);
      expect(document.head.children.length).toBeGreaterThanOrEqual(2);
    });

    it("应该返回添加的 style 元素", () => {
      const css = ".return-test { font-size: 14px; }";

      const returnedElement = addStyle(css);
      const queriedElement = document.querySelector("style");

      expect(returnedElement).toBe(queriedElement);
      expect(returnedElement?.textContent).toBe(css);
    });
  });
});
