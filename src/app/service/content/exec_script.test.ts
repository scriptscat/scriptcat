import ExecScript from "./exec_script";
import { compileScript, compileScriptCode } from "./utils";
import { ExtVersion } from "@App/app/const";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GMInfoEnv, ScriptFunc } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { Message } from "@Packages/message/types";

const nilFn: ScriptFunc = () => {};

const envInfo: GMInfoEnv = {
  sandboxMode: "raw",
  userAgentData: {
    brands: [],
    mobile: false,
    platform: "",
  },
  isIncognito: false,
};

function makeScript(overrides: Partial<ScriptLoadInfo> = {}): ScriptLoadInfo {
  return {
    id: 0,
    name: "test",
    metadata: { version: ["1.0.0"] },
    code: "",
    sourceCode: "sourceCode",
    value: {},
    ...overrides,
  } as unknown as ScriptLoadInfo;
}

function setExecCode(exec: ExecScript, script: ScriptLoadInfo, code: string): void {
  script.code = code;
  exec.scriptFunc = compileScript(compileScriptCode(script));
}

function makeExec(code: string, grant?: string[]): { exec: ExecScript; script: ScriptLoadInfo } {
  const script = makeScript({ code, metadata: { grant, version: ["1.0.0"] } });
  const message = {} as Message;
  const exec = new ExecScript(script, {
    envPrefix: "scripting",
    message,
    contentMsg: message,
    code: nilFn,
    envInfo,
  });
  setExecCode(exec, script, code);
  return { exec, script };
}

describe.concurrent("GM_info", () => {
  it.concurrent("none", async () => {
    const { exec } = makeExec("return {_this:this,GM_info};", ["none"]);
    expect(exec.sandboxContext).toBeUndefined();
    expect(exec.named).not.toBeUndefined();
    const ret = await exec.exec();
    expect(ret.GM_info.version).toEqual(ExtVersion);
    expect(ret.GM_info.script.version).toEqual("1.0.0");
    expect(ret._this).toEqual(global);
  });
  it.concurrent("sandbox", async () => {
    const { exec } = makeExec("return {_this:this,GM_info};");
    expect(exec.sandboxContext).not.toBeUndefined();
    expect(exec.named).toBeUndefined();
    const ret = await exec.exec();
    expect(ret.GM_info.version).toEqual(ExtVersion);
    expect(ret.GM_info.script.version).toEqual("1.0.0");
    expect(ret._this).not.toEqual(global);
  });
});

describe.concurrent("unsafeWindow", () => {
  it.concurrent("unsafeWindow available", async () => {
    const { exec, script } = makeExec("return unsafeWindow");
    const ret0 = exec.sandboxContext?.unsafeWindow === global;
    expect(ret0).toEqual(true);
    const ret = await exec.exec();
    expect(ret).toEqual(global);
    setExecCode(exec, script, "return window");
    const ret3 = await exec.exec();
    expect(ret3).not.toEqual(global);
  });

  it.concurrent("sandbox", async () => {
    const { exec, script } = makeExec("return unsafeWindow.testUnsafeWindow");
    const ret0 = exec.sandboxContext?.unsafeWindow === global;
    expect(ret0).toEqual(true);
    const testGlobal = global as typeof global & { testUnsafeWindow?: string };
    testGlobal.testUnsafeWindow = "ok";
    try {
      const ret = await exec.exec();
      expect(ret).toEqual("ok");
      setExecCode(exec, script, "return window.testUnsafeWindow");
      const ret2 = await exec.exec();
      expect(ret2).toEqual(undefined);
    } finally {
      delete testGlobal.testUnsafeWindow;
    }
  });

  it.concurrent("sandbox NodeFilter", async () => {
    const { exec, script } = makeExec("return unsafeWindow.NodeFilter");
    const nodeFilter = global.NodeFilter;
    expect(nodeFilter.FILTER_REJECT).toEqual(2);
    const ret = await exec.exec();
    expect(ret).toEqual(nodeFilter);
    setExecCode(exec, script, "return window.NodeFilter");
    const ret2 = await exec.exec();
    expect(ret2).toEqual(nodeFilter);
  });
});

