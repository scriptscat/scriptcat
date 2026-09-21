import { describe, expect, it, vi } from "vitest";
import ExecScript from "../exec_script";
import type { ScriptLoadInfo } from "@App/app/service/service_worker/types";
import type { GMInfoEnv, ScriptFunc } from "../types";
import { compileScript, compileScriptCode } from "../utils";
import type { Message, MessageConnect } from "@Packages/message/types";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { ScriptRunResource } from "@App/app/repo/scripts";
import GMApi from "./gm_api";
import { parseSerializedDocumentResponse } from "./gm_xhr";
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

describe("early-start page RPC", () => {
  it("assigns a monotonic sequence to each page GM request and connection", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ code: 0, data: undefined });
    const connectMessage = vi.fn().mockResolvedValue({} as MessageConnect);
    const script = {
      ...scriptRes,
      uuid: "sequenced-page-script",
      executionHandle: "page-binding",
      executionEnvTag: "it",
    } as ScriptLoadInfo;
    const api = new GMApi(
      "scripting",
      { sendMessage, connect: connectMessage } as unknown as Message,
      {} as Message,
      script
    );

    await api.sendMessage("GM_log", ["first"]);
    await api.connect("GM_xmlhttpRequest", []);

    expect(sendMessage.mock.calls[0][0].data).toMatchObject({ version: 2, sequence: 1 });
    expect(connectMessage.mock.calls[0][0].data).toMatchObject({ version: 2, sequence: 2 });
  });

  it("waits for the page binding before opening a long-lived connection", async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const connection = {} as MessageConnect;
    const connectMessage = vi.fn().mockResolvedValue(connection);
    const script = {
      ...scriptRes,
      uuid: "early-start-script",
      executionHandle: "page-binding",
      executionEnvTag: "it",
    } as ScriptLoadInfo;
    const api = new GMApi("scripting", { connect: connectMessage } as unknown as Message, {} as Message, script);
    Object.defineProperty(api, "loadScriptPromise", { configurable: true, value: ready, writable: true });

    const pending = api.connect("GM_xmlhttpRequest", []);
    expect(connectMessage).not.toHaveBeenCalled();

    release();
    await expect(pending).resolves.toBe(connection);
    expect(connectMessage).toHaveBeenCalledWith({
      action: "scripting/runtime/gmApi",
      data: expect.objectContaining({
        api: "GM_xmlhttpRequest",
        handle: "page-binding",
        version: 2,
        sequence: 1,
      }),
    });
  });

  it("cancels a waiting long-lived connection when its context is invalidated", async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const connectMessage = vi.fn();
    const script = {
      ...scriptRes,
      uuid: "early-start-invalidated-connection",
      executionHandle: "page-binding",
      executionEnvTag: "it",
    } as ScriptLoadInfo;
    const api = new GMApi("scripting", { connect: connectMessage } as unknown as Message, {} as Message, script);
    Object.defineProperty(api, "loadScriptPromise", { configurable: true, value: ready, writable: true });
    let rejected = false;

    const pending = api.connect("GM_xmlhttpRequest", []).catch((error: unknown) => {
      rejected = error instanceof Error && error.message === "Invalid Context";
    });
    api.setInvalidContext();
    release();
    await vi.waitFor(() => expect(rejected).toBe(true), { timeout: 100 });
    await pending;

    expect(connectMessage).not.toHaveBeenCalled();
  });

  it("uses the authoritative run flag for early-start async value acknowledgments", async () => {
    const script = {
      ...scriptRes,
      uuid: "early-start-value-script",
      scriptRevision: "early-start-value-script:1:0",
      metadata: { grant: ["GM.setValue"], "early-start": [""], "run-at": ["document-start"] },
      executionHandle: undefined,
      executionEnvTag: undefined,
      executionRunFlag: undefined,
    } as ScriptLoadInfo;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: { sendMessage: mockSendMessage } as unknown as Message,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });

    exec.scriptFunc = function (_token: string, context: any) {
      return context.GM.setValue("a", 123);
    } as unknown as ScriptFunc;
    const result = exec.exec();
    await Promise.resolve();
    expect(mockSendMessage).not.toHaveBeenCalled();

    expect(
      exec.reconcileEarlyScript(envInfo, {
        ...script,
        scriptRevision: "early-start-value-script:1:0",
        executionHandle: "page-binding",
        executionEnvTag: "it",
        executionRunFlag: "canonical-run",
      } as any)
    ).toBe(true);
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    const request = mockSendMessage.mock.calls[0][0].data;
    exec.valueUpdate({
      id: request.params[0],
      entries: [["a", encodeRValue(123), encodeRValue(undefined)]],
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: "canonical-run", tabId: -2 },
      valueUpdated: true,
    });

    await expect(result).resolves.toBeUndefined();
  });
});

