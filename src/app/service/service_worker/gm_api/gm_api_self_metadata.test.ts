import { describe, it, expect, beforeEach } from "vitest";
import { ScriptDAO, SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ENABLE, SCRIPT_RUN_STATUS_COMPLETE } from "@App/app/repo/scripts";
import type { Script } from "@App/app/repo/scripts";
import GMApi, { MockGMExternalDependencies } from "./gm_api";
import { initTestEnv } from "@Tests/utils";
import { MockMessage } from "@Packages/message/mock_message";
import { Server, type IGetSender } from "@Packages/message/server";
import type { ExtMessageSender } from "@Packages/message/types";
import EventEmitter from "eventemitter3";
import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "@App/pkg/config/config";
import PermissionVerify, { PermissionVerifyApiGet } from "../permission_verify";
import type { ValueService } from "../value";

initTestEnv();

const makeSender = (): IGetSender => ({
  getSender: () => ({}) as chrome.runtime.MessageSender,
  getType: () => 0,
  isType: (_type: any) => false,
  getExtMessageSender: () => null as unknown as ExtMessageSender,
  getConnect: () => undefined,
});

const createGMApi = () => {
  const ee = new EventEmitter<string, any>();
  const message = new MockMessage(ee);
  const messageQueue = new MessageQueue();
  const systemConfig = new SystemConfig(messageQueue);
  const server = new Server("serviceWorker", message);
  const permissionVerify = new PermissionVerify(server.group("permissionVerify"), messageQueue);
  const gmApi = new GMApi(
    systemConfig,
    permissionVerify,
    server.group("runtime"),
    message,
    messageQueue,
    {} as ValueService,
    new MockGMExternalDependencies()
  );
  return { gmApi, permissionVerify };
};

// 设置面板把运行时机改成 context-menu 只写 selfMetadata，脚本自带 metadata 不变；
// GM API 请求若只带自带 metadata，免 @grant 的菜单豁免就判不出来，菜单项注册不上（#1649）。
describe("parseRequest 用户覆写的 metadata", () => {
  let scriptDAO: ScriptDAO;

  beforeEach(() => {
    scriptDAO = new ScriptDAO();
  });

  it("selfMetadata 覆写 run-at=context-menu 的脚本，GM_registerMenuCommand 无需 @grant 即可通过校验", async () => {
    const script: Script = {
      uuid: "uuid-context-menu-override",
      name: "test-script",
      namespace: "test",
      metadata: { grant: ["none"], "run-at": ["document-idle"] },
      selfMetadata: { "run-at": ["context-menu"] },
      type: SCRIPT_TYPE_NORMAL,
      status: SCRIPT_STATUS_ENABLE,
      sort: 0,
      runStatus: SCRIPT_RUN_STATUS_COMPLETE,
      createtime: Date.now(),
      checktime: Date.now(),
    };
    await scriptDAO.save(script);
    const { gmApi, permissionVerify } = createGMApi();

    const req = await gmApi.parseRequest({
      uuid: script.uuid,
      api: "GM_registerMenuCommand",
      runFlag: "",
      params: [],
    });

    await expect(
      permissionVerify.verify(req, PermissionVerifyApiGet("GM_registerMenuCommand")!, makeSender(), gmApi)
    ).resolves.toBe(true);
  });
});