describe.concurrent("sandbox", () => {
  it.concurrent("global", async () => {
    const { exec, script } = makeExec("window.testObj = 'ok';return window.testObj");
    let ret = await exec.exec();
    expect(ret).toEqual("ok");
    setExecCode(exec, script, "window.testObj = 'ok2';return testObj");
    ret = await exec.exec();
    expect(ret).toEqual("ok2");
  });
  it.concurrent("this", async () => {
    const { exec } = makeExec("this.testObj='ok2';return testObj;");
    const ret = await exec.exec();
    expect(ret).toEqual("ok2");
  });
  it.concurrent("this2", async () => {
    const { exec } = makeExec(`
    !function(t, e) {
      "object" == typeof exports ? module.exports = exports = e() : "function" == typeof define && define.amd ? define([], e) : t.CryptoJS = e()
  } (this, function () {
      return { test: "ok3" }
  });
  return CryptoJS.test;`);
    const ret = await exec.exec();
    expect(ret).toEqual("ok3");
  });

  // 沉浸式翻译, 常量值被改变
  it.concurrent("NodeFilter #214", async () => {
    const { exec } = makeExec("return NodeFilter.FILTER_REJECT;");
    const ret = await exec.exec();
    expect(ret).toEqual(2);
  });

  // RegExp.$x 内容被覆盖 https://github.com/scriptscat/scriptcat/issues/293
  it.concurrent("RegExp", async () => {
    const { exec } = makeExec("let ok = /12(3)/.test('123');return RegExp.$1;");
    const ret = await exec.exec();
    expect(ret).toEqual("3");
  });
});

describe("this", () => {
  it("onload", async () => {
    const { exec } = makeExec("onload = ()=>{};return onload;");
    // null确认
    global.onload = null;
    expect(global.onload).toBeNull();
    // onload 改变，global.onload不改变
    const ret = await exec.exec();
    expect(ret).toEqual(expect.any(Function));
    // global.onload
    expect(global.onload).toBeNull();
  });
  it("this.onload", async () => {
    const { exec } = makeExec('this.onload = () => "ok"; return this.onload;');
    // null确认
    global.onload = null;
    expect(global.onload).toBeNull();
    // this.onload 改变，global.onload不改变
    const ret = await exec.exec();
    expect(ret).toEqual(expect.any(Function));
    // global.onload
    expect(global.onload).toBeNull();
  });
  it.concurrent("undefined variable", async () => {
    const { exec } = makeExec("return typeof testVar;");
    const ret = await exec.exec();
    expect(ret).toEqual("undefined");
  });
  it.concurrent("undefined variable in global", async () => {
    const { exec } = makeExec("return testVar;");
    // 在沙盒中访问未定义的变量会抛出错误
    await expect(exec.exec()).rejects.toThrow("testVar is not defined");
  });
});

describe("none this", () => {
  it("onload", async () => {
    const { exec } = makeExec("onload = ()=>{};return onload;", ["none"]);
    const ret = await exec.exec();
    expect(ret).toEqual(expect.any(Function));
    // global.onload
    expect(global.onload).toEqual(expect.any(Function));
    global.onload = null; // 清理全局变量
  });
  it.concurrent("this.test", async () => {
    const { exec } = makeExec('this.test = "ok";return this.test;', ["none"]);
    const ret = await exec.exec();
    expect(ret).toEqual("ok");
    delete (global as typeof global & { test?: string }).test;
  });
});

