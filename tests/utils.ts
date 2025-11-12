import LoggerCore, { EmptyWriter } from "@App/app/logger/core";
import { MockMessage } from "@Packages/message/mock_message";
import { type IGetSender, Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { ValueService } from "@App/app/service/service_worker/value";
import GMApi, { MockGMExternalDependencies } from "@App/app/service/service_worker/gm_api";
import OffscreenGMApi from "@App/app/service/offscreen/gm_api";
import EventEmitter from "eventemitter3";
import "@Packages/chrome-extension-mock";
import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "@App/pkg/config/config";
import PermissionVerify, { type ApiValue } from "@App/app/service/service_worker/permission_verify";
import { type GMApiRequest } from "@App/app/service/service_worker/types";

export function initTestEnv() {
  // @ts-ignore
  if (global.initTest) {
    return;
  }
  // @ts-ignore
  global.initTest = true;

  const logger = new LoggerCore({
    level: "trace",
    consoleLevel: "trace",
    writer: new EmptyWriter(),
    labels: { env: "test" },
  });
  logger.logger().debug("test start");
}

const noConfirmScripts = new Set<string>();
export const addTestPermission = (uuid: string) => {
  noConfirmScripts.add(uuid);
};

export function initTestGMApi(): Message {
  const wsEE = new EventEmitter<string, any>();
  const wsMessage = new MockMessage(wsEE);
  const osEE = new EventEmitter<string, any>();
  const osMessage = new MockMessage(osEE);
  const messageQueue = new MessageQueue();
  const systemConfig = new SystemConfig(messageQueue);

  const serviceWorkerServer = new Server("serviceWorker", wsMessage);
  const valueService = new ValueService(serviceWorkerServer.group("value"), messageQueue);
  const permissionVerify = new PermissionVerify(serviceWorkerServer.group("permissionVerify"), messageQueue);
  (permissionVerify as any).confirmWindowActual = permissionVerify.confirmWindow;
  permissionVerify.noVerify = function <T>(request: GMApiRequest<T>, _api: ApiValue, _sender: IGetSender) {
    if (noConfirmScripts.has(request.uuid)) return true;
    return false;
  };
  const swGMApi = new GMApi(
    systemConfig,
    permissionVerify,
    serviceWorkerServer.group("runtime"),
    osMessage,
    messageQueue,
    valueService,
    new MockGMExternalDependencies()
  );

  swGMApi.start();

  // offscreen
  const offscreenServer = new Server("offscreen", osMessage);
  const osGMApi = new OffscreenGMApi(offscreenServer.group("gmApi"));
  osGMApi.init();

  return wsMessage;
}
