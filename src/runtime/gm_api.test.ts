// gm api 单元测试
// 初始化runtime环境
import initTestEnv from "@App/pkg/utils/test_utils";
import BgGMApi from "./background/gm_api";
import LoggerCore from "@App/app/logger/core";
import MessageCenter from "@App/app/message/center";
import { ScriptDAO, ScriptRunResouce } from "@App/app/repo/scripts";
import MessageInternal from "@App/app/message/internal";
import ValueManager from "@App/app/service/value/manager";
import ExecScript, { ValueUpdateData } from "./content/exec_script";
import { newMockXhr } from "mock-xmlhttprequest";
import chromeMock from "@Pkg/chrome-extension-mock";
import PermissionController from "@App/app/service/permission/controller";
import ContentRuntime from "./content/content";
import IoC from "@App/app/ioc";
import { MessageBroadcast, MessageHander } from "@App/app/message/message";
import PermissionVerify from "./background/permission_verify";

initTestEnv();

// @ts-ignore
global.sandbox = global;
const center = new MessageCenter();
center.start();
IoC.registerInstance(MessageCenter, center).alias([
  MessageHander,
  MessageBroadcast,
]);
IoC.registerInstance(ValueManager, new ValueManager(center, center));

const backgroundApi = new BgGMApi(center, new PermissionVerify());
backgroundApi.start();

const internal = new MessageInternal("background");
const scriptRes = {
  id: 0,
  name: "test",
  metadata: {
    grant: [
      "GM_setValue",
      "GM_getValue",
      "GM_deleteValue",
      "GM_listValues",
      "GM_addValueChangeListener",
      // gm xhr
      "GM_xmlhttpRequest",
      // gm notification
      "GM_notification",
      "GM_updateNotification",
      "GM_closeNotification",
      // gm log
      "GM_log",
      // gm openInTab
      "GM_openInTab",
      // gm get/save tab
      "GM_getTab",
      "GM_saveTab",
      "GM_getTabs",
      // gm download
      "GM_download",
      // gm cookie
      "GM_cookie",
    ],
    connect: ["example.com"],
  },
  code: `// ==UserScript==
  // @name         New Userscript
  // @namespace    https://bbs.tampermonkey.net.cn/
  // @version      0.1.0
  // @description  try to take over the world!
  // @author       You
  // @match        https://bbs.tampermonkey.net.cn/
  // ==/UserScript==
  
  console.log('test');`,
  runFlag: "test",
  value: {},
  grantMap: {},
} as unknown as ScriptRunResouce;
scriptRes.sourceCode = scriptRes.code;

const exec = new ExecScript(scriptRes, internal);
const contentApi = exec.sandboxContent!;

beforeAll(async () => {
  const scriptDAO = new ScriptDAO();
  await scriptDAO.save(scriptRes);
  // 监听值变化
  internal.setHandler("valueUpdate", (_action, data: ValueUpdateData) => {
    exec.valueUpdate(data);
  });
});

describe("GM value", () => {
  it("get value", () => {
    contentApi.GM_setValue("test", "test");
    expect(contentApi.GM_getValue("test")).toBe("test");
    expect(contentApi.GM_getValue("test1")).toBeUndefined();
  });
  it("delete value", async () => {
    // 用await等待bg有结果再进行
    await contentApi.GM_setValue("test", "test");
    expect(contentApi.GM_getValue("test")).toBe("test");
    contentApi.GM_deleteValue("test");
    expect(contentApi.GM_getValue("test")).toBeUndefined();
  });
  it("list value", () => {
    contentApi.GM_setValue("test1", "test1");
    contentApi.GM_setValue("test2", "test2");
    expect(contentApi.GM_listValues()).toEqual(["test1", "test2"]);
  });
  it("value change listener", async () => {
    const listener = jest.fn();
    contentApi.GM_addValueChangeListener("changeValue", listener);
    await contentApi.GM_setValue("changeValue", "test1");
    expect(listener).toBeCalledWith(
      "changeValue",
      undefined,
      "test1",
      false,
      expect.anything()
    );
  });
});

const permissionCtrl = new PermissionController(internal);
const contentRuntime = new ContentRuntime(
  <MessageInternal>(<unknown>center),
  internal
);
contentRuntime.listenCATApi();
let blobData: Blob;
// mock createObjectURL和fetch
global.URL.createObjectURL = function (data: Blob) {
  blobData = data;
  return "blob://test";
};
// @ts-ignore
global.fetch = function (url) {
  return Promise.resolve({
    blob: () => Promise.resolve(blobData),
  });
};