describe("page RPC v2 wire identity (Commit 3)", () => {
  // Wire identity is `handle` only, on every transport: neither the native SW hop (prefix
  // "serviceWorker" — MAIN native or USER_SCRIPT, which is always native) nor the MAIN fallback
  // hop through the content-script PageRpcRegistry (prefix "scripting") may duplicate it as
  // `executionHandle`, and neither may carry a page-supplied requestId/uuid/runFlag/envTag.
  // Canonical identity is resolved solely from `handle` + the real sender, by the SW.
  it.each([
    ["serviceWorker" as const, "main-native-script", "main-binding"],
    ["scripting" as const, "main-fallback-script", "main-binding"],
  ])("sendMessage over the %s transport carries only the v2 handle", async (prefix, uuid, handle) => {
    const sendMessage = vi.fn().mockResolvedValue({ code: 0, data: undefined });
    const script = {
      ...scriptRes,
      uuid,
      executionHandle: handle,
      executionEnvTag: "it",
    } as ScriptLoadInfo;
    const api = new GMApi(prefix, { sendMessage } as unknown as Message, {} as Message, script);

    await api.sendMessage("GM_setValue", ["a", 1]);

    const data = sendMessage.mock.calls[0][0].data;
    expect(Reflect.ownKeys(data)).toEqual(["version", "sequence", "handle", "api", "params"]);
    expect(data).toMatchObject({ version: 2, sequence: 1, handle, api: "GM_setValue" });
  });

  it.each([
    ["serviceWorker" as const, "main-native-connect-script", "main-binding"],
    ["scripting" as const, "main-fallback-connect-script", "main-binding"],
  ])("connect over the %s transport carries only the v2 handle", async (prefix, uuid, handle) => {
    const connectMessage = vi.fn().mockResolvedValue({} as MessageConnect);
    const script = {
      ...scriptRes,
      uuid,
      executionHandle: handle,
      executionEnvTag: "it",
    } as ScriptLoadInfo;
    const api = new GMApi(prefix, { connect: connectMessage } as unknown as Message, {} as Message, script);

    await api.connect("GM_xmlhttpRequest", []);

    const data = connectMessage.mock.calls[0][0].data;
    expect(Reflect.ownKeys(data)).toEqual(["version", "sequence", "handle", "api", "params"]);
    expect(data).toMatchObject({ version: 2, handle, api: "GM_xmlhttpRequest" });
  });

  it("USER_SCRIPT (ct) is always native and still carries only the v2 handle (regression)", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ code: 0, data: undefined });
    const script = {
      ...scriptRes,
      uuid: "ct-script",
      executionHandle: "ct-binding",
      executionEnvTag: "ct",
    } as ScriptLoadInfo;
    const api = new GMApi("serviceWorker", { sendMessage } as unknown as Message, {} as Message, script);

    await api.sendMessage("GM_setValue", ["a", 1]);

    const data = sendMessage.mock.calls[0][0].data;
    expect(data.handle).toBe("ct-binding");
    expect(Reflect.ownKeys(data)).toEqual(["version", "sequence", "handle", "api", "params"]);
  });

  it("a request with no executionHandle keeps the legacy uuid/runFlag shape", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ code: 0, data: undefined });
    const script = {
      ...scriptRes,
      uuid: "legacy-script",
      executionHandle: undefined,
      executionEnvTag: undefined,
    } as ScriptLoadInfo;
    const api = new GMApi("serviceWorker", { sendMessage } as unknown as Message, {} as Message, script);

    await api.sendMessage("GM_setValue", ["a", 1]);

    const data = sendMessage.mock.calls[0][0].data;
    expect(data).toMatchObject({
      uuid: "legacy-script",
      api: "GM_setValue",
      params: ["a", 1],
    });
    expect(data.version).toBeUndefined();
    expect(data.handle).toBeUndefined();
  });
});

describe("CAT_fetchDocument", () => {
  it("rebuilds documents from a data-only response instead of a relatedTarget reference", async () => {
    const script = Object.assign({}, scriptRes, {
      executionEnvTag: "it",
      metadata: { grant: ["CAT_fetchDocument"] },
    }) as ScriptLoadInfo;
    const sendMessage = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        text: '<!doctype html><html><body><main data-source="serialized">ok</main></body></html>',
        contentType: "text/html",
      },
    });
    const api = new GMApi("scripting", { sendMessage } as unknown as Message, {} as Message, script);

    const document = await api.CAT_fetchDocument(api, "https://example.test/document");

    expect(document?.querySelector("main")?.getAttribute("data-source")).toBe("serialized");
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
        data: expect.objectContaining({ api: "CAT_fetchDocument", params: ["https://example.test/document", false] }),
      })
    );
  });

  it("does not execute accessors in a forged serialized response", () => {
    const getter = vi.fn(() => "secret");
    const data = { contentType: "text/html" } as Record<string, unknown>;
    Object.defineProperty(data, "text", { configurable: true, enumerable: true, get: getter });

    expect(parseSerializedDocumentResponse(data)).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();

    const proxy = new Proxy(
      { text: "<html />", contentType: "text/html" },
      {
        getOwnPropertyDescriptor: () => {
          throw new Error("proxy trap");
        },
      }
    );
    expect(parseSerializedDocumentResponse(proxy)).toBeUndefined();
  });
});

