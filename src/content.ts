import { ExtensionMessageSend } from "@Packages/message/extension_message";
import { RuntimeClient } from "./app/service/service_worker/client";

// 建立与service_worker页面的连接
const send = new ExtensionMessageSend();

const client = new RuntimeClient(send);
client.pageLoad().then((data) => {
  console.debug("content start");
});
