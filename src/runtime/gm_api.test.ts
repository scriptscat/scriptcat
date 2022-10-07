// gm api 单元测试
// 初始化runtime环境
import "fake-indexeddb/auto";
import BgGMApi from "./background/gm_api";
import migrate from "@App/app/migrate";
import LoggerCore from "@App/app/logger/core";
import DBWriter from "@App/app/logger/db_writer";
import { LoggerDAO } from "@App/app/repo/logger";
import MessageCenter from "@App/app/message/center";
import { ScriptDAO, ScriptRunResouce } from "@App/app/repo/scripts";
import MessageInternal from "@App/app/message/internal";
import ValueManager from "@App/app/service/value/manager";
import ExecScript, { ValueUpdateData } from "./content/exec_script";
import { newMockXhr } from "mock-xmlhttprequest";
import chromeMock from "pkg/chrome-extension-mock";
import PermissionController from "@App/app/service/permission/controller";
import ContentRuntime from "./content/content";

migrate();

new LoggerCore({
  level: "debug",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "tests" },
  debug: true,
});

// @ts-ignore
global.sandbox = global;
const center = new MessageCenter();
center.start();

const backgroundApi = new BgGMApi();
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
    ],
    connect: ["baidu.com", "example.com"],
  },
  code: "console.log('test')",
  runFlag: "test",
  value: {},
} as unknown as ScriptRunResouce;

LoggerCore.getLogger({ component: "test" }).info("beforeAll");
const exec = new ExecScript(scriptRes, internal);
const contentApi = exec.sandboxContent;

beforeAll(async () => {
  const scriptDAO = new ScriptDAO();
  await scriptDAO.save(scriptRes);
  new ValueManager(center);
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
  const MockXhr = newMockXhr();
  MockXhr.onSend = async (request) => {
    switch (request.url) {
      case "https://www.baidu.com/":
        return request.respond(200, {}, "baidu");
      case window.location.href:
        return request.respond(200, {}, "example");
    }
    if (request.method === "POST") {
      switch (request.url) {
        case "https://example.com/form":
          if (request.body.get("blob") instanceof Blob) {
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
  global.XMLHttpRequest = MockXhr;
  it("get", () => {
    return new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://www.baidu.com",
        onreadystatechange: (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("baidu");
            resolve();
          }
        },
      });
    });
  });
  it("permission", () => {
    // 模拟权限确认
    chromeMock.tabs.hookCreate(
      (createProperties: chrome.tabs.CreateProperties) => {
        // 模拟确认
        const uuid = createProperties.url?.split("uuid=")[1] || "";
        permissionCtrl.sendConfirm(uuid, {
          allow: true,
          type: 3,
        });
      }
    );
    return new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "/",
        onreadystatechange: (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("example");
            resolve();
          }
        },
      });
    });
  });
  it("post数据和blob", () => {
    const form = new FormData();
    form.append("blob", new Blob(["blob"]));
    return new Promise<void>((resolve) => {
      contentApi.GM_xmlhttpRequest({
        url: "https://example.com/form",
        method: "POST",
        data: form,
        responseType: "blob",
        onreadystatechange: async (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("form");
            expect(await resp.response.text()).toBe("form");
            resolve();
          }
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
      LoggerCore.hook.addHook(
        "log",
        (id, { level, message }: { level: string; message: string }) => {
          expect(level).toBe("info");
          expect(message).toBe("test");
          resolve();
          return Promise.resolve(true);
        }
      );
      contentApi.GM_log("test");
    });
  });
});
