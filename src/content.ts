import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/messageWriter";
import MessageContent from "./app/message/content";
import MessageInternal from "./app/message/internal";

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

  // 由content到background
  // 转发gmApi消息
  contentMessage.setHandler("gmApi", (action, data) => {
    return internalMessage.syncSend(action, data);
  });
  // 转发log消息
  contentMessage.setHandler("log", (action, data) => {
    internalMessage.send(action, data);
  });

  // 由background到content
  // 转发value更新事件
  internalMessage.setHandler("valueUpdate", (action, data) => {
    contentMessage.send(action, data);
  });
  contentMessage.send("pageLoad", resp);
});
