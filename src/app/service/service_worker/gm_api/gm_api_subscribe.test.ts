import { describe, it, expect, beforeEach } from "vitest";
import { ScriptDAO, SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ENABLE, SCRIPT_RUN_STATUS_COMPLETE } from "@App/app/repo/scripts";
import type { Script } from "@App/app/repo/scripts";
import { SubscribeDAO, SubscribeStatusType } from "@App/app/repo/subscribe";
import type { Subscribe } from "@App/app/repo/subscribe";
import type { SCMetadata } from "@App/app/repo/metadata";
import GMApi, { MockGMExternalDependencies } from "./gm_api";
import { initTestEnv } from "@Tests/utils";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "@App/pkg/config/config";
import PermissionVerify from "../permission_verify";

initTestEnv();

function makeScript(uuid: string, connect?: string[], subscribeUrl?: string): Script {
  const metadata: SCMetadata = {};
  if (connect) metadata.connect = connect;
  return {
    uuid,
    name: "test-script",
    namespace: "test",
    metadata,
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    runStatus: SCRIPT_RUN_STATUS_COMPLETE,
    createtime: Date.now(),
    checktime: Date.now(),
    subscribeUrl,
  };
}

function makeSubscribe(url: string, connect?: string[]): Subscribe {
  const metadata: SCMetadata = {};
  if (connect) metadata.connect = connect;
  return {
    url,
    name: "test-subscribe",
    code: "",
    author: "test",
    scripts: {},
    metadata,
    status: SubscribeStatusType.enable,
    createtime: Date.now(),
    checktime: Date.now(),
  };
}

function createGMApi(): GMApi {
  const ee = new EventEmitter<string, any>();
  const message = new MockMessage(ee);
  const messageQueue = new MessageQueue();
  const systemConfig = new SystemConfig(messageQueue);
  const server = new Server("serviceWorker", message);
  const permissionVerify = new PermissionVerify(server.group("permissionVerify"), messageQueue);
  return new GMApi(
    systemConfig,
    permissionVerify,
    server.group("runtime"),
    message,
    messageQueue,
    {} as any,
    new MockGMExternalDependencies()
  );
}

describe("parseRequest 订阅脚本 connect 覆盖", () => {
  let scriptDAO: ScriptDAO;
  let subscribeDAO: SubscribeDAO;
  let gmApi: GMApi;

  beforeEach(() => {
    scriptDAO = new ScriptDAO();
    subscribeDAO = new SubscribeDAO();
    gmApi = createGMApi();
  });

  it("订阅脚本的 connect 应被订阅的 connect 覆盖", async () => {
    const subscribeUrl = "https://example.com/test.sub.js";
    const script = makeScript("uuid-1", ["script-domain.com"], subscribeUrl);
    const subscribe = makeSubscribe(subscribeUrl, ["subscribe-domain.com", "api.example.com"]);

    await scriptDAO.save(script);
    await subscribeDAO.save(subscribe);

    const req = await gmApi.parseRequest({ uuid: "uuid-1", api: "test", runFlag: "", params: [] });
    // connect 应该被订阅的覆盖，而不是脚本自身的
    expect(req.script.metadata.connect).toEqual(["subscribe-domain.com", "api.example.com"]);
  });

  it("普通脚本（无 subscribeUrl）的 connect 保持不变", async () => {
    const script = makeScript("uuid-2", ["my-domain.com"]);
    await scriptDAO.save(script);

    const req = await gmApi.parseRequest({ uuid: "uuid-2", api: "test", runFlag: "", params: [] });
    expect(req.script.metadata.connect).toEqual(["my-domain.com"]);
  });

  it("订阅不存在时脚本 connect 保持不变", async () => {
    const script = makeScript("uuid-3", ["my-domain.com"], "https://gone.com/deleted.sub.js");
    await scriptDAO.save(script);

    const req = await gmApi.parseRequest({ uuid: "uuid-3", api: "test", runFlag: "", params: [] });
    expect(req.script.metadata.connect).toEqual(["my-domain.com"]);
  });

  it("订阅没有声明 connect 时脚本 connect 保持不变", async () => {
    const subscribeUrl = "https://example.com/no-connect.sub.js";
    const script = makeScript("uuid-4", ["my-domain.com"], subscribeUrl);
    const subscribe = makeSubscribe(subscribeUrl); // 无 connect

    await scriptDAO.save(script);
    await subscribeDAO.save(subscribe);

    const req = await gmApi.parseRequest({ uuid: "uuid-4", api: "test", runFlag: "", params: [] });
    expect(req.script.metadata.connect).toEqual(["my-domain.com"]);
  });
});
