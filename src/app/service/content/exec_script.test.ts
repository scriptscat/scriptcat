import ExecScript from "./exec_script";
import { compileScript, compileScriptCode } from "./utils";
import { ExtVersion } from "@App/app/const";
import { initTestEnv } from "@Tests/utils";
import { describe, expect, it, vi } from "vitest";
import type { GMInfoEnv, ScriptFunc } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";

initTestEnv();

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

describe("GM_info", () => {
  it("none", async () => {
    expect(noneExec.sandboxContext).toBeUndefined();
    expect(noneExec.named).not.toBeUndefined();
    scriptRes.code = "return {_this:this,GM_info};";
    noneExec.scriptFunc = compileScript(compileScriptCode(scriptRes));
    const ret = await noneExec.exec();
    expect(ret.GM_info.version).toEqual(ExtVersion);
    expect(ret.GM_info.script.version).toEqual("1.0.0");
    expect(ret._this).toEqual(global);
  });
  it("sandbox", async () => {
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

describe("unsafeWindow", () => {
  it("unsafeWindow available", async () => {
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

  it("sandbox", async () => {
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

  it("sandbox NodeFilter", async () => {
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

describe("sandbox", () => {
  it("global", async () => {
    scriptRes2.code = "window.testObj = 'ok';return window.testObj";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    let ret = await sandboxExec.exec();
    expect(ret).toEqual("ok");
    scriptRes2.code = "window.testObj = 'ok2';return testObj";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    ret = await sandboxExec.exec();
    expect(ret).toEqual("ok2");
  });
  it("this", async () => {
    scriptRes2.code = "this.testObj='ok2';return testObj;";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("ok2");
  });
  it("this2", async () => {
    scriptRes2.code = `
    !function(t, e) {
      "object" == typeof exports ? module.exports = exports = e() : "function" == typeof define && define.amd ? define([], e) : t.CryptoJS = e()
      // console.log("object" == typeof exports,"function" == typeof define)
  } (this, function () {
      return { test: "ok3" }
  });
  // console.log(CryptoJS)
  return ((typeof CryptoJS === "object") ? CryptoJS?.test : undefined);`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("ok3");
  });

  // 沉浸式翻译, 常量值被改变
  it("NodeFilter #214", async () => {
    scriptRes2.code = `return NodeFilter.FILTER_REJECT;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual(2);
  });

  // RegExp.$x 内容被覆盖 https://github.com/scriptscat/scriptcat/issues/293
  it("RegExp", async () => {
    scriptRes2.code = `let ok = /12(3)/.test('123');return RegExp.$1;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("3");
  });
});

describe("this", () => {
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
  it("undefined variable", async () => {
    scriptRes2.code = `return typeof testVar;`;
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret).toEqual("undefined");
  });
  it("undefined variable in global", async () => {
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
  it("this.test", async () => {
    scriptRes2.code = `this.test = "ok";return this.test;`;
    noneExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await noneExec.exec();
    expect(ret).toEqual("ok");
  });
});

describe("@grant GM", () => {
  it("GM_", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValue", "GM_getTab", "GM_saveTab", "GM_cookie"];
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    script.code = `return {
      ["GM.getValue"]: GM.getValue,
      ["GM.getTab"]: GM.getTab,
      ["GM.setTab"]: GM.setTab,
      GM_getValue: this.GM_getValue,
      GM_getTab: this.GM_getTab,
      GM_saveTab: this.GM_saveTab,
      GM_cookie: this.GM_cookie,
      ["GM_cookie.list"]: this.GM_cookie.list,
      ["GM.cookie"]: this.GM.cookie,
    }`;
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret["GM.getValue"]).toBeUndefined();
    expect(ret["GM.getTab"]).toBeUndefined();
    expect(ret["GM.setTab"]).toBeUndefined();
    expect(ret.GM_getValue.name).toEqual("bound GM_getValue");
    expect(ret.GM_getTab.name).toEqual("bound GM_getTab");
    expect(ret.GM_saveTab.name).toEqual("bound GM_saveTab");
    expect(ret.GM_cookie.name).toEqual("bound GM_cookie");
    expect(ret["GM_cookie.list"].name).toEqual("bound GM_cookie.list");
    expect(ret["GM.cookie"]).toBeUndefined();
  });
  it("GM.*", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.metadata.grant = ["GM.getValue", "GM.getTab", "GM.saveTab", "GM.cookie"];
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    script.code = `return {
      ["GM.getValue"]: GM.getValue,
      ["GM.getTab"]: GM.getTab,
      ["GM.saveTab"]: GM.saveTab,
      GM_getValue: this.GM_getValue,
      GM_getTab: this.GM_getTab,
      GM_saveTab: this.GM_saveTab,
      GM_cookie: this.GM_cookie,
      ["GM.cookie"]: this.GM.cookie,
    }`;
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret["GM.getValue"].name).toEqual("bound GM.getValue");
    expect(ret["GM.getTab"].name).toEqual("bound GM_getTab");
    expect(ret["GM.saveTab"].name).toEqual("bound GM_saveTab");
    expect(ret.GM_getValue).toBeUndefined();
    expect(ret.GM_getTab).toBeUndefined();
    expect(ret.GM_saveTab).toBeUndefined();
    expect(ret.GM_cookie).toBeUndefined();
    expect(ret["GM.cookie"].name).toEqual("bound GM.cookie");
    expect(ret["GM.cookie"].list.name).toEqual("bound GM.cookie.list");
  });
});

describe("window.*", () => {
  it("window.close", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.metadata.grant = ["window.close"];
    script.code = `return window.close;`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual(expect.any(Function));
  });
});

describe("GM Api", () => {
  it("GM_getValue", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.value = { test: "ok" };
    script.metadata.grant = ["GM_getValue"];
    script.code = `return GM_getValue("test");`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual("ok");
  });
  it("GM.getValue", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.value = { test: "ok" };
    script.metadata.grant = ["GM.getValue"];
    script.code = `return GM.getValue("test").then(v=>v+"!");`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual("ok!");
  });

  it("GM_listValues", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.value = { test1: "23", test2: "45", test3: "67" };
    script.metadata.grant = ["GM_listValues"];
    script.code = `return GM_listValues().join("-");`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual("test1-test2-test3");
  });

  it("GM.listValues", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.value = { test1: "23", test2: "45", test3: "67" };
    script.metadata.grant = ["GM.listValues"];
    script.code = `return GM.listValues().then(v=>v.join("-"));`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual("test1-test2-test3");
  });

  it("GM_getValues", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.value = { test1: "23", test2: 45, test3: "67" };
    script.metadata.grant = ["GM_getValues"];
    script.code = `return GM_getValues(["test2", "test3", "test1"]);`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret.test1).toEqual("23");
    expect(ret.test2).toEqual(45);
    expect(ret.test3).toEqual("67");
  });

  it("GM.getValues", async () => {
    const script = Object.assign({}, scriptRes2) as ScriptLoadInfo;
    script.value = { test1: "23", test2: 45, test3: "67" };
    script.metadata.grant = ["GM.getValues"];
    script.code = `return GM.getValues(["test2", "test3", "test1"]).then(v=>v);`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret.test1).toEqual("23");
    expect(ret.test2).toEqual(45);
    expect(ret.test3).toEqual("67");
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

  it("set contenxt", () => {
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

      it("验证 onload 事件调用", () => {
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
      // it("删除 onload 后应该为 null", () => {
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
  it("[兼容问题] Uncaught TypeError: Illegal invocation #189", () => {
    return new Promise((resolve) => {
      console.log(_this.setTimeoutForTest.prototype);
      _this.setTimeoutForTest(resolve, 100);
    });
  });
  // AC-baidu-重定向优化百度搜狗谷歌必应搜索_favicon_双列
  it("[兼容问题] TypeError: Object.freeze is not a function #116", () => {
    expect(() => _this.Object.freeze({})).not.toThrow();
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
    expect(toString.call(_this)).toEqual(`[object ${tag}]`); // 与 global 一致
    expect(toString.call(_this)).not.toEqual("[object Object]"); // 不是 [object Object]
  });

  // Object.hasOwnProperty穿透 https://github.com/scriptscat/scriptcat/issues/272
  it("[穿透测试] Object.hasOwnProperty", () => {
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(false);
    _this.test1 = "ok";
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(true);
    expect(Object.prototype.hasOwnProperty.call(_this, "test")).toEqual(false);
  });

  it("RegExp", async () => {
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
});