const makeResource = (url: string, content: string, type: "require" | "require-css" | "resource") => ({
  url,
  content,
  base64: "",
  hash: { md5: "", sha1: "", sha256: "", sha384: "", sha512: "" },
  type,
  link: {},
  contentType: "text/plain",
  createtime: Date.now(),
});

describe("GM Resource API", () => {
  it("只从 resourceByType.resource 读取资源，并保留旧 payload fallback", async () => {
    const name = "shared-name";
    const script = {
      ...scriptRes,
      uuid: "gm-resource-category-test",
      value: {},
      resource: { [name]: makeResource("https://example.com/lib.js", "require content", "require") },
      resourceByType: {
        require: { [name]: makeResource("https://example.com/lib.js", "require content", "require") },
        "require-css": {},
        resource: { [name]: makeResource("https://example.com/data.txt", "declared resource", "resource") },
      },
    } as unknown as ScriptRunResource;
    const api = new GMApi("test", {} as Message, {} as Message, script);

    expect(api.GM_getResourceText(api, name)).toBe("declared resource");
    expect(api.GM_getResourceURL(api, name)).toContain("ZGVjbGFyZWQgcmVzb3VyY2U=");
    expect(await api["GM.getResourceText"](api, name)).toBe("declared resource");
    expect(await api["GM.getResourceUrl"](api, name)).toContain("ZGVjbGFyZWQgcmVzb3VyY2U=");

    const legacyScript = {
      ...script,
      resourceByType: undefined,
      resource: { [name]: makeResource("https://example.com/data.txt", "legacy resource", "resource") },
    } as unknown as ScriptRunResource;
    const legacyApi = new GMApi("test", {} as Message, {} as Message, legacyScript);

    expect(legacyApi.GM_getResourceText(legacyApi, name)).toBe("legacy resource");
  });
});

