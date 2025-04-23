import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { ScriptRunResouce } from "./app/repo/scripts";
import { InjectRuntime } from "./app/service/content/inject";

const msg = new CustomEventMessage(MessageFlag, false);

// 加载logger组件
const logger = new LoggerCore({
  writer: new MessageWriter(msg),
  labels: { env: "inject", href: window.location.href },
});

const server = new Server("inject", msg);

server.on("pageLoad", (data: { scripts: ScriptRunResouce[] }) => {
  logger.logger().debug("inject start");
  // 监听事件
  const runtime = new InjectRuntime(server, msg, data.scripts);
  runtime.start();
});
