import { describe, expect, it, vi } from "vitest";
import ExecScript from "./exec_script";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { GMInfoEnv, ScriptFunc } from "./types";
import { compileScript, compileScriptCode } from "./utils";
import type { Message } from "@Packages/message/types";

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

describe("@grant GM", () => {
  it("GM_", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM.getValue", "GM.getTab", "GM.getTabs", "GM.saveTab", "GM.cookie"];
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    script.code = `return {
      ["GM.getValue"]: GM.getValue,
      ["GM.getTab"]: GM.getTab,
      ["GM.getTabs"]: GM.getTabs,
      ["GM.saveTab"]: GM.saveTab,
      GM_getValue: this.GM_getValue,
      GM_getTab: this.GM_getTab,
      GM_getTabs: this.GM_getTabs,
      GM_saveTab: this.GM_saveTab,
      GM_cookie: this.GM_cookie,
      ["GM.cookie"]: this.GM.cookie,
    }`;
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret["GM.getValue"].name).toEqual("bound GM.getValue");
    expect(ret["GM.getTab"].name).toEqual("bound GM.getTab");
    expect(ret["GM.getTabs"].name).toEqual("bound GM.getTabs");
    expect(ret["GM.saveTab"].name).toEqual("bound GM_saveTab");
    expect(ret.GM_getValue).toBeUndefined();
    expect(ret.GM_getTab.name).toEqual("bound GM_getTab");
    expect(ret.GM_getTabs.name).toEqual("bound GM_getTabs");
    expect(ret.GM_saveTab).toBeUndefined();
    expect(ret.GM_cookie).toBeUndefined();
    expect(ret["GM.cookie"].name).toEqual("bound GM.cookie");
    expect(ret["GM.cookie"].list.name).toEqual("bound GM.cookie.list");
  });
});

describe("window.*", () => {
  it("window.close", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
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

describe("early-script", () => {
  it("没有 @run-at document-start 会报错", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata = {};
    script.metadata["early-start"] = [""];
    script.metadata["grant"] = ["CAT_scriptLoaded"];
    script.code = `return CAT_scriptLoaded().then(()=>123);`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    // 抛出错误
    await expect(exec.exec()).rejects.toThrowError();
  });
  it("成功", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata = {};
    script.metadata["early-start"] = [""];
    script.metadata["run-at"] = ["document-start"];
    script.metadata["grant"] = ["CAT_scriptLoaded"];
    script.code = `return CAT_scriptLoaded().then(()=>123);`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = exec.exec();
    // 触发envInfo
    exec.dealEarlyScript(envInfo);
    expect(await ret).toEqual(123);
  });
});

describe("GM_menu", () => {
  it("注册菜单", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_registerMenuCommand"];
    script.code = `return new Promise(resolve=>{
      GM_registerMenuCommand("test", ()=>resolve(123));
    })`;
    const mockSendMessage = vi.fn().mockResolvedValueOnce({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const retPromise = exec.exec();

    // 验证 sendMessage 是否被调用
    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // 获取实际调用的参数
    const actualCall = mockSendMessage.mock.calls[0][0];
    const actualMenuKey = actualCall.data.params[0];

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_registerMenuCommand",
          params: [actualMenuKey, "test", {}],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );
    // 模拟点击菜单
    exec.emitEvent("menuClick", actualMenuKey, "");
    expect(await retPromise).toEqual(123);
  });

  it("取消注册菜单", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_registerMenuCommand", "GM_unregisterMenuCommand"];
    script.code = `
    let key = GM_registerMenuCommand("test", ()=>key="test");
    GM_unregisterMenuCommand(key);
    return key;
  `;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = exec.exec();
    // 验证 sendMessage 是否被调用
    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    expect(await ret).toEqual(1);
  });
});
