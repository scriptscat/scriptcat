import initTestEnv from "@App/pkg/utils/test_utils";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import ExecScript from "./exec_script";
import { compileScript, compileScriptCode } from "./utils";

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
  it("none", () => {
    scriptRes.code = "return GM_info";
    noneExec.scriptFunc = compileScript(compileScriptCode(scriptRes));
    const ret = noneExec.exec();
    expect(ret.version).toEqual("1.0.0");
    expect(ret.scriptSource).toEqual("sourceCode");
  });
  it("sandbox", () => {
    scriptRes2.code = "return GM_info";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = sandboxExec.exec();
    expect(ret.version).toEqual("1.0.0");
    expect(ret.scriptSource).toEqual("sourceCode");
  });
});

describe("unsafeWindow", () => {
  it("sandbox", () => {
    // @ts-ignore
    global.testUnsafeWindow = "ok";
    scriptRes2.code = "return unsafeWindow.testUnsafeWindow";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = sandboxExec.exec();
    expect(ret).toEqual("ok");
  });
});

describe("sandbox", () => {
  it("global", () => {
    scriptRes2.code = "window.testObj = 'ok';return window.testObj";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    let ret = sandboxExec.exec();
    expect(ret).toEqual("ok");
    scriptRes2.code = "window.testObj = 'ok2';return testObj";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    ret = sandboxExec.exec();
    expect(ret).toEqual("ok2");
  });
  it("this", () => {
    scriptRes2.code = "this.testObj='ok2';return testObj;";
    sandboxExec.scriptFunc = compileScript(compileScriptCode(scriptRes2));
    const ret = sandboxExec.exec();
    expect(ret).toEqual("ok2");
  });
  it("this2", () => {
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
    const ret = sandboxExec.exec();
    expect(ret).toEqual("ok3");
  });
});