describe("GM xmlHttpRequest", () => {
  const mockXhr = newMockXhr();
  mockXhr.onSend = async (request) => {
    switch (request.url) {
      case "https://www.example.com/":
        return request.respond(200, {}, "example");
      case window.location.href:
        return request.respond(200, {}, "location");
      case "https://example.com/json":
        return request.respond(
          200,
          { "Content-Type": "application/json" },
          JSON.stringify({ test: 1 })
        );
      case "https://www.example.com/header":
        if (request.requestHeaders.getHeader("x-nonce") !== "123456") {
          return request.respond(403, {}, "bad");
        }
        return request.respond(200, {}, "header");
      case "https://www.example.com/unsafeHeader":
        if (
          request.requestHeaders.getHeader("Origin") !==
            "https://example.com" ||
          request.requestHeaders.getHeader("Cookie") !== "website=example.com"
        ) {
          return request.respond(400, {}, "bad request");
        }
        return request.respond(200, { "Set-Cookie": "test=1" }, "unsafeHeader");
      case "https://www.wexample.com/unsafeHeader/cookie":
        if (request.requestHeaders.getHeader("Cookie") !== "test=1") {
          return request.respond(400, {}, "bad request");
        }
        return request.respond(200, {}, "unsafeHeader/cookie");
    }
    if (request.method === "POST") {
      switch (request.url) {
        case "https://example.com/form":
          if (request.body.get("blob")) {
            return request.respond(
              200,
              { "Content-Type": "text/html" },
              // mock 一个blob对象
              {
                text: () => Promise.resolve("form"),
              }
            );
          }
          return request.respond(400, {}, "bad");
      }
    }
    return request.respond(200, {}, "test");
  };
  global.XMLHttpRequest = mockXhr;
  it("get", () => {
    return new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://www.example.com",
        onreadystatechange: (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("example");
            resolve();
          }
        },
      });
    });
  });
  it("permission", () => {
    // 模拟权限确认
    const hookFn = (createProperties: chrome.tabs.CreateProperties) => {
      // 模拟确认
      const uuid = createProperties.url?.split("uuid=")[1] || "";
      permissionCtrl.sendConfirm(uuid, {
        allow: true,
        type: 3,
      });
    };
    chromeMock.tabs.hook.addListener("create", hookFn);
    return new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "/",
        onreadystatechange: (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("location");
            chromeMock.tabs.hook.removeListener("create", hookFn);
            resolve();
          }
        },
      });
    });
  });
  it("post数据和blob", () => {
    const form = new FormData();
    form.append("blob", new Blob(["blob"], { type: "text/html" }));
    return new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://example.com/form",
        method: "POST",
        data: form,
        responseType: "blob",
        onreadystatechange: async (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("form");
            expect(await (<Blob>resp.response).text()).toBe("form");
            resolve();
          }
        },
      });
    });
  });
  // xml原版是没有responseText的,但是tampermonkey有,恶心的兼容性
  it("json", async () => {
    await new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://example.com/json",
        method: "GET",
        responseType: "json",
        onload: (resp) => {
          // @ts-ignore
          expect(resp.response.test).toBe(1);
          expect(resp.responseText).toBe('{"test":1}');
          resolve();
        },
      });
    });
    // bad json
    await new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://www.example.com/",
        method: "GET",
        responseType: "json",
        onload: (resp) => {
          expect(resp.response).toBeUndefined();
          expect(resp.responseText).toBe("example");
          resolve();
        },
      });
    });
  });
  it("header", async () => {
    await new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://www.example.com/header",
        method: "GET",
        headers: {
          "x-nonce": "123456",
        },
        onload: (resp) => {
          expect(resp.responseText).toBe("header");
          resolve();
        },
      });
    });
  });
  it("unsafeHeader", async () => {
    global.XMLHttpRequest = chromeMock.webRequest.mockXhr(mockXhr);
    // 模拟header
    await new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://www.example.com/unsafeHeader",
        method: "GET",
        headers: {
          Origin: "https://example.com",
        },
        onload: (resp) => {
          expect(resp.responseText).toBe("unsafeHeader");
          expect(resp.responseHeaders?.indexOf("set-cookie")).not.toBe(-1);
          resolve();
        },
      });
    });
  });

  it("unsafeHeader/cookie", async () => {
    // global.XMLHttpRequest = chromeMock.webRequest.mockXhr(mockXhr);
    // 模拟header
    await new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://www.wexample.com/unsafeHeader/cookie",
        method: "GET",
        headers: {
          Cookie: "test=1",
        },
        anonymous: true,
        onload: (resp) => {
          expect(resp.responseText).toBe("unsafeHeader/cookie");
          resolve();
        },
      });
    });
  });
});

