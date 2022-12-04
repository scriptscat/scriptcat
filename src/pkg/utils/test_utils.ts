// eslint-disable-next-line import/no-extraneous-dependencies
import "fake-indexeddb/auto";
import LoggerCore from "@App/app/logger/core";
import DBWriter from "@App/app/logger/db_writer";
import migrate from "@App/app/migrate";
import { LoggerDAO } from "@App/app/repo/logger";

export default function initTestEnv() {
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
    labels: { env: "tests" },
    debug: true,
  });
  logger.logger().debug("test start");
}
