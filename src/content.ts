import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import MessageContent from "./app/message/content";
import MessageInternal from "./app/message/internal";
import ContentRuntime from "./runtime/content/content";

const internalMessage = new MessageInternal("content");

const logger = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new MessageWriter(internalMessage),
  labels: { env: "content", href: window.location.href },
});

internalMessage.syncSend("pageLoad", null).then((resp) => {
  logger.logger().debug("content start");
  // 通过flag与inject建立通讯
  const contentMessage = new MessageContent(resp.flag, true);
  new ContentRuntime(contentMessage, internalMessage).start(resp);
});