describe("沙盒环境测试", () => {
  const _global = global as typeof global & Record<string, any>;
  let _win: Record<string, any>;
  let _this: Record<PropertyKey, any>;

  beforeAll(async () => {
    const { exec } = makeExec("return [window, this];");
    Object.assign(global, {
      gbok: "gbok",
      gbok2: "gbok2",
      gbok3: function gbok3() {},
      gbok4: function gbok4() {},
      gbok5: { test: "gbok5" },
      gbok6: { test: "gbok6" },
    });
    [_win, _this] = await exec.exec();
    expect(_win).toEqual(expect.any(Object));
    expect(_win.setTimeout).toEqual(expect.any(Function));
  });

  afterAll(() => {
    for (const key of ["gbok", "gbok2", "gbok3", "gbok4", "gbok5", "gbok6", "testSVar1", "testSVar2"]) {
      delete _global[key];
    }
  });

  describe("测试全局变量访问性", () => {
    it("global gbok", () => {
      expect(_global["gbok"]).toEqual("gbok");
      expect(_global["gbok2"]).toEqual("gbok2");
      expect(_global["gbok3"]?.name).toEqual("gbok3");
      expect(_global["gbok4"]?.name).toEqual("gbok4");
      expect(_global["gbok5"]?.test).toEqual("gbok5");
      expect(_global["gbok6"]?.test).toEqual("gbok6");
      // 这是后来新加入的值，沙盒中应该是无法访问的
      expect(_this["gbok"]).toEqual(undefined);
    });
    it("global sandboxTestValue", () => {
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

  it("设置沙盒上下文", () => {
    _this["test_md5"] = "ok";
    expect(_this["test_md5"]).toEqual("ok");
    expect(_global["test_md5"]).toEqual(undefined);
  });

  describe("set window.onload null", () => {
    it("初始状态确认", () => {
      // null确认
      _this["onload"] = null;
      _global["onload"] = null;
      expect(_this["onload"]).toBeNull();
      expect(_global["onload"]).toBeNull();
    });

    describe("沙盒环境 onload 设置", () => {
      it("设置 _this.onload 不影响 global.onload", () => {
        const mockFn = vi.fn();
        _this["onload"] = function thisOnLoad() {
          mockFn();
        };
        expect(_this["onload"]?.name).toEqual("thisOnLoad");
        expect(_global["onload"]).toBeNull();
      });

      // 在模拟环境无法测试：在模拟环境模拟 dispatchEvent 呼叫 this.onload 没有意义
      // it("验证 onload 事件调用", () => {
      //   const mockFn = vi.fn();
      //   _this["onload"] = function thisOnLoad() {
      //     mockFn();
      //   };
      //   // 验证调用
      //   global.dispatchEvent(new Event("load"));
      //   expect(mockFn).toHaveBeenCalledTimes(1);
      // });

      // 在模拟环境无法测试：在实际操作中和TM一致
      // 在非拦截式沙盒里删除 沙盒onload 后，会取得页面的真onload
      // 在非拦截式沙盒里删除 真onload 后，会变undefined
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
  it("禁止穿透global对象", () => {
    expect(_this["gbok"]).toBeUndefined();
    expect(_this["gbok2"]).toBeUndefined();
    expect(_this["gbok3"]).toBeUndefined();
    expect(_this["gbok4"]).toBeUndefined();
    expect(_this["gbok5"]).toBeUndefined();
    expect(_this["gbok6"]).toBeUndefined();
  });

  it("禁止修改window", () => {
    // expect(() => (_this["window"] = "ok")).toThrow();
    expect(() => {
      const before = _this["window"];
      _this["window"] = "ok";
      if (before !== _this["window"]) throw new Error("err");
    }).toThrow();
  });

  it("访问location", () => {
    expect(_this.location).not.toBeUndefined();
  });

  // 只允许访问onxxxxx
  it("window.onxxxxx", () => {
    expect(_this.onanimationstart).toBeNull();
  });

  it("[兼容问题] Ensure Illegal invocation can be tested", () => {
    expect(global.setTimeout.name).toEqual("setTimeout");
    // -----
    //@ts-ignore
    expect(global.setTimeoutForTest1.name).toEqual("setTimeoutForTest1");
    expect(_this.setTimeoutForTest1.name).toEqual("bound setTimeoutForTest1");
    //@ts-ignore
    expect(() => global.setTimeout.call(global, () => {}, 1)).not.toThrow();
    //@ts-ignore
    expect(() => global.setTimeoutForTest1.call(global, () => {}, 1)).not.toThrow();
    //@ts-ignore
    expect(() => global.setTimeoutForTest1.call({}, () => {}, 1)).toThrow();
    // -----
    //@ts-ignore
    expect(global.setTimeoutForTest2.name).toEqual("setTimeoutForTest2");
    expect(_this.setTimeoutForTest2.name).toEqual("bound setTimeoutForTest2");
    //@ts-ignore
    expect(() => global.setTimeout.call(global, () => {}, 1)).not.toThrow();
    //@ts-ignore
    expect(() => global.setTimeoutForTest2.call(global, () => {}, 1)).not.toThrow();
    //@ts-ignore
    expect(() => global.setTimeoutForTest2.call({}, () => {}, 1)).toThrow();
  });
  // https://github.com/xcanwin/KeepChatGPT 环境隔离得不够干净导致的
  it("[兼容问题] Uncaught TypeError: Illegal invocation #189", async () => {
    // setTimeout 和 setTimeoutForTest1 都测试吧
    const promise1 = new Promise((resolve) => {
      _this.setTimeoutForTest1(resolve, 1);
    });
    const promise2 = new Promise((resolve) => {
      _this.setTimeout(resolve, 1);
    });
    const res = Promise.all([promise1, promise2]);
    await expect(res.then((res) => (!res[0] && !res[1] ? "ok" : "ng"))).resolves.toBe("ok");
  });
  // AC-baidu-重定向优化百度搜狗谷歌必应搜索_favicon_双列
  it("[兼容问题] TypeError: Object.freeze is not a function #116", () => {
    expect(() => _this.Object.freeze({})).not.toThrow();
  });
  it("Proxy Function #985", async () => {
    // setTimeout 和 setTimeoutForTest2 都测试吧
    const promise1 = new Promise((resolve) => {
      _this.setTimeoutForTest2(resolve, 1);
    });
    const promise2 = new Promise((resolve) => {
      _this.setTimeout(resolve, 1);
    });
    const res = Promise.all([promise1, promise2]);
    await expect(res.then((res) => (res[0] === "proxy" && !res[1] ? "ok" : "ng"))).resolves.toBe("ok");
  });

  const tag = (<any>global)[Symbol.toStringTag]; // 实际环境：'[object Window]' 测试环境：'[object global]'

  // 允许往global写入Symbol属性,影响内容: https://bbs.tampermonkey.net.cn/thread-5509-1-1.html
  it("Symbol", () => {
    const s = Symbol("test");
    _this[s] = "ok";
    expect(_this[s]).toEqual("ok");
  });
  // toString.call(window)返回的是'[object Object]',影响内容: https://github.com/scriptscat/scriptcat/issues/260
  it("toString.call(window)", () => {
    expect(toString.call(_this)).toEqual(`[object Window]`);
  });

  // 与TM保持一致，toString返回global([object Window]) #737
  it("toString", async () => {
    const { exec } = makeExec(`return {
      toStringThis: {}.toString.call(this),
      toStringWindow: {}.toString.call(window),
      toString: toString(),
    }`);
    const ret = await exec.exec();
    expect(ret).toEqual({
      toStringThis: `[object Window]`,
      toStringWindow: `[object Window]`,
      toString: `[object ${tag}]`,
    });
  });

  // Object.hasOwnProperty穿透 https://github.com/scriptscat/scriptcat/issues/272
  it("[穿透测试] Object.hasOwnProperty", () => {
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(false);
    _this.test1 = "ok";
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(true);
    expect(Object.prototype.hasOwnProperty.call(_this, "test")).toEqual(false);
  });

  // https://github.com/scriptscat/scriptcat/issues/962
  // window.constructor === Window
  // window instanceof Window === false
  it("TM Sandbox Window", () => {
    const window = global;
    //@ts-ignore
    expect(_win.PERSISTENT === window.PERSISTENT).toEqual(true);
    //@ts-ignore
    expect(_win.TEMPORARY === window.TEMPORARY).toEqual(true);
    //@ts-ignore
    expect(_win.constructor === window.constructor).toEqual(true);
    //@ts-ignore
    expect(_win.__proto__ === window.__proto__).toEqual(true);
    //@ts-ignore
    expect(typeof window.constructor === "function").toEqual(true);
    //@ts-ignore
    expect(typeof _win.constructor === "function").toEqual(true);
    //@ts-ignore
    expect(window instanceof window.constructor === true).toEqual(true);
    //@ts-ignore
    expect(_win instanceof window.constructor === false).toEqual(true);
    //@ts-ignore
    expect(_win.addEventListener !== window.addEventListener).toEqual(true);
    //@ts-ignore
    expect(Object.getPrototypeOf(_win) === null).toEqual(true);
  });

  it("特殊关键字不能穿透沙盒", () => {
    expect(_global["define"]).toEqual("特殊关键字不能穿透沙盒");
    expect(_this["define"]).toBeUndefined();
    _this["define"] = "ok";
    expect(_this["define"]).toEqual("ok");
    expect(_global["define"]).toEqual("特殊关键字不能穿透沙盒");
  });

  it("RegExp", async () => {
    const { exec } = makeExec(`const str = "12345";
const reg = /(123)/;
return [str.match(reg), RegExp.$1];`);
    const ret = await exec.exec();
    expect(ret?.[0][1]).toEqual("123");
    expect(ret?.[1]).toEqual("123");
  });
  it("沙盒之间不应该共享变量", async () => {
    const { exec: exec1 } = makeExec(
      `this.testVar = "ok"; ttest1 = "ok"; return {testVar: this.testVar, testVar2: this.testVar2, ttest1: typeof ttest1, ttest2: typeof ttest2};`
    );
    const ret1 = await exec1.exec();
    expect(ret1).toEqual({ testVar: "ok", testVar2: undefined, ttest1: "string", ttest2: "number" });

    const { exec: exec2 } = makeExec(
      `this.testVar2 = "ok"; ttest2 = "ok"; return {testVar: this.testVar, testVar2: this.testVar2, ttest1: typeof ttest1, ttest2: typeof ttest2};`
    );
    const ret2 = await exec2.exec();
    expect(ret2).toEqual({ testVar: undefined, testVar2: "ok", ttest1: "number", ttest2: "string" });

    const { exec: exec3 } = makeExec(
      `onload = function (){return 123}; return {onload, thisOnload: this.onload, winOnload: window.onload};`
    );
    const ret3 = await exec3.exec();
    expect(ret3.onload).toEqual(expect.any(Function));
    expect(ret3.thisOnload).toEqual(expect.any(Function));
    expect(ret3.winOnload).toEqual(expect.any(Function));
    expect(ret3.thisOnload).toEqual(ret3.onload);
    expect(ret3.winOnload).toEqual(ret3.onload);
    const cacheRet3Onload = ret3.onload;

    const { exec: exec4 } = makeExec(
      `onload = function (){return 456}; return {onload, thisOnload: this.onload, winOnload: window.onload};`
    );
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

  it("沙盒之间能用unsafeWindow（及全局作用域）共享变量", async () => {
    const { exec: exec1 } = makeExec(
      `unsafeWindow.testSVar1 = "shareA"; ggaa1 = "ok"; return {testSVar1: unsafeWindow.testSVar1, testSVar2: unsafeWindow.testSVar2, ggaa1: typeof ggaa1, ggaa2: typeof ggaa2};`
    );
    const ret1 = await exec1.exec();
    expect(ret1).toEqual({ testSVar1: "shareA", testSVar2: undefined, ggaa1: "string", ggaa2: "undefined" });

    const { exec: exec2 } = makeExec(
      `unsafeWindow.testSVar2 = "shareB"; ggaa2 = "ok"; return {testSVar1: unsafeWindow.testSVar1, testSVar2: unsafeWindow.testSVar2, ggaa1: typeof ggaa1, ggaa2: typeof ggaa2};`
    );
    const ret2 = await exec2.exec();
    expect(ret2).toEqual({ testSVar1: "shareA", testSVar2: "shareB", ggaa1: "string", ggaa2: "string" });
  });

  it("测试SC沙盒与TM沙盒有相近的特殊处理", async () => {
    const { exec: exec1 } = makeExec(
      `onfocus = function(){}; onresize = 123; onblur = "123"; const ret = {onfocus, onresize, onblur}; onfocus = null; onresize = null; onblur = null; return ret;`
    );
    const ret1 = await exec1.exec();
    expect(ret1.onfocus).toEqual(expect.any(Function));
    expect(ret1.onresize).toBeNull();
    expect(ret1.onblur).toBeNull();

    const { exec: exec2 } = makeExec(
      `window.onfocus = function(){}; window.onresize = 123; window.onblur = "123"; const {onfocus, onresize, onblur} = window; const ret = {onfocus, onresize, onblur}; window.onfocus = null; window.onresize = null; window.onblur = null; return ret;`
    );
    const ret2 = await exec2.exec();
    expect(ret2.onfocus).toEqual(expect.any(Function));
    expect(ret2.onresize).toBeNull();
    expect(ret2.onblur).toBeNull();
  });
});
