// 初始化runtime环境
import "fake-indexeddb/auto";
import BgGMApi from "./background/gm_api";
import migrate from "@App/app/migrate";
import LoggerCore from "@App/app/logger/core";
import DBWriter from "@App/app/logger/db_writer";
import { LoggerDAO } from "@App/app/repo/logger";
import MessageCenter from "@App/app/message/center";
import { Script, ScriptDAO, ScriptRunResouce } from "@App/app/repo/scripts";
import MessageInternal from "@App/app/message/internal";
import ValueManager from "@App/app/service/value/manager";
import ExecScript, { ValueUpdateData } from "./content/exec_script";

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
    ],
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
