import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { ScriptLoadInfo } from "./app/service/service_worker/runtime";

const msg = new CustomEventMessage(MessageFlag, false);


const server = new Server("inject", msg);

server.on("pageLoad", (data: { scripts: ScriptLoadInfo[] }) => {
  console.debug("inject start");
});
