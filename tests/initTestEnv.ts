import LoggerCore, { EmptyWriter } from "@App/app/logger/core";

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
