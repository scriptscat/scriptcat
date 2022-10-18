import "fake-indexeddb/auto";
import LoggerCore from "@App/app/logger/core";
import DBWriter from "@App/app/logger/db_writer";
import migrate from "@App/app/migrate";
import { LoggerDAO } from "@App/app/repo/logger";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import ExecScript from "./exec_script";
import { compileScript, compileScriptCode } from "./utils";

migrate();
// 沙盒单元测试
new LoggerCore({
  level: "debug",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "tests" },
  debug: true,
});

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
