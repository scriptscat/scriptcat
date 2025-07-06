import { LoggerCore, EmptyWriter } from "@App/app/logger/core";
import { MockMessage } from "@Packages/message/mock_message";
import { Message, Server } from "@Packages/message/server";
import { ValueService } from "@App/app/service/service_worker/value";
import GMApi, { MockGMExternalDependencies } from "@App/app/service/service_worker/gm_api";
import OffscreenGMApi from "@App/app/service/offscreen/gm_api";
import EventEmitter from "eventemitter3";
import "@Packages/chrome-extension-mock";
import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "@App/pkg/config/config";
import PermissionVerify from "@App/app/service/service_worker/permission_verify";

export function initTestEnv() {
  // @ts-ignore
  if (global.initTest) {
    return;
  }
  // @ts-ignore
  global.initTest = true;

  const OldBlob = Blob;
  // @ts-ignore
  global.Blob = function Blob(data, options) {
    const blob = new OldBlob(data, options);
    blob.text = () => Promise.resolve(data[0]);
    blob.arrayBuffer = () => {
      return new Promise<ArrayBuffer>((resolve) => {
        const str = data[0];
        const buf = new ArrayBuffer(str.length * 2); // 每个字符占用2个字节
        const bufView = new Uint16Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i += 1) {
          bufView[i] = str.charCodeAt(i);
        }
        resolve(buf);
      });
    };
    return blob;
  };

  const logger = new LoggerCore({
    level: "trace",
    consoleLevel: "trace",
    writer: new EmptyWriter(),
    labels: { env: "test" },
  });
  logger.logger().debug("test start");
}

export function initTestGMApi(): Message {
  const wsEE = new EventEmitter();
  const wsMessage = new MockMessage(wsEE);
  const osEE = new EventEmitter();
  const osMessage = new MockMessage(osEE);
  const messageQueue = new MessageQueue();
  const systemConfig = new SystemConfig(messageQueue);

  const serviceWorkerServer = new Server("serviceWorker", wsMessage);
  const valueService = new ValueService(serviceWorkerServer.group("value"), messageQueue);
  const permissionVerify = new PermissionVerify(serviceWorkerServer.group("permissionVerify"), messageQueue);
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
