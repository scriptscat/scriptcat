import "fake-indexeddb/auto";
import LoggerCore from "@App/app/logger/core";
import DBWriter from "@App/app/logger/db_writer";
import migrate from "@App/app/migrate";
import { LoggerDAO } from "@App/app/repo/logger";
import { MockMessage } from "@Packages/message/mock_message";
import { Message, Server } from "@Packages/message/server";
import { ValueService } from "@App/app/service/service_worker/value";
import GMApi from "@App/app/service/service_worker/gm_api";
import OffscreenGMApi from "@App/app/service/offscreen/gm_api";
import EventEmitter from "eventemitter3";

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
    blob.text = () => {
      return Promise.resolve(data[0]);
    };
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

  migrate();

  const logger = new LoggerCore({
    level: "debug",
    writer: new DBWriter(new LoggerDAO()),
    labels: { env: "test" },
  });
  logger.logger().debug("test start");
}

export function initTestGMApi(): Message {
  const wsEE = new EventEmitter();
  const wsMessage = new MockMessage(wsEE);
  const osEE = new EventEmitter();
  const osMessage = new MockMessage(osEE);

  const serviceWorkerServer = new Server(wsMessage);
  const valueService = new ValueService(serviceWorkerServer.group("value"));
  const swGMApi = new GMApi(serviceWorkerServer.group("runtime"), osMessage, valueService);

  valueService.init();
  swGMApi.start();

  // offscreen
  const offscreenServer = new Server(osMessage);
  const osGMApi = new OffscreenGMApi(offscreenServer.group("gmApi"));
  osGMApi.init();

  return wsMessage;
}

export function initTestOffscreen() {}
