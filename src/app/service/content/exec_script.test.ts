import ExecScript from "./exec_script";
import { compileScript, compileScriptCode } from "./utils";
import { ExtVersion } from "@App/app/const";
import { describe, expect, it, vi } from "vitest";
import type { GMInfoEnv, ScriptFunc } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";

const nilFn: ScriptFunc = () => {};

const scriptRes = {
  id: 0,
  name: "test",
  metadata: {
    grant: ["none"],
    version: ["1.0.0"],
  },
  code: "console.log('test')",
  sourceCode: "sourceCode",
  value: {},
} as unknown as ScriptLoadInfo;
const envInfo: GMInfoEnv = {
  sandboxMode: "raw",
  userAgentData: {
    brands: [],
    mobile: false,
    platform: "",
  },
  isIncognito: false,
};

// @ts-ignore
const noneExec = new ExecScript(scriptRes, undefined, undefined, nilFn, envInfo);

const scriptRes2 = {
  id: 0,
  name: "test",
  metadata: {
    version: ["1.0.0"],
  },
  code: "console.log('test')",
  sourceCode: "sourceCode",
  value: {},
} as unknown as ScriptLoadInfo;

// @ts-ignore
const sandboxExec = new ExecScript(scriptRes2, undefined, undefined, nilFn, envInfo);

describe.concurrent("GM_info", () => {
  it.concurrent("none", async () => {
    expect(noneExec.sandboxContext).toBeUndefined();
    expect(noneExec.named).not.toBeUndefined();
    scriptRes.code = "return {_this:this,GM_info};";
    noneExec.scriptFunc = compileScript(compileScriptCode(scriptRes));
    const ret = await noneExec.exec();
    expect(ret.GM_info.version).toEqual(ExtVersion);
    expect(ret.GM_info.script.version).toEqual("1.0.0");
    expect(ret._this).toEqual(global);
  });
  it.concurrent("sandbox", async () => {
    expect(sandboxExec.sandboxContext).not.toBeUndefined();
    expect(sandboxExec.named).toBeUndefined();
    scriptRes2.code = "return {_this:this,GM_info};";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret.GM_info.version).toEqual(ExtVersion);
    expect(ret.GM_info.script.version).toEqual("1.0.0");
    expect(ret._this).not.toEqual(global);
  });
});

describe.concurrent("unsafeWindow", () => {
  it.concurrent("unsafeWindow available", async () => {
    const ret0 = sandboxExec.sandboxContext?.unsafeWindow === global;
    expect(ret0).toEqual(true);
    scriptRes2.code = `return unsafeWindow`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual(global);
    scriptRes2.code = `return window`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret3 = await sandboxExec.exec();
    expect(ret3).not.toEqual(global);
  });

  it.concurrent("sandbox", async () => {
    const ret0 = sandboxExec.sandboxContext?.unsafeWindow === global;
    expect(ret0).toEqual(true);
    // @ts-ignore
    global.testUnsafeWindow = "ok";
    scriptRes2.code = `return unsafeWindow.testUnsafeWindow`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("ok");
    scriptRes2.code = "return window.testUnsafeWindow";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret2 = await sandboxExec.exec();
    expect(ret2).toEqual(undefined);
  });

  it.concurrent("sandbox NodeFilter", async () => {
    const nodeFilter = global.NodeFilter;
    expect(nodeFilter).toEqual(expect.any(Function));
    scriptRes2.code = `return unsafeWindow.NodeFilter`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual(nodeFilter);
    scriptRes2.code = "return window.NodeFilter";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret2 = await sandboxExec.exec();
    expect(ret2).toEqual(nodeFilter);
  });
});

