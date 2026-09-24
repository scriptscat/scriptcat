import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  compileScriptCode,
  compileScript,
  compileInjectScript,
  compilePreInjectScript,
  compileScriptletCode,
  isScriptletUnwrap,
  addStyle,
  addStyleSheet,
  trimScriptInfo,
  trimPreInjectScriptInfo,
  getEffectiveScriptGrants,
  getCompiledScriptMetadata,
} from "./utils";
import type { SCMetadata, ScriptLoadInfo, ScriptRunResource } from "@App/app/repo/scripts";
import type { ScriptFunc } from "./types";
import { nativeCall } from "./global";
import { RuleType, type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { getPageRpcAllowedAPIs } from "./page_rpc";

const fnStrIntegrity = process.env.SC_RANDOM_FNKEY!;

type GeneratedWindow = Record<string, unknown>;

function executeGeneratedScript(
  code: string,
  targetWindow: GeneratedWindow,
  testPerformance: Pick<Performance, "dispatchEvent" | "addEventListener"> = globalThis.performance
) {
  const execute = new Function("window", "performance", "CustomEvent", code) as (
    window: GeneratedWindow,
    performance: Pick<Performance, "dispatchEvent" | "addEventListener">,
    customEvent: typeof CustomEvent
  ) => void;
  execute(targetWindow, testPerformance, globalThis.CustomEvent);
}

// 设置 console mock 来避免测试输出污染
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("utils", () => {
  describe.concurrent("compileScriptCode", () => {
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
      originalMetadata: {},
      ...overrides,
    });

    it.concurrent("应该正确编译基本脚本代码", () => {
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
      expect(result).toContain("return async function(){console.log('hello world');}");
      expect(result).not.toContain("Math.random()");
      expect(result).not.toContain("Date.now()");
    });

    it.concurrent("应该处理自定义脚本代码参数", () => {
      const scriptRes = createMockScriptRes();
      const customCode = "alert('custom code');";

      const result = compileScriptCode(scriptRes, customCode);

      expect(result).toContain("alert('custom code');");
      expect(result).not.toContain("console.log('test');");
    });

    it.concurrent("应该包含 require 资源", () => {
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
      expect(result.indexOf("// Library 1 content")).toBeLessThan(result.indexOf("// Library 2 content"));
    });

    it.concurrent("应该从 category-specific resource map 编译冲突 key 的 require", () => {
      const sharedUrl = "https://example.com/shared.js";
      const scriptRes = createMockScriptRes({
        metadata: { require: [sharedUrl] },
        resource: {
          [sharedUrl]: {
            url: "https://example.com/wrong-resource.txt",
            content: "wrong resource content",
            base64: "",
            hash: {
              md5: "test",
              sha1: "test",
              sha256: "test",
              sha384: "test",
              sha512: "test",
            },
            type: "resource",
            link: {},
            contentType: "text/plain",
            createtime: Date.now(),
          },
        },
        resourceByType: {
          require: {
            [sharedUrl]: {
              url: sharedUrl,
              content: "correct library content",
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
          "require-css": {},
          resource: {},
        },
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("correct library content");
      expect(result).not.toContain("wrong resource content");
    });

    it.concurrent("应该忽略不存在的 require 资源", () => {
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

    it.concurrent("应该正确处理脚本名称中的特殊字符", () => {
      const scriptRes = createMockScriptRes({
        name: "Test Script with 中文 & Special!@#$%^&*() Characters",
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("sourceURL=");
      // 验证 encodeURI 被正确应用
      expect(chrome.runtime.getURL).toHaveBeenCalledWith(
        "/Test%20Script%20with%20%E4%B8%AD%E6%96%87%20&%20Special!@#$%25%5E&*()%20Characters.user.js"
      );
    });

    it.concurrent("应该包含错误处理逻辑", () => {
      const scriptRes = createMockScriptRes({
        name: "Error Test Script",
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toContain("catch (e)");
      expect(result).toContain("console.error");
      expect(result).toContain("arguments[1]");
      expect(result).toContain("e.message && e.stack");
    });

    it.concurrent("应该处理空的 metadata", () => {
      const scriptRes = createMockScriptRes({
        metadata: {},
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toBeDefined();
      expect(result).toContain("try {");
    });

    it.concurrent("应该处理 undefined require", () => {
      const scriptRes = createMockScriptRes({
        metadata: {
          require: undefined,
        },
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toBeDefined();
      expect(result).toContain("try {");
    });

    it.concurrent("应该处理 @run-at context-menu", () => {
      const scriptRes = createMockScriptRes({
        name: 'ScriptCat\'s demo for "context-menu"',
        code: "console.log(567); // testing",
        metadata: {
          "run-at": ["context-menu"],
        },
      });

      const result = compileScriptCode(scriptRes);

      expect(result).toBeDefined();
      expect(result).toContain(
        `GM_registerMenuCommand(("ScriptCat's demo for \\"context-menu\\""), ()=>{\nconsole.log(567); // testing\n}, {nested:false});\n`
      );
    });

    it.concurrent("@run-at context-menu 的包装不得屏蔽脚本体自己的 GM_registerMenuCommand", () => {
      const scriptRes = createMockScriptRes({
        name: "menu registering script",
        code: 'GM_registerMenuCommand("Own Item", () => {});',
        metadata: {
          "run-at": ["context-menu"],
        },
      });

      const result = compileScriptCode(scriptRes);

      // 曾经在回调开头把 GM_registerMenuCommand 连同 window./GM. 上的引用一起置为 undefined，
      // 于是任何在脚本体里注册菜单的脚本一点菜单就 TypeError 中断，自己的菜单项也永远注册不上
      expect(result).not.toContain("GM_registerMenuCommand=undefined");
      expect(result).not.toContain("window.GM_registerMenuCommand");
      expect(result).not.toContain("GM.registerMenuCommand");
    });
  });

  describe("trimScriptInfo resource selection", () => {
    const assetName = "asset";
    const assetDeclaration = `${assetName} https://example.com/asset.bin`;
    const libraryUrl = "https://example.com/library.js";
    const styleUrl = "https://example.com/style.css";
    const resourceGrants = [
      "GM_getResourceText",
      "GM.getResourceText",
      "GM_getResourceURL",
      "GM.getResourceUrl",
      "GM.getResourceURL",
      "GM_getResourceUrl",
    ];

    const resource = (url: string, content: string) => ({
      url,
      content,
      base64: "",
      hash: { md5: "test", sha1: "test", sha256: "test", sha384: "test", sha512: "test" },
      type: "resource" as const,
      link: {},
      contentType: "text/plain",
      createtime: Date.now(),
    });

    const createScript = (metadata: SCMetadata, resourceKeys: string[]) =>
      ({
        uuid: "trim-test-uuid",
        name: "Trim test",
        namespace: "trim.test",
        type: 1,
        status: 1,
        sort: 0,
        runStatus: "complete",
        createtime: Date.now(),
        checktime: Date.now(),
        code: "",
        value: {},
        flag: "trim-test-flag",
        resource: Object.fromEntries(
          resourceKeys.map((key) => [
            key,
            resource(
              key === assetName ? "https://example.com/asset.bin" : key,
              key === libraryUrl ? "library content" : key === styleUrl ? "body { color: red; }" : "asset content"
            ),
          ])
        ),
        metadata,
        originalMetadata: {},
      }) as unknown as ScriptLoadInfo;

    it.each([
      {
        name: "drops @resource without a resource grant",
        metadata: { resource: [assetDeclaration] },
        resourceKeys: [assetName],
        expected: [],
      },
      {
        name: "drops @resource for ordinary @grant none",
        metadata: { grant: ["none"], resource: [assetDeclaration] },
        resourceKeys: [assetName],
        expected: [],
      },
      {
        name: "does not forward @require after Service Worker compilation",
        metadata: { require: [libraryUrl] },
        resourceKeys: [libraryUrl],
        expected: [],
      },
      {
        name: "keeps @require-css independently of resource grants",
        metadata: { "require-css": [styleUrl] },
        resourceKeys: [styleUrl],
        expected: [],
        expectedCss: [styleUrl],
      },
      {
        name: "keeps CSS and granted @resource but not compiled @require",
        metadata: {
          grant: ["GM_getResourceText"],
          resource: [assetDeclaration],
          require: [libraryUrl],
          "require-css": [styleUrl],
        },
        resourceKeys: [assetName, libraryUrl, styleUrl],
        expected: [assetName],
        expectedCss: [styleUrl],
      },
      {
        name: "keeps CSS when @grant none disables resource APIs",
        metadata: {
          grant: ["none", "GM_getResourceText"],
          resource: [assetDeclaration],
          "require-css": [styleUrl],
        },
        resourceKeys: [assetName, styleUrl],
        expected: [],
        expectedCss: [styleUrl],
      },
    ])("$name", ({ metadata, resourceKeys, expected, expectedCss }) => {
      const trimmed = trimScriptInfo(createScript(metadata, resourceKeys));

      expect(Object.keys(trimmed.resource).sort()).toEqual(expected.sort());
      expect(Object.keys(trimmed.requireCssResource || {}).sort()).toEqual((expectedCss || []).sort());
    });

    it.each(resourceGrants)("keeps @resource for %s", (grant) => {
      const script = createScript({ grant: [grant], resource: [assetDeclaration] }, [assetName]);
      script.resourceByType = {
        require: {},
        "require-css": {},
        resource: { [assetName]: script.resource[assetName] },
      };
      const trimmed = trimScriptInfo(script);

      expect(Object.keys(trimmed.resource)).toEqual([assetName]);
    });

    it("keeps a resource grant in context-menu scripts after removing none", () => {
      const trimmed = trimScriptInfo(
        createScript(
          {
            grant: ["none", "GM_getResourceText"],
            resource: [assetDeclaration],
            "run-at": ["context-menu"],
          },
          [assetName]
        )
      );

      expect(Object.keys(trimmed.resource)).toEqual([assetName]);
    });

    it("keeps category-specific values when resource keys collide", () => {
      const sharedKey = "https://example.com/shared";
      const script = createScript(
        {
          grant: ["GM_getResourceText"],
          resource: [`${sharedKey} https://example.com/data.txt`],
          "require-css": [sharedKey],
        },
        [sharedKey]
      );
      script.resourceByType = {
        require: { [sharedKey]: resource(sharedKey, "library content") },
        "require-css": { [sharedKey]: resource(sharedKey, "body { color: red; }") },
        resource: { [sharedKey]: resource("https://example.com/data.txt", "resource content") },
      };

      const trimmed = trimScriptInfo(script);

      expect(trimmed.resource[sharedKey]?.content).toBe("resource content");
      expect(trimmed.requireCssResource?.[sharedKey]?.content).toBe("body { color: red; }");
    });

    it("does not expose malformed @resource declarations", () => {
      const script = createScript(
        {
          grant: ["GM_getResourceText"],
          resource: [assetName, `${assetName} https://example.com/asset.bin extra`],
        },
        [assetName]
      );

      expect(Object.keys(trimScriptInfo(script).resource)).toEqual([]);
    });

    it("does not mutate the full resource map while trimming", () => {
      const script = createScript(
        {
          grant: ["GM_getResourceText"],
          resource: [assetDeclaration],
          require: [libraryUrl],
          "require-css": [styleUrl],
        },
        [assetName, libraryUrl, styleUrl]
      );
      const originalResourceKeys = Object.keys(script.resource);

      const trimmed = trimScriptInfo(script);

      expect(Object.keys(script.resource)).toEqual(originalResourceKeys);
      expect(trimmed.resource[assetName]).toEqual({
        base64: "",
        content: "asset content",
        contentType: "text/plain",
      });
    });

    it("copies public values and metadata before crossing the page boundary", () => {
      const script = createScript({ grant: ["GM_getValue"] }, []);
      script.value = { nested: { count: 1 } };
      script.metadata.grant!.push("GM_setValue");

      const trimmed = trimScriptInfo(script);
      (trimmed.value.nested as { count: number }).count = 9;
      trimmed.metadata.grant!.push("GM_deleteValue");

      expect(script.value.nested).toEqual({ count: 1 });
      expect(script.metadata.grant).toEqual(["GM_getValue", "GM_setValue"]);
    });

    it("binds a source revision and preloads synchronous userscript state without page capabilities", () => {
      const script = createScript({ grant: ["GM_getValue"] }, []);
      script.uuid = "revision-script";
      script.createtime = 123;
      script.updatetime = 456;
      script.value = { secret: "value" };
      script.config = { private: { secret: { title: "Private", description: "", index: 0, default: "config" } } };
      script.userConfig = {
        private: { secret: { title: "Private", description: "", index: 0, default: "user config" } },
      };
      script.userConfigStr = '{"secret":"user config"}';

      const trimmed = trimScriptInfo(script);
      const preInject = trimPreInjectScriptInfo(script);

      expect(trimmed.scriptRevision).toBe("revision-script:123:456");
      expect(preInject.value).toEqual({ secret: "value" });
      expect(preInject.config).toEqual(script.config);
      expect(preInject.userConfig).toEqual(script.userConfig);
      expect(preInject.userConfigStr).toBe(script.userConfigStr);
      expect(preInject.executionHandle).toBeUndefined();
      expect(preInject.executionEnvTag).toBeUndefined();
      expect(preInject.executionRunFlag).toBeUndefined();
    });

    it("preserves an explicitly supplied compiled revision", () => {
      const script = createScript({ grant: ["GM_getValue"] }, []);
      script.scriptRevision = "compiled-revision";

      expect(trimScriptInfo(script).scriptRevision).toBe("compiled-revision");
    });
  });

  describe("compileScript", () => {
    it.concurrent("应该返回一个函数", () => {
      const code = "return 'test result';";
      const result = compileScript(code);

      expect(typeof result).toBe("function");
    });

    it.concurrent("应该编译并执行简单代码", () => {
      const code = "return arguments[0].value + arguments[1];";
      const func: ScriptFunc = compileScript(code);

      const result = func(fnStrIntegrity, {}, { value: 10 }, "test-script");

      expect(result).toBe("10test-script");
    });

    it.concurrent("应该处理复杂的脚本逻辑", () => {
      const code = `
        const named = arguments[0];
        const scriptName = arguments[1];
        if (named && named.multiply) {
          return named.value * named.multiply;
        }
        return scriptName;
      `;
      const func: ScriptFunc = compileScript(code);

      const result1 = func(fnStrIntegrity, {}, { value: 5, multiply: 3 }, "test");
      const result2 = func(fnStrIntegrity, {}, { value: 5 }, "fallback");

      expect(result1).toBe(15);
      expect(result2).toBe("fallback");
    });

    it.concurrent("应该处理异步代码", async () => {
      const code = `
        return new Promise(resolve => {
          setTimeout(() => resolve(arguments[0].value * 2), 10);
        });
      `;
      const func: ScriptFunc = compileScript(code);

      const result = await func(fnStrIntegrity, {}, { value: 5 }, "async-test");

      expect(result).toBe(10);
    });

    it.concurrent("应该正确处理错误", () => {
      const code = "throw new Error('Test error');";
      const func: ScriptFunc = compileScript(code);

      expect(() => func(fnStrIntegrity, {}, {}, "error-test")).toThrow("Test error");
    });

    it.concurrent("完整性标记不匹配时不应执行脚本", () => {
      const func: ScriptFunc = compileScript("throw new Error('should not run');");

      expect(func("invalid", {}, {}, "blocked")).toBeUndefined();
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
      originalMetadata: {},
      ...overrides,
    });

    it("生成的腳本包裝不依賴被 require 內容改寫的 Function.prototype 调用方法", async () => {
      const script = createMockScript({
        code: "return this;",
        resource: {
          library: {
            url: "https://example.com/library.js",
            content:
              "Function.prototype.call = Function.prototype.apply = Function.prototype.bind = () => { throw new Error('poisoned invocation'); };",
            base64: "",
            hash: { md5: "", sha1: "", sha256: "", sha384: "", sha512: "" },
            type: "require",
            link: {},
            contentType: "text/javascript",
            createtime: Date.now(),
          },
        },
        metadata: { require: ["library"] },
      });
      const func = compileScript(compileScriptCode(script), true);
      const originalCall = Function.prototype.call;
      const originalApply = Function.prototype.apply;
      const originalBind = Function.prototype.bind;
      let result: unknown;
      try {
        result = await func(fnStrIntegrity, globalThis, {}, script.name);
      } finally {
        Function.prototype.call = originalCall;
        Function.prototype.apply = originalApply;
        Function.prototype.bind = originalBind;
      }
      expect(result).toBe(globalThis);
    });

    it.concurrent("应该生成基本的注入脚本代码", () => {
      const script = createMockScript();
      const scriptCode = "console.log('injected');";

      const result = compileInjectScript(script, scriptCode);

      expect(result).toContain("window['inject-test-flag'] =");
      expect(result).toContain("function(){console.log('injected');}");
      expect(result).not.toContain("Object.defineProperty(f, k");
    });

    it.concurrent("应该包含自动删除挂载函数的代码", () => {
      const script = createMockScript();
      const scriptCode = "console.log('with auto delete');";

      const result = compileInjectScript(script, scriptCode, true);

      expect(result).toContain(`try{delete window['inject-test-flag']}catch(e){}`);
      expect(result).toContain("console.log('with auto delete');");
      expect(result).toContain("try{delete window['inject-test-flag']}catch(e){}");
      expect(result).toContain(
        "function(){try{delete window['inject-test-flag']}catch(e){}console.log('with auto delete');}"
      );
      expect(result).not.toContain("Object.defineProperty(f, k");
    });

    it.concurrent("默认情况下不应该包含自动删除代码", () => {
      const script = createMockScript();
      const scriptCode = "console.log('without auto delete');";

      const result = compileInjectScript(script, scriptCode);

      expect(result).not.toContain("try{delete window");
      expect(result).toContain("function(){console.log('without auto delete');}");
      expect(result).not.toContain("Object.defineProperty(f, k");
    });

    it("runs the async script body on its context without temporary context properties", async () => {
      const script = createMockScript({ code: "return { context: this, argumentCount: arguments.length };" });
      const mutations: PropertyKey[] = [];
      const context = new Proxy(Object.create(null), {
        get(target, key, receiver) {
          if (key === "$") return {};
          return Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
          mutations.push(key);
          return Reflect.set(target, key, value, receiver);
        },
        deleteProperty(target, key) {
          mutations.push(key);
          return Reflect.deleteProperty(target, key);
        },
      });
      const func = compileScript(compileScriptCode(script), true);

      await expect(func(fnStrIntegrity, context, undefined, script.name)).resolves.toEqual({
        context,
        argumentCount: 0,
      });
      expect(mutations).toEqual([]);
    });

    it.concurrent("生成的注入脚本应在运行时传递上下文和参数，并清理临时挂载", () => {
      const script = createMockScript();
      const targetWindow: GeneratedWindow = {};
      const context = {};
      const named = { value: 42 };

      executeGeneratedScript(
        compileInjectScript(
          script,
          "return { thisValue: this, args: Array.from(arguments), contextKeys: Reflect.ownKeys(this) };"
        ),
        targetWindow
      );

      const generated = targetWindow[script.flag] as ScriptFunc;
      expect(generated(fnStrIntegrity, context, named, script.name, nativeCall)).toEqual({
        thisValue: context,
        args: [named, script.name],
        contextKeys: [],
      });
      expect(Reflect.ownKeys(context)).toEqual([]);
    });

    it.concurrent("生成的注入脚本应拒绝错误的完整性标记", () => {
      const script = createMockScript();
      const targetWindow: GeneratedWindow = {};

      executeGeneratedScript(compileInjectScript(script, "throw new Error('should not run');"), targetWindow);

      const generated = targetWindow[script.flag] as ScriptFunc;
      expect(generated("invalid", {}, {}, "blocked")).toBeUndefined();
    });

    it.concurrent("生成的注入脚本应按选项自动删除挂载函数", () => {
      const script = createMockScript();
      const targetWindow: GeneratedWindow = {};

      executeGeneratedScript(compileInjectScript(script, "return 'ran';", true), targetWindow);

      const generated = targetWindow[script.flag] as ScriptFunc;
      expect(generated(fnStrIntegrity, {}, {}, script.name, nativeCall)).toBe("ran");
      // 属性描述符本身必须消失，而不只是读到 undefined 的值。
      expect(Object.getOwnPropertyDescriptor(targetWindow, script.flag)).toBeUndefined();
      expect(targetWindow[script.flag]).toBeUndefined();
    });

    it.concurrent("生成的注入脚本默认应保留挂载函数", () => {
      const script = createMockScript();
      const targetWindow: GeneratedWindow = {};

      executeGeneratedScript(compileInjectScript(script, "return 'ran';"), targetWindow);

      const generated = targetWindow[script.flag] as ScriptFunc;
      expect(generated(fnStrIntegrity, {}, {}, script.name, nativeCall)).toBe("ran");
      // 未开启自动删除时，挂载函数应可重复读取，不因读取一次而被消费。
      expect(targetWindow[script.flag]).toBe(generated);
    });

    it.concurrent("应该处理复杂的脚本代码", () => {
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

    it.concurrent("应该正确转义脚本标志名称", () => {
      const script = createMockScript({ flag: "flag-with-special-chars_123" });
      const scriptCode = "console.log('test');";

      const result = compileInjectScript(script, scriptCode);

      expect(result).toContain(`'flag-with-special-chars_123'`);
    });
  });

  describe("generated MAIN-world wrapper protocol (compaction)", () => {
    const createMockScript = (overrides: Partial<ScriptRunResource> = {}): ScriptRunResource => ({
      uuid: "compact-wrapper-uuid",
      name: "Compact Wrapper Script",
      namespace: "compact.test",
      type: 1,
      status: 1,
      sort: 0,
      runStatus: "complete",
      createtime: Date.now(),
      checktime: Date.now(),
      code: "",
      value: {},
      flag: "compact-wrapper-flag",
      resource: {},
      metadata: {},
      originalMetadata: {},
      ...overrides,
    });

    // 编译并挂载到一个隔离的 targetWindow，取回真正生成的 wrapper function object。
    const mountGeneratedWrapper = (
      script: ScriptRunResource,
      scriptCode: string,
      autoDeleteMountFunction = false
    ): ScriptFunc => {
      const targetWindow: GeneratedWindow = {};
      executeGeneratedScript(compileInjectScript(script, scriptCode, autoDeleteMountFunction), targetWindow);
      return targetWindow[script.flag] as ScriptFunc;
    };

    // ScriptFunc 的类型签名固定为 4-5 个具名参数，但 metadata 模式和 hostile-input 场景故意只带
    // 少数几个实际参数（正是 wrapper 用 rest 参数吸收的协议）。用 Reflect.apply 调用以测试真实的
    // 运行时协议，而不被编译期签名约束。
    const callGenerated = (fn: ScriptFunc, args: readonly unknown[]): unknown =>
      Reflect.apply(fn as unknown as (...a: unknown[]) => unknown, undefined, args);

    it("wrapper.length === 2：保留具名参数数量，避免未来体积优化悄悄改变可观察的函数行为", () => {
      const generated = mountGeneratedWrapper(createMockScript(), "return 'ran';");
      expect(generated.length).toBe(2);
    });

    it("错误的完整性标记不会执行已编译脚本，返回 undefined", () => {
      const generated = mountGeneratedWrapper(createMockScript(), "throw new Error('must not run');");
      expect(generated("wrong-token", {}, {}, "blocked")).toBeUndefined();
    });

    it("正确标记 + metadata 模式 + 捕获时的 document 应返回存储的 metadata", () => {
      const script = createMockScript({ uuid: "metadata-success-uuid", flag: "metadata-success-flag" });
      const generated = mountGeneratedWrapper(script, "return 'unused';");

      const metadata = callGenerated(generated, [fnStrIntegrity, null, document]);

      expect(metadata).toBe(JSON.stringify({ uuid: script.uuid, flag: script.flag }));
    });

    it("metadata 模式下换一个 document 必须返回 undefined（wrapper 绑定创建时捕获的 document）", () => {
      const generated = mountGeneratedWrapper(createMockScript(), "return 'unused';");
      const otherDocument = new DOMParser().parseFromString("<html></html>", "text/html");

      expect(callGenerated(generated, [fnStrIntegrity, null, otherDocument])).toBeUndefined();
    });

    it("metadata 携带 scriptRevision 时同样换一个 document 必须返回 undefined——revision 相同不能替代 document 校验", () => {
      const generated = mountGeneratedWrapper(
        createMockScript({ scriptRevision: "same-revision-on-both-documents" }),
        "return 'unused';"
      );
      const otherDocument = new DOMParser().parseFromString("<html></html>", "text/html");

      expect(callGenerated(generated, [fnStrIntegrity, null, otherDocument])).toBeUndefined();
    });

    it("正确标记 + metadata 模式：script 带 scriptRevision 时它会出现在返回的 metadata 里", () => {
      const script = createMockScript({
        uuid: "metadata-revision-uuid",
        flag: "metadata-revision-flag",
        scriptRevision: "compiled-revision-abc",
      });
      const generated = mountGeneratedWrapper(script, "return 'unused';");

      const metadata = callGenerated(generated, [fnStrIntegrity, null, document]);

      expect(metadata).toBe(
        JSON.stringify({ uuid: script.uuid, flag: script.flag, scriptRevision: script.scriptRevision })
      );
    });

    it("metadata 模式（无论查找成功或失败）绝不会 fall through 到脚本执行", () => {
      const executed = vi.fn();
      const targetWindow: GeneratedWindow = { __executed: executed };
      executeGeneratedScript(compileInjectScript(createMockScript(), "window.__executed();"), targetWindow);
      const generated = targetWindow["compact-wrapper-flag"] as ScriptFunc;
      const otherDocument = new DOMParser().parseFromString("<html></html>", "text/html");

      callGenerated(generated, [fnStrIntegrity, null, otherDocument]); // 查找失败（document 不匹配）
      callGenerated(generated, [fnStrIntegrity, null, document]); // 查找成功（document 匹配）

      expect(executed).not.toHaveBeenCalled();
    });

    it("execution 模式下无效的受信 call primitive（第五参数）不会执行脚本，返回 undefined", () => {
      const generated = mountGeneratedWrapper(createMockScript(), "throw new Error('must not run');");

      expect(generated(fnStrIntegrity, {}, {}, "name", undefined)).toBeUndefined();
      expect(callGenerated(generated, [fnStrIntegrity, {}, {}, "name", "not-a-function"])).toBeUndefined();
    });

    it("已编译函数若返回另一个函数，该函数必须用同一个受信 call primitive 和同一 context 恰好调用一次", () => {
      // 受信 call primitive 的真实实现（nativeCall）语义等同 Function.prototype.call：
      // 用 thisArg 调用 fn。这里的 mock 复刻该语义，而不是单纯转发参数。
      const calls: Array<{ fn: unknown; thisArg: unknown }> = [];
      const trustedCall = (fn: (...args: unknown[]) => unknown, thisArg: unknown, ...args: unknown[]) => {
        calls.push({ fn, thisArg });
        return fn.apply(thisArg, args);
      };
      const context = { marker: "ctx" };
      const script = createMockScript({ code: "return function(){ return this; };" });
      const generated = mountGeneratedWrapper(script, script.code);

      const result = generated(fnStrIntegrity, context, {}, script.name, trustedCall);

      expect(result).toBe(context);
      // trustedCall 必须被调用两次：一次执行已编译函数，一次调用其返回的函数，两次都用同一 context。
      expect(calls).toHaveLength(2);
      expect(calls[0].thisArg).toBe(context);
      expect(calls[1].thisArg).toBe(context);
    });

    it("Reflect.ownKeys(generatedWrapper) 不会暴露 SC_RANDOM_FNKEY", () => {
      const generated = mountGeneratedWrapper(createMockScript(), "return 'ran';");
      const keys = Reflect.ownKeys(generated).map(String);
      expect(keys.join(",")).not.toContain(fnStrIntegrity!);
      expect(keys).not.toContain("k");
    });

    it("体积回归：生成的 wrapper 原生源码长度必须保持在压缩后的预算内", () => {
      const generated = mountGeneratedWrapper(createMockScript(), "");
      const source = Function.prototype.toString.call(generated);
      expect(source.length).toBeLessThanOrEqual(180);
    });

    it("getCompiledScriptMetadata() 能识别真正挂载的 wrapper 并返回其 metadata", () => {
      const script = createMockScript({ uuid: "gcsm-uuid", flag: "gcsm-flag" });
      const generated = mountGeneratedWrapper(script, "return 'unused';");

      expect(getCompiledScriptMetadata(generated)).toBe(JSON.stringify({ uuid: script.uuid, flag: script.flag }));
    });

    it("getCompiledScriptMetadata() 对非 wrapper 的函数返回 undefined", () => {
      expect(getCompiledScriptMetadata(() => "not a wrapper")).toBeUndefined();
      expect(getCompiledScriptMetadata(undefined)).toBeUndefined();
    });

    it("体积回归：外层生成工厂不应重新引入临时 wrapper 变量等多余脚手架", () => {
      const script = createMockScript({ uuid: "factory-overhead-uuid", flag: "factory-overhead-flag" });
      const mounted = compileInjectScript(script, "");

      expect(mounted).not.toMatch(/const f = /);
      expect(mounted).not.toContain("return f;");
      expect(mounted).toContain("((d,k,m,fn)=>(t,u,...a)=>{");
    });
  });

  describe("compilePreInjectScript", () => {
    it.concurrent("生成的预注入脚本应可执行并发出脚本加载事件", () => {
      const script: ScriptLoadInfo = {
        uuid: "pre-inject-test-uuid",
        name: "Pre Inject Test Script",
        namespace: "pre.inject.test",
        type: 1,
        status: 1,
        sort: 0,
        runStatus: "complete",
        createtime: Date.now(),
        checktime: Date.now(),
        code: "",
        value: {},
        flag: "pre-inject-test-flag",
        resource: {},
        metadata: {},
        originalMetadata: {},
        metadataStr: "",
        userConfigStr: "",
      };
      const targetWindow: GeneratedWindow = {};
      const testPerformance = {
        dispatchEvent: vi.fn(() => false),
        addEventListener: vi.fn(),
      };

      executeGeneratedScript(
        compilePreInjectScript(script, "return { thisValue: this, args: Array.from(arguments) };"),
        targetWindow,
        testPerformance
      );

      const generated = targetWindow[script.flag] as ScriptFunc;
      expect(Reflect.ownKeys(generated)).not.toContain(fnStrIntegrity);
      expect(Reflect.ownKeys(targetWindow)).toEqual([script.flag]);
      const context = {};
      const named = { value: 42 };
      expect(generated(fnStrIntegrity, context, named, script.name, nativeCall)).toEqual({
        thisValue: context,
        args: [named, script.name],
      });
      expect(Reflect.ownKeys(context)).toEqual([]);
      expect(testPerformance.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(testPerformance.addEventListener).not.toHaveBeenCalled();
    });

    it.concurrent("keeps preload state in the wrapper closure while the observable event only exposes the flag", () => {
      const script: ScriptLoadInfo = {
        uuid: "pre-inject-private-uuid",
        name: "Pre Inject Private Script",
        namespace: "pre.inject.private",
        type: 1,
        status: 1,
        sort: 0,
        runStatus: "complete",
        createtime: Date.now(),
        checktime: Date.now(),
        code: "",
        value: { secret: "stored-value" },
        config: { private: { secret: { title: "Private", description: "", index: 0, default: "config" } } },
        userConfig: {
          private: { secret: { title: "Private", description: "", index: 0, default: "user-config" } },
        },
        flag: "pre-inject-private-flag",
        resource: {},
        metadata: {},
        originalMetadata: {},
        metadataStr: "",
        userConfigStr: '{"secret":"user-config"}',
      };
      let detail: Record<string, any> | undefined;
      const testPerformance = {
        dispatchEvent: vi.fn((event: Event) => {
          detail = (event as CustomEvent).detail;
          return false;
        }),
        addEventListener: vi.fn(),
      };
      const targetWindow: GeneratedWindow = {};

      executeGeneratedScript(compilePreInjectScript(script, "return undefined;"), targetWindow, testPerformance);

      const generated = targetWindow[script.flag] as ScriptFunc;
      const metadataJSON = getCompiledScriptMetadata(generated);
      expect(metadataJSON).toBeTypeOf("string");
      const metadata = JSON.parse(metadataJSON!);
      expect(metadata.value).toEqual({ secret: "stored-value" });
      expect(metadata.config).toEqual(script.config);
      expect(metadata.userConfig).toEqual(script.userConfig);
      expect(metadata.userConfigStr).toBe(script.userConfigStr);
      expect(detail).toEqual({ scriptFlag: script.flag });
      expect(JSON.stringify(detail)).not.toContain("stored-value");
      expect(JSON.stringify(detail)).not.toContain("user-config");
    });

    it.concurrent("does not mount a regex-excluded early-start script", () => {
      const script: ScriptLoadInfo = {
        uuid: "pre-inject-excluded-uuid",
        name: "Pre Inject Excluded Script",
        namespace: "pre.inject.excluded",
        type: 1,
        status: 1,
        sort: 0,
        runStatus: "complete",
        createtime: Date.now(),
        checktime: Date.now(),
        code: "",
        value: {},
        flag: "pre-inject-excluded-flag",
        resource: {},
        metadata: {},
        originalMetadata: {},
        metadataStr: "",
        userConfigStr: "",
        scriptUrlPatterns: [
          {
            ruleType: RuleType.REGEX_INCLUDE,
            ruleContent: ["allowed", ""],
            ruleTag: "include",
            patternString: "/allowed/",
          },
        ],
      };
      const targetWindow: GeneratedWindow = {};
      const testPerformance = {
        dispatchEvent: vi.fn(() => false),
        addEventListener: vi.fn(),
      };

      executeGeneratedScript(compilePreInjectScript(script, "return undefined;"), targetWindow, testPerformance);

      expect(targetWindow[script.flag]).toBeUndefined();
      expect(testPerformance.dispatchEvent).not.toHaveBeenCalled();
    });
  });

  describe("addStyle", () => {
    afterEach(() => {
      // 清理 DOM
      document.head.innerHTML = "";
      document.body.innerHTML = "";
      document.documentElement.replaceChildren(document.head, document.body);
    });

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

  describe("addStyleSheet", () => {
    // 简单的 CSSStyleSheet mock，适配 DOM 测试环境
    beforeEach(() => {
      class MockCSSStyleSheet {
        cssText = "";
        replaceSync(css: string) {
          this.cssText = css;
        }
      }
      vi.stubGlobal("CSSStyleSheet", MockCSSStyleSheet);
      //@ts-expect-error
      if (!document.adoptedStyleSheets) document.adoptedStyleSheets = undefined;
      let adoptedSheets = [] as CSSStyleSheet[];
      const getSpy = vi.spyOn(document, "adoptedStyleSheets", "get");
      const setSpy = vi.spyOn(document, "adoptedStyleSheets", "set");

      // FrozenArray
      getSpy.mockImplementation(() => [...adoptedSheets]);
      setSpy.mockImplementation((value: CSSStyleSheet[]) => {
        adoptedSheets = Array.isArray(value) ? [...value] : [];
      });
    });

    afterEach(() => {
      vi.restoreAllMocks(); // Restores spies + stubGlobal
      vi.resetAllMocks(); // Clears call history
    });

    it("应该创建并返回 CSSStyleSheet 实例，并添加到 adoptedStyleSheets", () => {
      const css = "body { background: red; }";

      const sheet = addStyleSheet(css);

      expect(sheet).toBeInstanceOf(CSSStyleSheet);
      expect((sheet as any).cssText).toBe(css);

      const adopted = (document as any).adoptedStyleSheets as CSSStyleSheet[];
      expect(adopted.includes(sheet)).toBe(true);
    });

    it("应该在已有样式表的基础上追加新的样式表", () => {
      const existing = new (CSSStyleSheet as any)();
      (existing as any).replaceSync("html { color: black; }");

      (document as any).adoptedStyleSheets = [existing];

      const css = ".test { color: blue; }";
      const newSheet = addStyleSheet(css);

      const adopted = (document as any).adoptedStyleSheets as CSSStyleSheet[];

      expect(adopted.length).toBe(2);
      expect(adopted[0]).toBe(existing);
      expect(adopted[1]).toBe(newSheet);
      expect((newSheet as any).cssText).toBe(css);
    });

    it("应该处理空的 CSS 字符串", () => {
      const css = "";

      const sheet = addStyleSheet(css);

      expect(sheet).toBeInstanceOf(CSSStyleSheet);
      expect((sheet as any).cssText).toBe("");

      const adopted = (document as any).adoptedStyleSheets as CSSStyleSheet[];
      expect(adopted.includes(sheet)).toBe(true);
    });

    it("应该允许添加多个样式表", () => {
      const css1 = ".class1 { color: red; }";
      const css2 = ".class2 { color: blue; }";

      const sheet1 = addStyleSheet(css1);
      const sheet2 = addStyleSheet(css2);

      const adopted = (document as any).adoptedStyleSheets as CSSStyleSheet[];

      expect(adopted.length).toBe(2);
      expect(adopted[0]).toBe(sheet1);
      expect(adopted[1]).toBe(sheet2);
      expect((sheet1 as any).cssText).toBe(css1);
      expect((sheet2 as any).cssText).toBe(css2);
    });

    it("应该返回刚刚添加到 adoptedStyleSheets 末尾的样式表", () => {
      const css = ".return-test { font-size: 14px; }";

      const returnedSheet = addStyleSheet(css);

      const adopted = (document as any).adoptedStyleSheets as CSSStyleSheet[];
      const lastSheet = adopted[adopted.length - 1];

      expect(returnedSheet).toBe(lastSheet);
      expect((returnedSheet as any).cssText).toBe(css);
    });
  });

  describe.concurrent("isScriptletUnwrap", () => {
    it.concurrent("@unwrap 为空值时返回 true", () => {
      expect(isScriptletUnwrap({ unwrap: [""] })).toBe(true);
    });

    it.concurrent("@unwrap 为 true 时返回 true", () => {
      expect(isScriptletUnwrap({ unwrap: ["true"] })).toBe(true);
    });

    it.concurrent("没有 @unwrap 时返回 false", () => {
      expect(isScriptletUnwrap({})).toBe(false);
    });

    it.concurrent("@unwrap 为 false 时返回 false", () => {
      expect(isScriptletUnwrap({ unwrap: ["false"] })).toBe(false);
    });
  });

  describe.concurrent("compileScriptletCode", () => {
    const createMockScriptRes = (
      overrides: Partial<ScriptRunResource> = {},
      scriptUrlPatterns: URLRuleEntry[] = []
    ): { scriptRes: ScriptRunResource; scriptUrlPatterns: URLRuleEntry[] } => ({
      scriptRes: {
        uuid: "test-uuid",
        name: "Unwrap Script",
        namespace: "test.namespace",
        type: 1,
        status: 1,
        sort: 0,
        runStatus: "complete",
        createtime: Date.now(),
        checktime: Date.now(),
        code: "console.log('unwrap');",
        value: {},
        flag: "test-flag",
        resource: {},
        metadata: { unwrap: [""] },
        originalMetadata: {},
        ...overrides,
      },
      scriptUrlPatterns,
    });

    it.concurrent("应该正确编译基本 unwrap 脚本", () => {
      const patterns: URLRuleEntry[] = [
        {
          ruleType: RuleType.MATCH_INCLUDE,
          ruleContent: ["https", "example.com", "*"],
          ruleTag: "match",
          patternString: "https://example.com/*",
        },
      ];
      const { scriptRes } = createMockScriptRes({}, patterns);

      const result = compileScriptletCode(scriptRes, scriptRes.code, patterns);

      // 包含脚本代码
      expect(result).toContain("console.log('unwrap');");
      // 包含 sourceURL
      expect(result).toContain("sourceURL=");
      expect(chrome.runtime.getURL).toHaveBeenCalledWith("/Unwrap%20Script.user.js");
      // 包含 flag 注册
      expect(result).toContain("window['test-flag']=function(){};");
      // 包含 URL 条件包裹 (if(...){...})
      expect(result).toMatch(/^if\(/);
      // 不包含沙箱封装
      expect(result).not.toContain("with(arguments[0]||this.$)");
      expect(result).not.toContain("return(async function(){");
    });

    it.concurrent("应该包含 require 资源", () => {
      const patterns: URLRuleEntry[] = [
        {
          ruleType: RuleType.MATCH_INCLUDE,
          ruleContent: ["*", "example.com", "*"],
          ruleTag: "match",
          patternString: "*://example.com/*",
        },
      ];
      const { scriptRes } = createMockScriptRes(
        {
          metadata: {
            unwrap: [""],
            require: ["https://cdn.example.com/lib.js"],
          },
          resource: {
            "https://cdn.example.com/lib.js": {
              url: "https://cdn.example.com/lib.js",
              content: "var libLoaded = true;",
              base64: "",
              hash: { md5: "t", sha1: "t", sha256: "t", sha384: "t", sha512: "t" },
              type: "require",
              link: {},
              contentType: "text/javascript",
              createtime: Date.now(),
            },
          },
        },
        patterns
      );

      const result = compileScriptletCode(scriptRes, scriptRes.code, patterns);

      expect(result).toContain("var libLoaded = true;");
      expect(result).toContain("console.log('unwrap');");
    });

    it.concurrent("应该包含 URL 条件检查代码", () => {
      const patterns: URLRuleEntry[] = [
        {
          ruleType: RuleType.MATCH_INCLUDE,
          ruleContent: ["https", "example.com", "*"],
          ruleTag: "match",
          patternString: "https://example.com/*",
        },
        {
          ruleType: RuleType.MATCH_EXCLUDE,
          ruleContent: ["https", "example.com", "admin/*"],
          ruleTag: "match",
          patternString: "https://example.com/admin/*",
        },
      ];
      const { scriptRes } = createMockScriptRes({}, patterns);

      const result = compileScriptletCode(scriptRes, scriptRes.code, patterns);

      // 生成的代码应包含 embeddedPatternChecker 调用
      expect(result).toContain("location.href");
      // if 条件包裹
      expect(result).toMatch(/^if\(/);
    });
  });
});

describe("getEffectiveScriptGrants (P1-2)", () => {
  it("Case A: context-menu + grant none gains GM_registerMenuCommand and drops none", () => {
    const metadata = { grant: ["none"], "run-at": ["context-menu"] } as unknown as SCMetadata;

    const effective = getEffectiveScriptGrants(metadata);

    expect(effective).toContain("GM_registerMenuCommand");
    expect(effective).not.toContain("none");
  });

  it("Case B: a normal (non context-menu) grant none script stays capability-less", () => {
    const metadata = { grant: ["none"], "run-at": ["document-end"] } as unknown as SCMetadata;

    const effective = getEffectiveScriptGrants(metadata);

    expect(effective).toEqual(["none"]);
    expect(getPageRpcAllowedAPIs(effective)).toEqual([]);
  });

  it("Case C: context-menu with an existing privileged grant keeps both grants", () => {
    const metadata = { grant: ["GM_setValue"], "run-at": ["context-menu"] } as unknown as SCMetadata;

    const effective = getEffectiveScriptGrants(metadata);

    expect(effective).toContain("GM_setValue");
    expect(effective).toContain("GM_registerMenuCommand");
  });

  it("Case D: context-menu + grant none allows only the menu command, no privilege escalation", () => {
    const metadata = { grant: ["none"], "run-at": ["context-menu"] } as unknown as SCMetadata;

    const allowedAPIs = getPageRpcAllowedAPIs(getEffectiveScriptGrants(metadata));

    expect(allowedAPIs).toContain("GM_registerMenuCommand");
    expect(allowedAPIs).not.toContain("GM_setValue");
    expect(allowedAPIs).not.toContain("GM_xmlhttpRequest");
    expect(allowedAPIs.some((api) => api.startsWith("CAT_"))).toBe(false);
  });
});
