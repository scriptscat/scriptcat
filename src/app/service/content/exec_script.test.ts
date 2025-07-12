import { type ScriptRunResource } from "@App/app/repo/scripts";
import ExecScript from "./exec_script";
import { compileScript, compileScriptCode } from "./utils";
import { ExtVersion } from "@App/app/const";
import { initTestEnv } from "@Tests/utils";
import { describe, expect, it } from "vitest";
import type { GMInfoEnv, ScriptFunc } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";

initTestEnv();

const nilFn: ScriptFunc = ()=>{};

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
} as unknown as ScriptRunResource as ScriptLoadInfo;
const envInfo: GMInfoEnv = {
  sandboxMode: "raw",
  userAgentData: {
    brands: [],
    mobile: false,
    platform: "",
  },
  isIncognito: false,
};

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
} as unknown as ScriptRunResource as ScriptLoadInfo;

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
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret.test1).toEqual("23");
    expect(ret.test2).toEqual(45);
    expect(ret.test3).toEqual("67");
  });
});