describe.concurrent("sandbox", () => {
  it.concurrent("global", async () => {
    scriptRes2.code = "window.testObj = 'ok';return window.testObj";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    let ret = await sandboxExec.exec();
    expect(ret).toEqual("ok");
    scriptRes2.code = "window.testObj = 'ok2';return testObj";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    ret = await sandboxExec.exec();
    expect(ret).toEqual("ok2");
  });
  it.concurrent("this", async () => {
    scriptRes2.code = "this.testObj='ok2';return testObj;";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("ok2");
  });
  it.concurrent("this2", async () => {
    scriptRes2.code = `
    !function(t, e) {
      "object" == typeof exports ? module.exports = exports = e() : "function" == typeof define && define.amd ? define([], e) : t.CryptoJS = e()
  } (this, function () {
      return { test: "ok3" }
  });
  return CryptoJS.test;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("ok3");
  });

  // 沉浸式翻译, 常量值被改变
  it.concurrent("NodeFilter #214", async () => {
    scriptRes2.code = `return NodeFilter.FILTER_REJECT;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual(2);
  });

  // RegExp.$x 内容被覆盖 https://github.com/scriptscat/scriptcat/issues/293
  it.concurrent("RegExp", async () => {
    scriptRes2.code = `let ok = /12(3)/.test('123');return RegExp.$1;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("3");
  });
});

describe.concurrent("this", () => {
  it("onload", async () => {
    // null确认
    global.onload = null;
    expect(global.onload).toBeNull();
    // onload 改变，global.onload不改变
    scriptRes2.code = `onload = ()=>{};return onload;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual(expect.any(Function));
    // global.onload
    expect(global.onload).toBeNull();
  });
  it("this.onload", async () => {
    // null确认
    global.onload = null;
    expect(global.onload).toBeNull();
    // this.onload 改变，global.onload不改变
    scriptRes2.code = `this.onload = () => "ok"; return this.onload;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual(expect.any(Function));
    // global.onload
    expect(global.onload).toBeNull();
  });
  it.concurrent("undefined variable", async () => {
    scriptRes2.code = `return typeof testVar;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("undefined");
  });
  it.concurrent("undefined variable in global", async () => {
    scriptRes2.code = `return testVar;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    // 在沙盒中访问未定义的变量会抛出错误
    try {
      await sandboxExec.exec();
      // 如果没有抛出错误，测试应该失败
      expect.fail("Expected an error to be thrown when accessing undefined variable");
    } catch (e: any) {
      expect(e.message).toContain("testVar is not defined");
    }
  });
});

describe("none this", () => {
  it("onload", async () => {
    scriptRes2.code = `onload = ()=>{};return onload;`;
    noneExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await noneExec.exec();
    expect(ret).toEqual(expect.any(Function));
    // global.onload
    expect(global.onload).toEqual(expect.any(Function));
    global.onload = null; // 清理全局变量
  });
  it.concurrent("this.test", async () => {
    scriptRes2.code = `this.test = "ok";return this.test;`;
    noneExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await noneExec.exec();
    expect(ret).toEqual("ok");
  });
});

describe("沙盒环境测试", async () => {
  //@ts-ignore
  global.gbok = "gbok";
  Object.assign(global, { gbok2: "gbok2" });
  //@ts-ignore
  global.gbok3 = function gbok3() {};
  Object.assign(global, { gbok4: function gbok4() {} });
  //@ts-ignore
  global.gbok5 = { test: "gbok5" };
  Object.assign(global, { gbok6: { test: "gbok6" } });

  const _global = <any>global;

  scriptRes2.code = `return [this, window];`;
  sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
  const [_win, _this] = await sandboxExec.exec();
  expect(_win).toEqual(expect.any(Object));
  expect(_win.setTimeout).toEqual(expect.any(Function));

  describe.concurrent("测试全局变量访问性", () => {
    it.concurrent("global gbok", () => {
      expect(_global["gbok"]).toEqual("gbok");
      expect(_global["gbok2"]).toEqual("gbok2");
      expect(_global["gbok3"]?.name).toEqual("gbok3");
      expect(_global["gbok4"]?.name).toEqual("gbok4");
      expect(_global["gbok5"]?.test).toEqual("gbok5");
      expect(_global["gbok6"]?.test).toEqual("gbok6");
      // 这是后来新加入的值，沙盒中应该是无法访问的
      expect(_this["gbok"]).toEqual(undefined);
    });
    it.concurrent("global sandboxTestValue", () => {
      expect(_global["sandboxTestValue"]).toEqual("sandboxTestValue");
      // 这是初始的值，沙盒中应该是可以访问的
      expect(_this["sandboxTestValue"]).toEqual("sandboxTestValue");
      // 删除不应该穿透到全局
      delete _this["sandboxTestValue"];
      expect(_this["sandboxTestValue"]).toBeUndefined();
      expect(_global["sandboxTestValue"]).toEqual("sandboxTestValue");
      // 全局删除同理
      delete _global["sandboxTestValue2"];
      expect(_this["sandboxTestValue2"]).toEqual("sandboxTestValue2");
      expect(_global["sandboxTestValue2"]).toBeUndefined();
    });
  });

  it.concurrent("set contenxt", () => {
    _this["test_md5"] = "ok";
    expect(_this["test_md5"]).toEqual("ok");
    expect(_global["test_md5"]).toEqual(undefined);
  });

  describe.concurrent("set window.onload null", () => {
    it.concurrent("初始状态确认", () => {
      // null确认
      _this["onload"] = null;
      _global["onload"] = null;
      expect(_this["onload"]).toBeNull();
      expect(_global["onload"]).toBeNull();
    });

    describe.concurrent("沙盒环境 onload 设置", () => {
      it.concurrent("设置 _this.onload 不影响 global.onload", () => {
        const mockFn = vi.fn();
        _this["onload"] = function thisOnLoad() {
          mockFn();
        };
        expect(_this["onload"]?.name).toEqual("thisOnLoad");
        expect(_global["onload"]).toBeNull();
      });

      it.concurrent("验证 onload 事件调用", () => {
        const mockFn = vi.fn();
        _this["onload"] = function thisOnLoad() {
          mockFn();
        };
        // 验证调用
        global.dispatchEvent(new Event("load"));
        expect(mockFn).toHaveBeenCalledTimes(1);
      });

      // 在模拟环境无法测试：在实际操作中和TM一致
      // 在非拦截式沙盒裡删除 沙盒onload 后，会取得页面的真onload
      // 在非拦截式沙盒裡删除 真onload 后，会变undefined
      // it.concurrent("删除 onload 后应该为 null", () => {
      //   const mockFn = vi.fn();
      //   _this["onload"] = function thisOnLoad() {
      //     mockFn();
      //   };
      //   // 验证删除
      //   delete _this["onload"];
      //   expect(_this["onload"]).toBeNull(); // 删除应该是null，而不是undefined

      //   // 验证删除后调用
      //   global.dispatchEvent(new Event("load"));
      //   expect(mockFn).not.toHaveBeenCalled(); // 删除后不应该再调用
      // });
    });

    describe("全局环境 onload 设置", () => {
      it("设置 global.onload 不影响 _this.onload", () => {
        _this["onload"] = null;
        _global["onload"] = function globalOnLoad() {};
        expect(_this["onload"]).toBeNull();
        expect(_global["onload"]?.name).toEqual("globalOnLoad");
      });

      it("清理后状态确认", () => {
        _global["onload"] = null;
        // 还原确认
        expect(_this["onload"]).toEqual(null);
        expect(_global["onload"]).toEqual(null);
      });
    });
  });

  it("update", () => {
    _this["okk"] = "ok";
    expect(_this["okk"]).toEqual("ok");
    expect(_global["okk"]).toEqual(undefined);
    _this["okk"] = "ok2";
    expect(_this["okk"]).toEqual("ok2");
    expect(_global["okk"]).toEqual(undefined);
  });

  // https://github.com/scriptscat/scriptcat/issues/273
  it.concurrent("禁止穿透global对象", () => {
    expect(_this["gbok"]).toBeUndefined();
    expect(_this["gbok2"]).toBeUndefined();
    expect(_this["gbok3"]).toBeUndefined();
    expect(_this["gbok4"]).toBeUndefined();
    expect(_this["gbok5"]).toBeUndefined();
    expect(_this["gbok6"]).toBeUndefined();
  });

  it.concurrent("禁止修改window", () => {
    // expect(() => (_this["window"] = "ok")).toThrow();
    expect(() => {
      const before = _this["window"];
      _this["window"] = "ok";
      if (before !== _this["window"]) throw new Error("err");
    }).toThrow();
  });

  it.concurrent("访问location", () => {
    expect(_this.location).not.toBeUndefined();
  });

  // 只允许访问onxxxxx
  it.concurrent("window.onxxxxx", () => {
    expect(_this.onanimationstart).toBeNull();
  });

  it.concurrent("[兼容问题] Ensure Illegal invocation can be tested", () => {
    expect(global.setTimeout.name).toEqual("setTimeout");
    //@ts-ignore
    expect(global.setTimeoutForTest.name).toEqual("setTimeoutForTest");
    expect(_this.setTimeoutForTest.name).toEqual("bound setTimeoutForTest");
    //@ts-ignore
    expect(() => global.setTimeout.call(global, () => {}, 1)).not.toThrow();
    //@ts-ignore
    expect(() => global.setTimeoutForTest.call(global, () => {}, 1)).not.toThrow();
    //@ts-ignore
    expect(() => global.setTimeoutForTest.call({}, () => {}, 1)).toThrow();
  });
  // https://github.com/xcanwin/KeepChatGPT 环境隔离得不够干净导致的
  it.concurrent("[兼容问题] Uncaught TypeError: Illegal invocation #189", () => {
    return new Promise((resolve) => {
      console.log(_this.setTimeoutForTest.prototype);
      _this.setTimeoutForTest(resolve, 100);
    });
  });
  // AC-baidu-重定向优化百度搜狗谷歌必应搜索_favicon_双列
  it.concurrent("[兼容问题] TypeError: Object.freeze is not a function #116", () => {
    expect(() => _this.Object.freeze({})).not.toThrow();
  });

  const tag = (<any>global)[Symbol.toStringTag]; // 实际环境：'[object Window]' 测试环境：'[object global]'

  // 允许往global写入Symbol属性,影响内容: https://bbs.tampermonkey.net.cn/thread-5509-1-1.html
  it.concurrent("Symbol", () => {
    const s = Symbol("test");
    _this[s] = "ok";
    expect(_this[s]).toEqual("ok");
  });
  // toString.call(window)返回的是'[object Object]',影响内容: https://github.com/scriptscat/scriptcat/issues/260
  it.concurrent("toString.call(window)", () => {
    expect(toString.call(_this)).toEqual(`[object Window]`);
  });

  // 与TM保持一致，toString返回global([object Window]) #737
  it.concurrent("toString", async () => {
    scriptRes2.code = `return {
      toStringThis: {}.toString.call(this),
      toStringWindow: {}.toString.call(window),
      toString: toString(),
    }`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual({
      toStringThis: `[object Window]`,
      toStringWindow: `[object Window]`,
      toString: `[object ${tag}]`,
    });
  });

  // Object.hasOwnProperty穿透 https://github.com/scriptscat/scriptcat/issues/272
  it.concurrent("[穿透测试] Object.hasOwnProperty", () => {
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(false);
    _this.test1 = "ok";
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(true);
    expect(Object.prototype.hasOwnProperty.call(_this, "test")).toEqual(false);
  });

  it.concurrent("特殊关键字不能穿透沙盒", async () => {
    expect(_global["define"]).toEqual("特殊关键字不能穿透沙盒");
    expect(_this["define"]).toBeUndefined();
    _this["define"] = "ok";
    expect(_this["define"]).toEqual("ok");
    expect(_global["define"]).toEqual("特殊关键字不能穿透沙盒");
  });

  it.concurrent("RegExp", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    script.code = `const str = "12345";
const reg = /(123)/;
str.match(reg);`;
    exec.scriptFunc = compileScript(compileScriptCode(script));
    await exec.exec();
    expect(RegExp.$1).toEqual("123");
  });
  it.concurrent("沙盒之间不应该共享变量", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.code = `this.testVar = "ok"; ttest1 = "ok"; return {testVar: this.testVar, testVar2: this.testVar2, ttest1: typeof ttest1, ttest2: typeof ttest2};`;
    // @ts-ignore
    const exec1 = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec1.scriptFunc = compileScript(compileScriptCode(script));
    const ret1 = await exec1.exec();
    expect(ret1).toEqual({ testVar: "ok", testVar2: undefined, ttest1: "string", ttest2: "number" });

    const script2 = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script2.code = `this.testVar2 = "ok"; ttest2 = "ok"; return {testVar: this.testVar, testVar2: this.testVar2, ttest1: typeof ttest1, ttest2: typeof ttest2};`;
    // @ts-ignore
    const exec2 = new ExecScript(script2, undefined, undefined, nilFn, envInfo);
    exec2.scriptFunc = compileScript(compileScriptCode(script2));
    const ret2 = await exec2.exec();
    expect(ret2).toEqual({ testVar: undefined, testVar2: "ok", ttest1: "number", ttest2: "string" });

    const script3 = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script3.code = `onload = function (){return 123}; return {onload, thisOnload: this.onload, winOnload: window.onload};`;
    // @ts-ignore
    const exec3 = new ExecScript(script3, undefined, undefined, nilFn, envInfo);
    exec3.scriptFunc = compileScript(compileScriptCode(script3));
    const ret3 = await exec3.exec();
    expect(ret3.onload).toEqual(expect.any(Function));
    expect(ret3.thisOnload).toEqual(expect.any(Function));
    expect(ret3.winOnload).toEqual(expect.any(Function));
    expect(ret3.thisOnload).toEqual(ret3.onload);
    expect(ret3.winOnload).toEqual(ret3.onload);
    const cacheRet3Onload = ret3.onload;

    const script4 = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script4.code = `onload = function (){return 456}; return {onload, thisOnload: this.onload, winOnload: window.onload};`;
    // @ts-ignore
    const exec4 = new ExecScript(script4, undefined, undefined, nilFn, envInfo);
    exec4.scriptFunc = compileScript(compileScriptCode(script4));
    const ret4 = await exec4.exec();
    expect(ret4.onload).toEqual(expect.any(Function));
    expect(ret4.thisOnload).toEqual(expect.any(Function));
    expect(ret4.winOnload).toEqual(expect.any(Function));
    expect(ret4.thisOnload).toEqual(ret4.onload);
    expect(ret4.winOnload).toEqual(ret4.onload);

    // onload3 不等如 onload4
    expect(ret4.onload).not.toEqual(cacheRet3Onload);
    // onload3, onload4 能各自独立执行输出 123 及 456
    expect(cacheRet3Onload() + ret4.onload()).toEqual(579);
  });

  it.concurrent("沙盒之间能用unsafeWindow（及全局作用域）共享变量", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.code = `unsafeWindow.testSVar1 = "shareA"; ggaa1 = "ok"; return {testSVar1: unsafeWindow.testSVar1, testSVar2: unsafeWindow.testSVar2, ggaa1: typeof ggaa1, ggaa2: typeof ggaa2};`;
    // @ts-ignore
    const exec1 = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec1.scriptFunc = compileScript(compileScriptCode(script));
    const ret1 = await exec1.exec();
    expect(ret1).toEqual({ testSVar1: "shareA", testSVar2: undefined, ggaa1: "string", ggaa2: "undefined" });

    const script2 = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script2.code = `unsafeWindow.testSVar2 = "shareB"; ggaa2 = "ok"; return {testSVar1: unsafeWindow.testSVar1, testSVar2: unsafeWindow.testSVar2, ggaa1: typeof ggaa1, ggaa2: typeof ggaa2};`;
    // @ts-ignore
    const exec2 = new ExecScript(script2, undefined, undefined, nilFn, envInfo);
    exec2.scriptFunc = compileScript(compileScriptCode(script2));
    const ret2 = await exec2.exec();
    expect(ret2).toEqual({ testSVar1: "shareA", testSVar2: "shareB", ggaa1: "string", ggaa2: "string" });
  });

  it.concurrent("测试SC沙盒与TM沙盒有相近的特殊处理", async () => {
    const script1 = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script1.code = `onfocus = function(){}; onresize = 123; onblur = "123"; const ret = {onfocus, onresize, onblur}; onfocus = null; onresize = null; onblur = null; return ret;`;
    // @ts-ignore
    const exec1 = new ExecScript(script1, undefined, undefined, nilFn, envInfo);
    exec1.scriptFunc = compileScript(compileScriptCode(script1));
    const ret1 = await exec1.exec();
    expect(ret1.onfocus).toEqual(expect.any(Function));
    expect(ret1.onresize).toBeNull();
    expect(ret1.onblur).toBeNull();

    const script2 = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script2.code = `window.onfocus = function(){}; window.onresize = 123; window.onblur = "123"; const {onfocus, onresize, onblur} = window; const ret = {onfocus, onresize, onblur}; window.onfocus = null; window.onresize = null; window.onblur = null; return ret;`;
    // @ts-ignore
    const exec2 = new ExecScript(script2, undefined, undefined, nilFn, envInfo);
    exec2.scriptFunc = compileScript(compileScriptCode(script2));
    const ret2 = await exec2.exec();
    expect(ret2.onfocus).toEqual(expect.any(Function));
    expect(ret2.onresize).toBeNull();
    expect(ret2.onblur).toBeNull();
  });
});
