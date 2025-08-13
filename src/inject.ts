import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { InjectRuntime } from "./app/service/content/inject";
import type { ScriptLoadInfo } from "./app/service/service_worker/types";
import type { GMInfoEnv } from "./app/service/content/types";

const msg = new CustomEventMessage(MessageFlag, false);

// 加载logger组件
const logger = new LoggerCore({
  writer: new MessageWriter(msg),
  labels: { env: "inject", href: window.location.href },
});

const server = new Server("inject", msg);
const runtime = new InjectRuntime(server, msg);
// 检查pre-document-start的脚本
runtime.checkPreDocumentStart();

console.log(PreInjectScriptFlag);

server.on("pageLoad", (data: { scripts: ScriptLoadInfo[]; envInfo: GMInfoEnv }) => {
  logger.logger().debug("inject start");
  // 监听事件
  runtime.init(data.envInfo);
  runtime.start(data.scripts);
});
