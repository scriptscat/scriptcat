import { LoggerCore } from "./app/logger/core";
import { MessageWriter } from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { generateRunTime } from "./app/service/content/inject";
import { ScriptLoadInfo } from "./app/service/service_worker/runtime.types";

const msg = new CustomEventMessage(MessageFlag, false);

// 加载logger组件
const logger = new LoggerCore({
  writer: new MessageWriter(msg),
  labels: { env: "inject", href: window.location.href },
});

const server = new Server("inject", msg);

server.on("pageLoad", (data: { scripts: ScriptLoadInfo[] }) => {
  logger.logger().debug("inject start");
  // 监听事件
  const runtime = generateRunTime(server, msg, data.scripts);
  runtime.start();
});
