import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import MessageContent from "./app/message/content";
import { type ScriptRunResource } from "./app/repo/scripts";
import InjectRuntime from "./runtime/content/inject";

// 通过flag与content建立通讯,这个ScriptFlag是后端注入时候生成的
// eslint-disable-next-line no-undef
const flag = ScriptFlag;

const message = new MessageContent(flag, false);

// 加载logger组件
const logger = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new MessageWriter(message),
  labels: { env: "inject", href: window.location.href },
});


message.setHandler("pageLoad", (_action, resp: { scripts: ScriptRunResource[], executionToken?: string }) => {
  logger.logger().debug("inject start");
  const runtime = new InjectRuntime(message, flag);
  runtime.start(resp);
});
