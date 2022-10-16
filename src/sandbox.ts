import MessageSandbox from "./app/message/sandbox";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import SandboxRuntime from "./runtime/content/sandbox";
import IoC from "./app/ioc";

// eslint-disable-next-line no-restricted-globals
const connectSandbox = new MessageSandbox(top!);

IoC.registerInstance(MessageSandbox, connectSandbox);

// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new MessageWriter(connectSandbox),
  labels: { env: "sandbox" },
});

loggerCore.logger().debug("sandbox start");

IoC.instance(SandboxRuntime).start();

window.onload = () => {
  connectSandbox.send("sandboxOnload", {});
};
