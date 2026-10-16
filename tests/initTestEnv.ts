import LoggerCore, { EmptyWriter } from "@App/app/logger/core";

export function initTestEnv() {
  // 以 LoggerCore 自身的实例判断：isolate:false 的共享 worker 里 vi.resetModules() 会换出新的
  // LoggerCore 模块（instance 为空），而 global 上的标记会残留，导致后续文件拿不到 logger。
  if (LoggerCore.getInstance()) {
    return;
  }

  const logger = new LoggerCore({
    level: "trace",
    consoleLevel: "trace",
    writer: new EmptyWriter(),
    labels: { env: "test" },
  });
  logger.logger().debug("test start");
}
