import { ScriptRunResouce } from "@App/app/repo/scripts";
import ExecScript from "./exec_script";
import { compileScript, compileScriptCode } from "./utils";
import { ExtVersion } from "@App/app/const";
import { initTestEnv } from "@Tests/utils";
import { describe, expect, it } from "vitest";

initTestEnv();

const scriptRes = {
  id: 0,
  name: "test",
  metadata: {
    version: ["1.0.0"],
  },
  code: "console.log('test')",
  sourceCode: "sourceCode",
  value: {},
  grantMap: {
    none: true,
  },
} as unknown as ScriptRunResouce;

// @ts-ignore
const noneExec = new ExecScript(scriptRes);

const scriptRes2 = {
  id: 0,
  name: "test",
  metadata: {
    version: ["1.0.0"],
  },
  code: "console.log('test')",
  sourceCode: "sourceCode",
  value: {},
  grantMap: {},
} as unknown as ScriptRunResouce;

// @ts-ignore
const sandboxExec = new ExecScript(scriptRes2);

describe("GM_info", () => {
  it("none", async () => {
    scriptRes.code = "return GM_info";
    noneExec.scriptFunc = compileScript(compileScriptCode(scriptRes));
    const ret = await noneExec.exec();
    expect(ret.version).toEqual(ExtVersion);
    expect(ret.script.version).toEqual("1.0.0");
  });
  it("sandbox", async () => {
    scriptRes2.code = "return GM_info";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = await sandboxExec.exec();
    expect(ret.version).toEqual(ExtVersion);
    expect(ret.script.version).toEqual("1.0.0");
  });
});

describe("unsafeWindow", () => {
  it("sandbox", async () => {
    // @ts-ignore
    global.testUnsafeWindow = "ok";
    scriptRes2.code = "return unsafeWindow.testUnsafeWindow";
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
      console.log("object" == typeof exports,"function" == typeof define)
  } (this, function () {
      return { test: "ok3" }
  });
  console.log(CryptoJS)
  return CryptoJS.test;`;
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
