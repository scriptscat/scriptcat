import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
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

  // 转发长连接的gmApi消息
  contentMessage.setHandlerWithConnect(
    "gmApiChannel",
    (inject, action, data) => {
      const background = internalMessage.channel();
      // 转发inject->background
      inject.setHandler((req) => {
        background.send(req.data);
      });
      inject.setCatch((err) => {
        background.throw(err);
      });
      inject.setDisChannelHandler(() => {
        background.disChannel();
      });
      // 转发background->inject
      background.setHandler((bgResp) => {
        inject.send(bgResp);
      });
      background.setCatch((err) => {
        inject.throw(err);
      });
      background.setDisChannelHandler(() => {
        inject.disChannel();
      });
      // 建立连接
      background.channel(action, data);
    }
  );

  // 由background到content
  // 转发value更新事件
  internalMessage.setHandler("valueUpdate", (action, data) => {
    contentMessage.send(action, data);
  });
  contentMessage.send("pageLoad", resp);
});