describe("GM notification", () => {
  it("click", async () => {
    const onclick = jest.fn();
    await new Promise<void>((resolve) => {
      contentApi.GM_notification({
        text: "test",
        title: "test",
        onclick() {
          onclick();
        },
        ondone() {
          resolve();
        },
        oncreate(id) {
          chromeMock.notifications.mockClick(id);
        },
      });
    });
    expect(onclick).toBeCalledTimes(1);
  });
  it("click button", async () => {
    const onclick = jest.fn();
    let nid;
    await new Promise<void>((resolve) => {
      contentApi.GM_notification({
        text: "test",
        title: "test",
        onclick(id, index) {
          onclick(id, index);
        },
        ondone(user) {
          expect(user).toBe(true);
          resolve();
        },
        oncreate(id) {
          nid = id;
          contentApi.GM_updateNotification(id, {});
          chromeMock.notifications.mockClickButton(nid, 1);
        },
        buttons: [{ title: "btn1" }, { title: "btn2" }],
      });
    });
    expect(onclick).toBeCalledWith(nid, 1);
  });
  it("timeout close", async () => {
    const ondone = jest.fn();
    await new Promise<void>((resolve) => {
      contentApi.GM_notification({
        text: "test",
        title: "test",
        timeout: 1000,
        ondone(user) {
          ondone(user);
          resolve();
        },
        oncreate(id) {},
      });
    });
    expect(ondone).toBeCalledTimes(1);
    expect(ondone).toBeCalledWith(false);
  });
});

describe("GM log", () => {
  it("log", () => {
    return new Promise<void>((resolve) => {
      const hookFn = ({
        level,
        message,
      }: {
        level: string;
        message: string;
      }) => {
        expect(level).toBe("info");
        expect(message).toBe("test");
        LoggerCore.hook.removeListener("log", hookFn);
        resolve();
        return Promise.resolve(true);
      };
      LoggerCore.hook.addListener("log", hookFn);

      contentApi.GM_log("test");
    });
  });
});

describe("GM openInTab", () => {
  it("open close", () => {
    return new Promise<void>((resolve) => {
      const tab = contentApi.GM_openInTab("https://www.baidu.com");
      tab.onclose = () => {
        resolve();
      };
      setTimeout(() => {
        tab.close();
      }, 100);
    });
  });
  it("user close", () => {
    return new Promise<void>((resolve) => {
      const tab = contentApi.GM_openInTab("https://www.baidu.com");
      tab.onclose = () => {
        resolve();
      };
      setTimeout(() => {
        chromeMock.tabs.remove(1);
      }, 100);
    });
  });
});

describe("GM get/save tab", () => {
  it("get", async () => {
    await contentApi.GM_saveTab({ test: 123 });
    await new Promise<void>((resolve) => {
      contentApi.GM_getTab((data) => {
        expect(data.test).toBe(123);
        // close tab
        chromeMock.tabs.remove(1);
        contentApi.GM_getTabs((data) => {
          expect(Object.keys(data).length).toBe(0);
          resolve();
        });
      });
    });
  });
});

describe("GM download", () => {
  it("download", async () => {
    await new Promise<void>((resolve) => {
      contentApi.GM_download({
        url: "https://www.example.com/",
        name: "test",
        saveAs: true,
        onload() {
          resolve();
        },
      });
    });
  });
});