describe.concurrent("@grant GM", () => {
  it.concurrent("GM_", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = [
      "GM_getValue",
      "GM_getTab",
      "GM_getTabs",
      "GM_saveTab",
      "GM_cookie",
      "GM_addElement",
      "GM_openInTab",
      "GM_log",
      "GM_notification",
    ];
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return {
      GM_getValue: this.GM_getValue,
      GM_getTab: this.GM_getTab,
      GM_getTabs: this.GM_getTabs,
      GM_saveTab: this.GM_saveTab,
      GM_cookie: this.GM_cookie,
      ["GM_cookie.list"]: this.GM_cookie.list,
      ["GM_addElement"]: this.GM_addElement,
      ["GM.addElement"]: this.GM.addElement,
      ["GM_openInTab"]: this.GM_openInTab,
      ["GM.openInTab"]: this.GM.openInTab,
      ["GM_log"]: this.GM_log,
      ["GM.log"]: this.GM.log,
      ["GM_notification"]: this.GM_notification,
      ["GM.notification"]: this.GM.notification,
      ["GM_xmlhttpRequest"]: this.GM_xmlhttpRequest || function nil(){},
      ["GM.xmlhttpRequest"]: this.GM.xmlhttpRequest || function nil(){},
    }`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    // getValue
    expect(ret.GM_getValue?.name).toEqual("GM_getValue");
    // getTab / getTabs / saveTab
    expect(ret.GM_getTab?.name).toEqual("GM_getTab");
    expect(ret.GM_getTabs?.name).toEqual("GM_getTabs");
    expect(ret.GM_saveTab?.name).toEqual("GM_saveTab");
    // cookie
    expect(ret.GM_cookie?.name).toEqual("GM_cookie");
    expect(ret["GM_cookie.list"]?.name).toEqual("GM_cookie.list");
    // GM_与GM.应该都在
    expect(ret["GM_addElement"]?.name).toEqual("GM_addElement");
    expect(ret["GM.addElement"]?.name).toEqual("GM.addElement");
    expect(ret["GM_openInTab"]?.name).toEqual("GM_openInTab");
    expect(ret["GM.openInTab"]?.name).toEqual("GM.openInTab");
    expect(ret["GM_log"]?.name).toEqual("GM_log");
    expect(ret["GM.log"]?.name).toEqual("GM.log");
    expect(ret["GM_notification"]?.name).toEqual("GM_notification");
    expect(ret["GM.notification"]?.name).toEqual("GM.notification");
    // 没有grant应返回 nil
    expect(ret["GM_xmlhttpRequest"]?.name).toEqual("nil");
    expect(ret["GM.xmlhttpRequest"]?.name).toEqual("nil");
  });

  it.concurrent("GM.*", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = [
      "GM.getValue",
      "GM.getTab",
      "GM.getTabs",
      "GM.saveTab",
      "GM.cookie",
      "GM.addElement",
      "GM.openInTab",
      "GM.log",
      "GM.notification",
    ];
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return {
      ["GM.getValue"]: GM.getValue,
      ["GM.getTab"]: GM.getTab,
      ["GM.getTabs"]: GM.getTabs,
      ["GM.saveTab"]: GM.saveTab,
      ["GM.cookie"]: this.GM.cookie,
      ["GM_addElement"]: this.GM_addElement,
      ["GM.addElement"]: this.GM.addElement,
      ["GM_openInTab"]: this.GM_openInTab,
      ["GM.openInTab"]: this.GM.openInTab,
      ["GM_log"]: this.GM_log,
      ["GM.log"]: this.GM.log,
      ["GM_notification"]: this.GM_notification,
      ["GM.notification"]: this.GM.notification,
      ["GM_xmlhttpRequest"]: this.GM_xmlhttpRequest || function nil(){},
      ["GM.xmlhttpRequest"]: this.GM.xmlhttpRequest || function nil(){},
    }`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    // getValue
    expect(ret["GM.getValue"]?.name).toEqual("GM.getValue");
    // getTab / getTabs / saveTab
    expect(ret["GM.getTab"]?.name).toEqual("GM.getTab");
    expect(ret["GM.getTabs"]?.name).toEqual("GM.getTabs");
    expect(ret["GM.saveTab"]?.name).toEqual("GM.saveTab");
    // cookie
    expect(ret["GM.cookie"]?.name).toEqual("GM.cookie");
    expect(ret["GM.cookie"]?.list?.name).toEqual("GM.cookie.list");
    // GM_与GM.应该都在
    expect(ret["GM_addElement"]?.name).toEqual("GM_addElement");
    expect(ret["GM.addElement"]?.name).toEqual("GM.addElement");
    expect(ret["GM_openInTab"]?.name).toEqual("GM_openInTab");
    expect(ret["GM.openInTab"]?.name).toEqual("GM.openInTab");
    expect(ret["GM_log"]?.name).toEqual("GM_log");
    expect(ret["GM.log"]?.name).toEqual("GM.log");
    expect(ret["GM_notification"]?.name).toEqual("GM_notification");
    expect(ret["GM.notification"]?.name).toEqual("GM.notification");
    // 没有grant应返回 nil
    expect(ret["GM_xmlhttpRequest"]?.name).toEqual("nil");
    expect(ret["GM.xmlhttpRequest"]?.name).toEqual("nil");
  });
});

describe.concurrent("window.*", () => {
  it.concurrent("window.close", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["window.close"];
    script.code = `return window.close;`;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret).toEqual("ok");
  });
  it.concurrent("GM.getValue", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.value = { test: "ok" };
    script.metadata.grant = ["GM.getValue"];
    script.code = `return GM.getValue("test").then(v=>v+"!");`;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret).toEqual("ok!");
  });

  it.concurrent("GM_listValues", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.value = { test1: "23", test2: "45", test3: "67" };
    script.metadata.grant = ["GM_listValues"];
    script.code = `return GM_listValues().join("-");`;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret).toEqual("test5-test2-test3-test1"); // TM也没有sort
  });

  it.concurrent("GM.listValues", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.value = { test1: "23", test2: "45", test3: "67" };
    script.metadata.grant = ["GM.listValues"];
    script.code = `return GM.listValues().then(v=>v.join("-"));`;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret).toEqual("test5-test2-test3-test1"); // TM也没有sort
  });

  it.concurrent("GM_getValues", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.value = { test1: "23", test2: 45, test3: "67" };
    script.metadata.grant = ["GM_getValues"];
    script.code = `return GM_getValues(["test2", "test3", "test1"]);`;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret.test1).toEqual("23");
    expect(ret.test2).toEqual(45);
    expect(ret.test3).toEqual("67");
    // object default
    script.code = `return GM_getValues({test4: "default",test2:123});`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    // 抛出错误
    await expect(exec.exec()).rejects.toThrowError();
  });
  it.concurrent("成功", async () => {
    const script = Object.assign({}, scriptRes, { scriptRevision: "script-uuid:1:0" }) as ScriptLoadInfo;
    script.metadata = {};
    script.metadata["early-start"] = [""];
    script.metadata["run-at"] = ["document-start"];
    script.metadata["grant"] = ["CAT_scriptLoaded"];
    script.code = `return CAT_scriptLoaded().then(()=>123);`;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = exec.exec();
    // 触发envInfo
    expect(
      exec.reconcileEarlyScript(envInfo, {
        ...script,
        scriptRevision: "script-uuid:1:0",
        executionHandle: "page-binding",
        executionEnvTag: "it",
        executionRunFlag: "page-run",
      } as any)
    ).toBe(true);
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const retPromise = exec.exec();

    // 验证 sendMessage 是否被调用
    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // 获取实际调用的参数
    const actualCall = mockSendMessage.mock.calls[0][0];
    const actualMenuKey = actualCall.data.params[0];

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
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

  it.concurrent("注册菜单不会执行选项 getter", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_registerMenuCommand"];
    script.code = `
      let getterCalls = 0;
      const options = { accessKey: "s" };
      Object.defineProperty(options, "secret", { enumerable: true, get() { getterCalls += 1; return "forged"; } });
      GM_registerMenuCommand("safe", () => {}, options);
      return getterCalls;
    `;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = { sendMessage: mockSendMessage } as unknown as Message;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);

    await expect(exec.exec()).resolves.toBe(0);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          api: "GM_registerMenuCommand",
          params: [expect.any(String), "safe", expect.objectContaining({ accessKey: "s" })],
        }),
      })
    );
    expect(mockSendMessage.mock.calls[0][0].data.params[2]).not.toHaveProperty("secret");
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
    const exec = new ExecScript(script, {
      envPrefix: "content",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const retPromise = exec.exec();

    // 验证 sendMessage 是否被调用
    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    // 获取实际调用的参数
    const actualCall = mockSendMessage.mock.calls[0][0];
    const actualMenuKey = actualCall.data.params[0];

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
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
    const exec = new ExecScript(script, {
      envPrefix: "content",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret).toEqual({ id1: "abc", id2: "abc", id3: 1, id4: 2, id5: "3", id6: 3, id7: 3, id8: 4 });
  });
});

