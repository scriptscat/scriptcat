import { describe, expect, it, vi } from "vitest";
import ExecScript from "../exec_script";
import type { ScriptLoadInfo } from "@App/app/service/service_worker/types";
import type { GMInfoEnv, ScriptFunc } from "../types";
import { compileScript, compileScriptCode } from "../utils";
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

describe.concurrent("@grant GM", () => {
  it.concurrent("GM_", async () => {
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

  it.concurrent("GM.*", async () => {
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

describe.concurrent("window.*", () => {
  it.concurrent("window.close", async () => {
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

describe.concurrent("GM Api", () => {
  it.concurrent("GM_getValue", async () => {
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
  it.concurrent("GM.getValue", async () => {
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

  it.concurrent("GM_listValues", async () => {
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

  it.concurrent("GM_listValues No Sort", async () => {
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

  it.concurrent("GM.listValues", async () => {
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

  it.concurrent("GM.listValues No Sort", async () => {
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

  it.concurrent("GM_getValues", async () => {
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
    // object default
    script.code = `return GM_getValues({test4: "default",test2:123});`;
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const ret2 = await exec.exec();
    expect(ret2.test1).toBeUndefined();
    expect(ret2.test2).toEqual(45);
    expect(ret2.test4).toEqual("default");
  });

  it.concurrent("GM.getValues", async () => {
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

describe.concurrent("early-script", () => {
  it.concurrent("没有 @run-at document-start 会报错", async () => {
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
  it.concurrent("成功", async () => {
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
    exec.updateEarlyScriptGMInfo(envInfo);
    expect(await ret).toEqual(123);
  });
});

describe.concurrent("GM_menu", () => {
  it.concurrent("注册菜单", async () => {
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
          params: [
            actualMenuKey,
            "test",
            {
              autoClose: true,
              mIndividualKey: 0,
              mSeparator: false,
              nested: true,
            },
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );
    // 模拟点击菜单
    exec.emitEvent("menuClick", actualMenuKey, "");
    expect(await retPromise).toEqual(123);
  });

  it.concurrent("取消注册菜单", async () => {
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

  it.concurrent("同id菜单，执行最后一个", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_registerMenuCommand"];
    script.code = `return new Promise(resolve=>{
      GM_registerMenuCommand("duplicate-menu-id", ()=>resolve(123),{id: "abc"});
      GM_registerMenuCommand("duplicate-menu-id", ()=>resolve(456),{id: "abc"});
    })`;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
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
          params: [
            actualMenuKey,
            "duplicate-menu-id",
            {
              autoClose: true,
              id: undefined,
              individual: undefined,
              mIndividualKey: 0,
              mSeparator: false,
              nested: true,
            },
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );
    // 模拟点击菜单
    exec.emitEvent("menuClick", actualMenuKey, "");
    expect(await retPromise).toEqual(456);
  });

  it.concurrent("id生成逻辑", async () => {
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

describe.concurrent("GM_value", () => {
  it.concurrent("GM_setValue", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValue", "GM_setValue"];
    script.code = `
    GM_setValue("a", 123);
    let ret1 = GM_getValue("a", 456);
    // 设置再删除
    GM_setValue("a", undefined);
    let ret2 = GM_getValue("a", 456);
    // 设置错误的对象
    GM_setValue("proxy-key", new Proxy({}, {}));
    let ret3 = GM_getValue("proxy-key");
    GM_setValue("window",window);
    let ret4 = GM_getValue("window");
    return {ret1, ret2, ret3, ret4};
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
    expect(mockSendMessage).toHaveBeenCalledTimes(4);

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

    // 第三次调用：设置值为 Proxy 对象（应失败）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_setValue",
          params: [expect.any(String), "proxy-key", {}], // Proxy 会被转换为空对象
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    // 第四次调用：设置值为 window 对象（应失败）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_setValue",
          params: [expect.any(String), "window"], // window 会被转换为空对象
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    expect(ret).toEqual({
      ret1: 123,
      ret2: 456,
      ret3: {},
      ret4: undefined,
    });
  });

  it.concurrent("value引用问题 #1141", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.value = {};
    script.metadata.grant = ["GM_getValue", "GM_setValue", "GM_getValues"];
    script.code = `
const value1 = {
    arr: [1],
    obj: {
        a: "1"
    },
    str: "123",
}
GM_setValue("abc", value1);

const allValues1 = GM_getValues();

allValues1.abc.arr.push(8);
allValues1.n1 = 5;
allValues1.n2 = {c: 8};
delete allValues1.abc.obj.a;
allValues1.abc.str = "0";

const value2 = GM_getValue("abc");

value2.arr.push(2);
value2.obj.b = 2;
value2.str = "456";

value1.arr.push(3);
value1.obj.b = 3;
value1.str = "789";

const value3 = GM_getValue("abc");

const values1 = GM_getValues(["abc", "n3"]);

const values2 = GM_getValues({"abc":{}, "n4":{}, "n5":"hi"});

values2.abc.arr.push(2);
values2.abc.obj.b = 2;
values2.abc.str = "456";

const allValues2 = GM_getValues();


const value4 = GM_getValue("abc");
const value5 = GM_getValue("abc");
value5.arr[0] = 9;
GM_setValue("abc", value5);

const value6 = GM_getValue("abc");
    
return { value1, value2, value3, values1,values2, allValues1, allValues2, value4, value5, value6 };
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

    expect(ret).toEqual({
      value1: {
        arr: [1, 3],
        obj: {
          a: "1",
          b: 3,
        },
        str: "789",
      },
      value2: {
        arr: [1, 2],
        obj: {
          a: "1",
          b: 2,
        },
        str: "456",
      },
      value3: {
        arr: [1],
        obj: {
          a: "1",
        },
        str: "123",
      },
      values1: {
        abc: {
          arr: [1],
          obj: {
            a: "1",
          },
          str: "123",
        },
      },
      values2: {
        abc: {
          arr: [1, 2],
          obj: {
            a: "1",
            b: 2,
          },
          str: "456",
        },
        n4: {},
        n5: "hi",
      },
      allValues1: {
        abc: {
          arr: [1, 8],
          obj: {},
          str: "0",
        },
        n1: 5,
        n2: { c: 8 },
      },
      allValues2: {
        abc: {
          arr: [1],
          obj: {
            a: "1",
          },
          str: "123",
        },
      },
      value4: {
        arr: [1],
        obj: {
          a: "1",
        },
        str: "123",
      },
      value5: {
        arr: [9],
        obj: {
          a: "1",
        },
        str: "123",
      },
      value6: {
        arr: [9],
        obj: {
          a: "1",
        },
        str: "123",
      },
    });
  });

  it.concurrent("GM_setValues", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValues", "GM_setValues"];
    script.code = `
    GM_setValues({"a":123,"b":456,"c":"789"});
    let ret1 = GM_getValues(["a","b","c"]);
    // 设置再删除
    GM_setValues({"a": undefined, "c": undefined});
    let ret2 = GM_getValues(["a","b","c"]);
    // 设置错误的对象
    GM_setValues({"proxy-key": new Proxy({}, {})});
    let ret3 = GM_getValues(["proxy-key"]);
    GM_setValues({"window": window});
    let ret4 = GM_getValues(["window"]);
    return {ret1, ret2, ret3, ret4};
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
    expect(mockSendMessage).toHaveBeenCalledTimes(4);

    // 第一次调用：设置值为 123
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            expect.objectContaining({
              k: expect.stringMatching(/^##[\d.]+##$/),
              m: expect.objectContaining({
                a: 123,
                b: 456,
                c: "789",
              }),
            }),
          ],
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
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            expect.objectContaining({
              k: expect.stringMatching(/^##[\d.]+##$/),
              m: expect.objectContaining({
                a: expect.stringMatching(/^##[\d.]+##undefined$/),
                c: expect.stringMatching(/^##[\d.]+##undefined$/),
              }),
            }),
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    // 第三次调用：设置值为 Proxy 对象（应失败）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            expect.objectContaining({
              k: expect.stringMatching(/^##[\d.]+##$/),
              m: expect.objectContaining({
                "proxy-key": {},
              }),
            }),
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    // 第四次调用：设置值为 window 对象（应失败）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        action: "content/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            expect.objectContaining({
              k: expect.stringMatching(/^##[\d.]+##$/),
              m: expect.objectContaining({
                window: expect.stringMatching(/^##[\d.]+##undefined$/),
              }),
            }),
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    expect(ret).toEqual({
      ret1: { a: 123, b: 456, c: "789" },
      ret2: { b: 456 },
      ret3: { "proxy-key": {} },
      ret4: { window: undefined },
    });
  });

  it.concurrent("GM_deleteValue", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValues", "GM_setValues", "GM_deleteValue"];
    script.code = `
    GM_setValues({"a":123,"b":456,"c":"789"});
    let ret1 = GM_getValues(["a","b","c"]);
    // 设置再删除
    GM_deleteValue("b");
    let ret2 = GM_getValues(["a","b","c"]);
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
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            expect.objectContaining({
              k: expect.stringMatching(/^##[\d.]+##$/),
              m: expect.objectContaining({
                a: 123,
                b: 456,
                c: "789",
              }),
            }),
          ],
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
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the string payload
            "b",
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    expect(ret).toEqual({ ret1: { a: 123, b: 456, c: "789" }, ret2: { a: 123, c: "789" } });
  });

  it.concurrent("GM_deleteValues", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValues", "GM_setValues", "GM_deleteValues"];
    script.code = `
    GM_setValues({"a":123,"b":456,"c":"789"});
    let ret1 = GM_getValues(["a","b","c"]);
    // 设置再删除
    GM_deleteValues(["a","c"]);
    let ret2 = GM_getValues(["a","b","c"]);
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
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            expect.objectContaining({
              k: expect.stringMatching(/^##[\d.]+##$/),
              m: expect.objectContaining({
                a: 123,
                b: 456,
                c: "789",
              }),
            }),
          ],
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
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the string payload
            expect.objectContaining({
              k: expect.stringMatching(/^##[\d.]+##$/),
              m: expect.objectContaining({
                a: expect.stringMatching(/^##[\d.]+##undefined$/),
                c: expect.stringMatching(/^##[\d.]+##undefined$/),
              }),
            }),
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    expect(ret).toEqual({ ret1: { a: 123, b: 456, c: "789" }, ret2: { b: 456 } });
  });

  it.concurrent("GM_addValueChangeListener - remote: false", async () => {
    const script = Object.assign({ uuid: uuidv4() }, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValue", "GM_setValue", "GM_addValueChangeListener"];
    script.metadata.storageName = ["testStorage"];
    script.code = `
    return new Promise(resolve=>{
      GM_addValueChangeListener("param1", (name, oldValue, newValue, remote)=>{
        resolve({name, oldValue, newValue, remote});
      });
      GM_setValue("param1", 123);
    });
   `;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const retPromise = exec.exec();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // 模拟值变化
    exec.valueUpdate({
      id: "id-1",
      entries: encodeMessage([["param1", 123, undefined]]),
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: exec.sandboxContext!.runFlag, tabId: -2 },
      valueUpdated: true,
    });
    const ret = await retPromise;
    expect(ret).toEqual({ name: "param1", oldValue: undefined, newValue: 123, remote: false });
  });

  it.concurrent("GM_addValueChangeListener - remote: true", async () => {
    const script = Object.assign({ uuid: uuidv4() }, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValue", "GM_setValue", "GM_addValueChangeListener"];
    script.metadata.storageName = ["testStorage"];
    script.code = `
    return new Promise(resolve=>{
      GM_addValueChangeListener("param2", (name, oldValue, newValue, remote)=>{
        resolve({name, oldValue, newValue, remote});
      });
      GM_setValue("param2", 456);
    });
   `;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    // remote = true
    const retPromise = exec.exec();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // 模拟值变化
    exec.valueUpdate({
      id: "id-2",
      entries: encodeMessage([["param2", 456, undefined]]),
      uuid: script.uuid,
      storageName: "testStorage",
      sender: { runFlag: "user", tabId: -2 },
      valueUpdated: true,
    });
    const ret2 = await retPromise;
    expect(ret2).toEqual({ name: "param2", oldValue: undefined, newValue: 456, remote: true });
  });
  it.concurrent("异步GM.setValue，等待回调", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM.getValue", "GM.setValue"];
    script.code = `await GM.setValue("a", 123); return await GM.getValue("a");`;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    // @ts-ignore
    const exec = new ExecScript(script, "content", mockMessage, nilFn, envInfo);
    exec.scriptFunc = compileScript(compileScriptCode(script));
    const retPromise = exec.exec();

    await Promise.resolve(); // 等待一轮微任务，让GM.setValue执行

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // 获取调用参数
    const actualCall = mockSendMessage.mock.calls[0][0];
    const id = actualCall.data.params[0];

    expect(id).toBeTypeOf("string");
    expect(id.length).greaterThan(0);
    // 触发valueUpdate
    exec.valueUpdate({
      id: id,
      entries: encodeMessage([["a", 123, undefined]]),
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: exec.sandboxContext!.runFlag, tabId: -2 },
      valueUpdated: true,
    });

    const ret = await retPromise;
    expect(ret).toEqual(123);
  });
});
