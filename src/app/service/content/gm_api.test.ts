import { describe, expect, it, vi } from "vitest";
import ExecScript from "./exec_script";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { GMInfoEnv, ScriptFunc } from "./types";
import { compileScript, compileScriptCode } from "./utils";
import type { Message } from "@Packages/message/types";
import { encodeMessage } from "@App/pkg/utils/message_value";
import { v4 as uuidv4 } from "uuid";

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

  it("GM_listValues No Sort", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.value = {};
    script.value.test5 = "30";
    script.value.test2 = "70";
    script.value.test3 = "75";
    script.value.test1 = "40";
    script.metadata.grant = ["GM_listValues"];
    script.code = `return GM_listValues().join("-");`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual("test5-test2-test3-test1"); // TM也沒有sort
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

  it("GM.listValues No Sort", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.value = {};
    script.value.test5 = "30";
    script.value.test2 = "70";
    script.value.test3 = "75";
    script.value.test1 = "40";
    script.metadata.grant = ["GM.listValues"];
    script.code = `return GM.listValues().then(v=>v.join("-"));`;
    // @ts-ignore
    const exec = new ExecScript(script, undefined, undefined, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual("test5-test2-test3-test1"); // TM也沒有sort
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

  it("同id菜单，执行最后一个", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_registerMenuCommand"];
    script.code = `return new Promise(resolve=>{
      GM_registerMenuCommand("test", ()=>resolve(123),{id: "abc"});
      GM_registerMenuCommand("test", ()=>resolve(456),{id: "abc"});
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
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

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
    expect(await retPromise).toEqual(456);
  });

  it("id生成逻辑", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_registerMenuCommand"];
    script.code = `
    // 自定义id
    let obj1 = { id: "abc" };
    let id1 = GM_registerMenuCommand("test1", ()=>"test1",obj1);
    let id2 = GM_registerMenuCommand("test2", ()=>"test2",obj1);
    // 顺序生成的id
    let id3 = GM_registerMenuCommand("test3", ()=>"test3");
    let id4 = GM_registerMenuCommand("test4", ()=>"test4");
    // 不能覆盖顺序
    let id5 = GM_registerMenuCommand("test5", ()=>"test5",{id: "3"});
    let id6 = GM_registerMenuCommand("test6", ()=>"test6",{id: 3});
    let id7 = GM_registerMenuCommand("test7", ()=>"test7");
    // 同名菜单-不同的id
    let id8 = GM_registerMenuCommand("test7", ()=>"test7");
    return { id1, id2, id3, id4, id5, id6, id7, id8 };
    `;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();
    expect(ret).toEqual({ id1: "abc", id2: "abc", id3: 1, id4: 2, id5: "3", id6: 3, id7: 3, id8: 4 });
  });
});

describe("GM_value", () => {
  it("GM_setValue", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValue", "GM_setValue"];
    script.code = `
    GM_setValue("a", 123);
    let ret1 = GM_getValue("a", 456);
    // 设置再删除
    GM_setValue("a", undefined);
    let ret2 = GM_getValue("a", 456);
    return {ret1, ret2};
    `;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret = await exec.exec();

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    // 第一次调用：设置值为 123
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_setValue",
          params: [expect.any(String), "a", 123],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    // 第二次调用：删除值（设置为 undefined）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_setValue",
          params: [expect.any(String), "a"],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    expect(ret).toEqual({ ret1: 123, ret2: 456 });
  });
  it("GM_addValueChangeListener", async () => {
    const script = Object.assign({ uuid: uuidv4() }, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValue", "GM_setValue", "GM_addValueChangeListener"];
    script.code = `
    return new Promise(resolve=>{
      GM_addValueChangeListener("a", (name, oldValue, newValue, remote)=>{
        resolve({name, oldValue, newValue, remote});
      });
      GM_setValue("a", 123);
    });
   `;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    let retPromise = exec.exec();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // 模拟值变化
    exec.valueUpdate({
      id: "123",
      entries: encodeMessage([["a", 123, undefined]]),
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: exec.sandboxContext!.runFlag, tabId: -2 },
    });
    const ret = await retPromise;
    expect(ret).toEqual({ name: "a", oldValue: undefined, newValue: 123, remote: false });
    // remote = true
    retPromise = exec.exec();
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    // 模拟值变化
    exec.valueUpdate({
      id: "123",
      entries: encodeMessage([["a", 123, undefined]]),
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: "user", tabId: -2 },
    });
    const ret2 = await retPromise;
    expect(ret2).toEqual({ name: "a", oldValue: undefined, newValue: 123, remote: true });
  });
});