describe.concurrent("GM_value", () => {
  it.each(["__proto__", "constructor", "prototype"])("stores %s as an ordinary value key", (key) => {
    const script = Object.assign({}, scriptRes, {
      metadata: { grant: ["GM_getValue", "GM_setValue"] },
      value: {},
    }) as ScriptLoadInfo;
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);
    const stored = { leaked: "secret" };

    api.GM_setValue(api, key, stored);

    expect(Object.prototype.hasOwnProperty.call(script.value, key)).toBe(true);
    expect(Object.getPrototypeOf(script.value)).toBe(Object.prototype);
    expect(api.GM_getValue(api, key)).toEqual(stored);
    expect(api.GM_getValue(api, "leaked")).toBeUndefined();
  });

  it("returns __proto__ as an own key without changing the result prototype", () => {
    const script = Object.assign({}, scriptRes, {
      metadata: { grant: ["GM_getValue", "GM_setValue", "GM_getValues"] },
      value: {},
    }) as ScriptLoadInfo;
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);
    const stored = { leaked: "secret" };

    api.GM_setValue(api, "__proto__", stored);

    const selected = api.GM_getValues(api, ["__proto__"]);
    const defaults = Object.create(null) as Record<string, unknown>;
    defaults.__proto__ = "fallback";
    const withDefaults = api.GM_getValues(api, defaults);

    expect(Object.getPrototypeOf(selected)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(selected, "__proto__")).toBe(true);
    expect(selected.__proto__).toEqual(stored);
    expect(Object.getPrototypeOf(withDefaults)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(withDefaults, "__proto__")).toBe(true);
    expect(withDefaults.__proto__).toEqual(stored);
  });

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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(4);

    // 第一次调用：设置值为 123
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
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
        action: "scripting/runtime/gmApi",
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
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValue",
          params: [expect.any(String), "proxy-key"], // Proxy 无法通过 data-only clone，按删除处理
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    // 第四次调用：设置值为 window 对象（应失败）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
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
      ret3: undefined,
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
    const exec = new ExecScript(script, {
      envPrefix: "content",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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

  it("拒绝带 getter 的值，且不会在克隆时执行 getter", () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_setValue"];
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);
    const getter = vi.fn(() => "secret");
    const payload = {} as Record<string, unknown>;
    Object.defineProperty(payload, "secret", { configurable: true, enumerable: true, get: getter });

    api.GM_setValue(api, "hostile", payload);

    expect(getter).not.toHaveBeenCalled();
    expect(script.value.hostile).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ params: [expect.any(String), "hostile"] }) })
    );
  });

  it("GM_setValues skips accessor fields without invoking them", () => {
    const script = Object.assign({}, scriptRes, {
      metadata: { grant: ["GM_setValues"] },
      value: {},
    }) as ScriptLoadInfo;
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);
    const getter = vi.fn(() => "secret");
    const payload = { valid: 1 } as Record<string, unknown>;
    Object.defineProperty(payload, "secret", { configurable: true, enumerable: true, get: getter });

    api.GM_setValues(api, payload);

    expect(getter).not.toHaveBeenCalled();
    expect(script.value).toEqual({ valid: 1 });
  });

  it("GM_setValues does not trust a hooked Array.prototype.push for transport", () => {
    const script = Object.assign({}, scriptRes, {
      metadata: { grant: ["GM_setValues"] },
      value: {},
    }) as ScriptLoadInfo;
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);
    const originalPush = Array.prototype.push;
    Array.prototype.push = function (...items: unknown[]): number {
      return originalPush.call(this, ...items, ["injected", encodeRValue("forged")]);
    };

    try {
      api.GM_setValues(api, { valid: 1 });
    } finally {
      Array.prototype.push = originalPush;
    }

    expect(script.value).toEqual({ valid: 1 });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ params: [expect.any(String), [["valid", [0, 1]]]] }) })
    );
  });

  it("拒绝可执行值，且不会把函数写入本地存储或传输层", () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_setValue"];
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);
    const executable = () => "secret";

    api.GM_setValue(api, "executable", executable);

    expect(script.value.executable).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ params: [expect.any(String), "executable"] }) })
    );
  });

  it("拒绝 Symbol 值，避免把不可结构化克隆的数据写入本地存储", () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_setValue"];
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);

    api.GM_setValue(api, "symbol", Symbol("secret"));

    expect(script.value.symbol).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ params: [expect.any(String), "symbol"] }) })
    );
  });

  it("GM_setValues deletes existing falsy values when given undefined", () => {
    const script = Object.assign({}, scriptRes, {
      metadata: { grant: ["GM_setValues"] },
      value: { zero: 0, no: false, empty: "", nil: null },
    }) as ScriptLoadInfo;
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);

    api.GM_setValues(api, { zero: undefined, no: undefined, empty: undefined, nil: undefined });

    expect(script.value).toEqual({});
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(4);

    const keyValuePairs1 = [
      ["a", encodeRValue(123)],
      ["b", encodeRValue(456)],
      ["c", encodeRValue("789")],
    ];

    // 第一次调用：设置值为 123
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            keyValuePairs1,
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    const keyValuePairs2 = [
      ["a", encodeRValue(undefined)],
      ["c", encodeRValue(undefined)],
    ];

    // 第二次调用：删除值（设置为 undefined）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            keyValuePairs2,
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
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            [["proxy-key", encodeRValue(undefined)]],
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
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            [
              [
                "window",
                encodeRValue(undefined), // window 会被转换为 undefined
              ],
            ],
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    expect(ret).toEqual({
      ret1: { a: 123, b: 456, c: "789" },
      ret2: { b: 456 },
      ret3: { "proxy-key": undefined },
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    const keyValuePairs1 = [
      ["a", encodeRValue(123)],
      ["b", encodeRValue(456)],
      ["c", encodeRValue("789")],
    ];
    // 第一次调用：设置值为 123
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            keyValuePairs1,
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
        action: "scripting/runtime/gmApi",
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    const keyValuePairs1 = [
      ["a", encodeRValue(123)],
      ["b", encodeRValue(456)],
      ["c", encodeRValue("789")],
    ];

    // 第一次调用：设置值为 123
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the object payload
            keyValuePairs1,
          ],
          runFlag: expect.any(String),
          uuid: undefined,
        },
      })
    );

    const keyValuePairs2 = [
      ["a", encodeRValue(undefined)],
      ["c", encodeRValue(undefined)],
    ];

    // 第二次调用：删除值（设置为 undefined）
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "scripting/runtime/gmApi",
        data: {
          api: "GM_setValues",
          params: [
            // event id
            expect.stringMatching(/^.+::\d+$/),
            // the string payload
            keyValuePairs2,
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
    script.executionHandle = "page-binding";
    script.executionEnvTag = "it";
    script.executionRunFlag = "canonical-run";
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const retPromise = exec.exec();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // 模拟值变化
    exec.valueUpdate({
      id: "id-1",
      entries: [["param1", encodeRValue(123), encodeRValue(undefined)]],
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: script.executionRunFlag, tabId: -2 },
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
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    // remote = true
    const retPromise = exec.exec();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // 模拟值变化
    exec.valueUpdate({
      id: "id-2",
      entries: [["param2", encodeRValue(456), encodeRValue(undefined)]],
      uuid: script.uuid,
      storageName: "testStorage",
      sender: { runFlag: "user", tabId: -2 },
      valueUpdated: true,
    });
    const ret2 = await retPromise;
    expect(ret2).toEqual({ name: "param2", oldValue: undefined, newValue: 456, remote: true });
  });

  it.concurrent("value change listeners receive snapshots instead of the cached object", () => {
    const script = Object.assign({ uuid: uuidv4() }, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_getValue", "GM_addValueChangeListener"];
    script.value = {};
    const api = new GMApi("test", {} as Message, {} as Message, script);
    api.GM_addValueChangeListener(api, "snapshot", (_name, _oldValue, newValue) => {
      const snapshot = newValue as { nested: { value: number } };
      snapshot.nested.value = 99;
    });

    api.valueUpdate({
      entries: [["snapshot", encodeRValue({ nested: { value: 1 } }), encodeRValue(undefined)]],
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: "remote", tabId: -2 },
      valueUpdated: true,
    });

    expect(api.GM_getValue(api, "snapshot")).toEqual({ nested: { value: 1 } });
  });
  it.concurrent("异步GM.setValue，等待回调", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM.getValue", "GM.setValue"];
    script.code = `await GM.setValue("a", 123); return await GM.getValue("a");`;
    const mockSendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
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
      entries: [["a", encodeRValue(123), encodeRValue(undefined)]],
      uuid: script.uuid,
      storageName: script.uuid,
      sender: { runFlag: actualCall.data.runFlag, tabId: -2 },
      valueUpdated: true,
    });

    const ret = await retPromise;
    expect(ret).toEqual(123);
  });
});