describe("GM cookie", () => {
  // 未授权
  it("unauthorized", async () => {
    await new Promise<void>((resolve) => {
      // 获取storeID无需授权
      contentApi.GM_cookie(
        "store",
        {
          tabId: 1,
        },
        (value, err) => {
          expect(value).toEqual([{ storeId: "0" }]);
          resolve();
        }
      );
    });
    // 不在@connect中
    await new Promise<void>((resolve) => {
      contentApi.GM_cookie(
        "list",
        { url: "https://scriptcat.org" },
        (value, err) => {
          expect(err).toEqual("hostname must be in the definition of connect");
          resolve();
        }
      );
    });
    // 测试GM_cookie.list
    await new Promise<void>((resolve) => {
      // @ts-ignore
      contentApi.GM_cookie.list(
        { url: "https://scriptcat.org" },
        // @ts-ignore
        (value, err) => {
          expect(err).toEqual("hostname must be in the definition of connect");
          resolve();
        }
      );
    });
    // 在@connect中,但被拒绝
    const hookFn = (createProperties: chrome.tabs.CreateProperties) => {
      // 模拟确认
      const uuid = createProperties.url?.split("uuid=")[1] || "";
      permissionCtrl.sendConfirm(uuid, {
        allow: false,
        type: 1,
      });
    };
    chromeMock.tabs.hook.addListener("create", hookFn);
    await new Promise<void>((resolve) => {
      contentApi.GM_cookie(
        "list",
        { url: "https://www.example.com" },
        (value, err) => {
          expect(err).toEqual("permission not allowed");
          chromeMock.tabs.hook.removeListener("create", hookFn);
          resolve();
        }
      );
    });
  });
  // 模拟授权
  it("list", async () => {
    const hookFn = (createProperties: chrome.tabs.CreateProperties) => {
      // 模拟确认
      const uuid = createProperties.url?.split("uuid=")[1] || "";
      permissionCtrl.sendConfirm(uuid, {
        allow: true,
        type: 3,
      });
    };
    chromeMock.tabs.hook.addListener("create", hookFn);
    await new Promise<void>((resolve) => {
      chromeMock.cookies.mockGetAll = (detail, callback) => {
        expect(detail.url).toBe("https://www.example.com");
        callback([{ name: "test" } as chrome.cookies.Cookie]);
      };
      contentApi.GM_cookie(
        "list",
        { url: "https://www.example.com" },
        (value, err) => {
          expect(value).toEqual([{ name: "test" }]);
          chromeMock.tabs.hook.removeListener("create", hookFn);
          resolve();
        }
      );
    });
    await new Promise<void>((resolve) => {
      chromeMock.cookies.mockGetAll = (detail, callback) => {
        expect(detail.domain).toBe("www.example.com");
        callback([{ name: "domain test" } as chrome.cookies.Cookie]);
      };
      contentApi.GM_cookie(
        "list",
        { domain: "www.example.com" },
        (value, err) => {
          expect(value).toEqual([{ name: "domain test" }]);
          resolve();
        }
      );
    });
  });
  it("set", async () => {
    const hookFn = (createProperties: chrome.tabs.CreateProperties) => {
      // 模拟确认
      const uuid = createProperties.url?.split("uuid=")[1] || "";
      permissionCtrl.sendConfirm(uuid, {
        allow: true,
        type: 3,
      });
    };
    chromeMock.tabs.hook.addListener("create", hookFn);
    await new Promise<void>((resolve) => {
      contentApi.GM_cookie(
        "set",
        {
          url: "https://www.example.com",
          name: "test",
          value: "123",
        },
        (value, err) => {
          chromeMock.tabs.hook.removeListener("create", hookFn);
          expect(value).toBeUndefined();
          expect(err).toBeUndefined();
          resolve();
        }
      );
    });
    await new Promise<void>((resolve) => {
      contentApi.GM_cookie(
        "set",
        {
          domain: "www.example.com",
          name: "test",
          value: "123",
        },
        (value, err) => {
          expect(value).toBeUndefined();
          expect(err).toEqual("set operation must have name and value");
          resolve();
        }
      );
    });
  });
  it("remove", async () => {
    await new Promise<void>((resolve) => {
      contentApi.GM_cookie(
        "delete",
        {
          url: "https://www.example.com",
          name: "test",
        },
        (value, err) => {
          expect(value).toBeUndefined();
          expect(err).toBeUndefined();
          resolve();
        }
      );
    });
  });
});

describe("GM.*", () => {
  const scriptRes = {
    id: 0,
    name: "test",
    metadata: {
      grant: [
        // gm xhr
        "GM.xmlHttpRequest",
        // gm notification
        "GM.notification",
      ],
    },
    code: `// ==UserScript==
    // @name         New Userscript
    // @namespace    https://bbs.tampermonkey.net.cn/
    // @version      0.1.0
    // @description  try to take over the world!
    // @author       You
    // @match        https://bbs.tampermonkey.net.cn/
    // ==/UserScript==
    
    console.log('test');`,
    runFlag: "test",
    value: {},
    grantMap: {},
  } as unknown as ScriptRunResouce;
  scriptRes.sourceCode = scriptRes.code;

  const exec = new ExecScript(scriptRes, internal);
  const contentApi = exec.sandboxContent! as any;
  it("GM.xmlHttpRequest", async () => {
    expect(contentApi.GM.xmlHttpRequest).not.toBeUndefined();
  });
  it("GM.notification", async () => {
    expect(contentApi.GM.notification).not.toBeUndefined();
  });
  it("undefined", async () => {
    expect(contentApi.GM.undefined).toBeUndefined();
  });
});
