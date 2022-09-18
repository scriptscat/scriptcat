import MessageSandbox from "./app/message/sandbox";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/messageWriter";
import SandboxRuntime from "./runtime/content/sandbox";

// eslint-disable-next-line no-restricted-globals
const connectSandbox = new MessageSandbox(top!);

// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new MessageWriter(connectSandbox),
  labels: { env: "sandbox" },
});

loggerCore.logger().debug("sandbox start");

const sandbox = new SandboxRuntime(connectSandbox);

sandbox.start();

window.onload = () => {
  connectSandbox.send("sandboxOnload", {});
};