describe("GM_value hostile intrinsics", () => {
  it("GM_getValues 直接赋值到 result 时不会触发 Object.prototype 上的继承 setter", () => {
    // result 是 Native.objectCreate(null) 建出的纯字典，setOwnValue 改成直接赋值后，
    // 即使 Object.prototype 被投毒了同名 setter，写入也必须落在 result 的自有属性上，
    // 不会被继承 setter 拦截——这正是 result 在数组路径和默认值路径都保持空原型的原因。
    const script = Object.assign({}, scriptRes, {
      metadata: { grant: ["GM_getValue", "GM_setValue", "GM_getValues"] },
      value: {},
    }) as ScriptLoadInfo;
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script as any);
    api.GM_setValue(api, "poisonedKey", "own-value");

    const previousDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "poisonedKey");
    let setterCalls = 0;
    Object.defineProperty(Object.prototype, "poisonedKey", {
      configurable: true,
      set() {
        setterCalls += 1;
      },
    });
    let selected: Record<string, unknown>;
    let withDefault: Record<string, unknown>;
    try {
      selected = api.GM_getValues(api, ["poisonedKey"]);
      withDefault = api.GM_getValues(api, { poisonedKey: "fallback" });
    } finally {
      if (previousDescriptor) Object.defineProperty(Object.prototype, "poisonedKey", previousDescriptor);
      else Reflect.deleteProperty(Object.prototype, "poisonedKey");
    }

    expect(setterCalls).toBe(0);
    expect(Object.getPrototypeOf(selected!)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(selected!, "poisonedKey")).toBe(true);
    expect(selected!.poisonedKey).toBe("own-value");
    expect(Object.getPrototypeOf(withDefault!)).toBeNull();
    expect(withDefault!.poisonedKey).toBe("own-value");
  });

  it("GM_setValues avoids inherited numeric setters for its entry arrays", () => {
    const script = Object.assign({}, scriptRes, {
      metadata: { grant: ["GM_setValues"] },
      value: {},
    }) as ScriptLoadInfo;
    const api = new GMApi("test", {} as Message, {} as Message, script as unknown as ScriptRunResource);
    let sentParams: unknown[] | undefined;
    api.sendMessage = (_name: string, params: any[]) => {
      sentParams = params;
      return Promise.resolve(undefined);
    };
    const defineProperty = Object.defineProperty;
    const previousIndexDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0");
    let setterCalls = 0;

    defineProperty(Array.prototype, "0", {
      configurable: true,
      set() {
        setterCalls += 1;
      },
    });
    try {
      api.GM_setValues(api, { valid: 1 });
    } finally {
      if (previousIndexDescriptor) defineProperty(Array.prototype, "0", previousIndexDescriptor);
      else Reflect.deleteProperty(Array.prototype, "0");
    }

    expect(setterCalls).toBe(0);
    expect(sentParams).toEqual([expect.any(String), [["valid", [0, 1]]]]);
  });
});

describe("GM_openInTab DTO", () => {
  it("does not execute accessor options", () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_openInTab"];
    const getter = vi.fn(() => "forged");
    const options = { active: true } as Record<string, unknown>;
    Object.defineProperty(options, "secret", { enumerable: true, configurable: true, get: getter });
    const sendMessage = vi.fn().mockResolvedValue(1);
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script);

    api.GM_openInTab(api, "https://example.com", options as never);

    expect(getter).not.toHaveBeenCalled();
    const sentOptions = sendMessage.mock.calls[0][0].data.params[1];
    expect(sentOptions.active).toBe(true);
    expect(Object.getOwnPropertyDescriptor(sentOptions, "secret")).toBeUndefined();
  });
});

describe("GM_notification DTO", () => {
  it("does not execute accessor details", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_notification"];
    const getter = vi.fn(() => "forged");
    const details = { text: "safe" } as Record<string, unknown>;
    Object.defineProperty(details, "secret", { enumerable: true, configurable: true, get: getter });
    const sendMessage = vi.fn().mockResolvedValue("notification-id");
    const api = new GMApi("test", { sendMessage } as unknown as Message, {} as Message, script);

    api.GM_notification(api, details as never);
    await Promise.resolve();

    expect(getter).not.toHaveBeenCalled();
    const sentDetails = sendMessage.mock.calls[0][0].data.params[0];
    expect(sentDetails.text).toBe("safe");
    expect(Object.getOwnPropertyDescriptor(sentDetails, "secret")).toBeUndefined();
  });
});

describe("@grant GM_download", () => {
  it("空 url 应触发 onerror 而不是发起下载（GM_download）", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_download"];
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return new Promise((resolve) => {
      let onloadCalled = false;
      GM_download({
        url: "",
        name: "empty-url-test.bin",
        onload: () => { onloadCalled = true; },
        onerror: (e) => resolve({ onloadCalled, error: e && e.error }),
      });
      setTimeout(() => resolve({ onloadCalled, error: "TIMEOUT" }), 100);
    })`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret.onloadCalled).toEqual(false);
    expect(ret.error).toEqual("unknown");
  });

  it("空 url 应 reject（GM.download）", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM.download"];
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return GM.download({ url: "", name: "empty-url-test.bin" }).then(
      () => ({ resolved: true }),
      () => ({ resolved: false })
    )`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret.resolved).toEqual(false);
  });
});

describe("@grant CAT.agent.conversation", () => {
  it("CAT.agent.conversation 应该在沙盒中可访问", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["CAT.agent.conversation", "GM_log"];
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return {
      CAT: typeof CAT,
      create: typeof CAT.agent.conversation.create,
      get: typeof CAT.agent.conversation.get,
    }`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret.CAT).toEqual("object");
    expect(ret.create).toEqual("function");
    expect(ret.get).toEqual("function");
  });
});

describe("@grant CAT.agent.dom", () => {
  it("CAT.agent.dom 所有方法应该在沙盒中可访问", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["CAT.agent.dom"];
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return {
      CAT: typeof CAT,
      agent: typeof CAT.agent,
      dom: typeof CAT.agent.dom,
      listTabs: typeof CAT.agent.dom.listTabs,
      navigate: typeof CAT.agent.dom.navigate,
      readPage: typeof CAT.agent.dom.readPage,
      screenshot: typeof CAT.agent.dom.screenshot,
      click: typeof CAT.agent.dom.click,
      fill: typeof CAT.agent.dom.fill,
      scroll: typeof CAT.agent.dom.scroll,
      waitFor: typeof CAT.agent.dom.waitFor,
    }`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret.CAT).toEqual("object");
    expect(ret.agent).toEqual("object");
    expect(ret.dom).toEqual("object");
    expect(ret.listTabs).toEqual("function");
    expect(ret.navigate).toEqual("function");
    expect(ret.readPage).toEqual("function");
    expect(ret.screenshot).toEqual("function");
    expect(ret.click).toEqual("function");
    expect(ret.fill).toEqual("function");
    expect(ret.scroll).toEqual("function");
    expect(ret.waitFor).toEqual("function");
  });

  it("CAT.agent.dom.readPage 应通过 sendMessage 发送正确参数", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.uuid = "test-uuid";
    script.metadata.grant = ["CAT.agent.dom"];
    const mockSendMessage = vi.fn().mockResolvedValue({ data: { title: "Test", url: "https://example.com" } });
    const mockMessage = {
      sendMessage: mockSendMessage,
    } as unknown as Message;
    const exec = new ExecScript(script, {
      envPrefix: "offscreen",
      message: mockMessage,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return CAT.agent.dom.readPage({ tabId: 1, mode: "summary", maxLength: 2000 });`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret).toEqual({ title: "Test", url: "https://example.com" });
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "offscreen/runtime/gmApi",
        data: expect.objectContaining({
          api: "CAT_agentDom",
          params: [
            expect.objectContaining({
              action: "readPage",
              options: { tabId: 1, mode: "summary", maxLength: 2000 },
              scriptUuid: "test-uuid",
            }),
          ],
        }),
      })
    );
  });

  it("未 grant CAT.agent.dom 时方法不可用", async () => {
    const script = Object.assign({}, scriptRes) as ScriptLoadInfo;
    script.metadata.grant = ["GM_log"];
    const exec = new ExecScript(script, {
      envPrefix: "scripting",
      message: undefined as any,
      contentMsg: undefined as any,
      code: nilFn,
      envInfo,
    });
    script.code = `return { hasCat: typeof CAT !== "undefined" && CAT?.agent?.dom?.readPage !== undefined }`;
    exec.scriptFunc = compileScript(compileScriptCode(script), true);
    const ret = await exec.exec();
    expect(ret.hasCat).toEqual(false);
  });
});
