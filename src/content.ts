import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { ExtensionMessage, ExtensionMessageSend } from "@Packages/message/extension_message";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { RuntimeClient } from "./app/service/service_worker/client";
import { Server } from "@Packages/message/server";
import ContentRuntime from "./app/service/content/content";
import { ScriptExecutor } from "./app/service/content/script_executor";
import { randomMessageFlag } from "./pkg/utils/utils";

declare global {
  interface Window {
    EarlyScriptFlag?: string[];
  }
}

console.log("content.js");

if (typeof chrome?.runtime?.onMessage?.addListener !== "function") {
  // ScriptCat 未支持 Firefox MV3
  console.error("Firefox MV3 UserScripts is not yet supported by ScriptCat");
} else {
  // 建立与service_worker页面的连接
  const send = new ExtensionMessageSend();

  // 处理scriptExecutor
  const scriptExecutorFlag = randomMessageFlag();
  const scriptExecutorMsg = new CustomEventMessage(scriptExecutorFlag, true);
  const scriptExecutor = new ScriptExecutor(new CustomEventMessage(scriptExecutorFlag, false), []);
  // 处理EarlyScript
  if (window.EarlyScriptFlag) {
    scriptExecutor.setEarlyStartScriptFlag(window.EarlyScriptFlag);
    scriptExecutor.checkEarlyStartScript();
  } else {
    // 监听属性设置
    Object.defineProperty(window, "EarlyScriptFlag", {
      configurable: true,
      set: (val: string[]) => {
        scriptExecutor.setEarlyStartScriptFlag(val);
        scriptExecutor.checkEarlyStartScript();
      },
    });
  }

  // 初始化日志组件
  const loggerCore = new LoggerCore({
    writer: new MessageWriter(send),
    labels: { env: "content" },
  });

  const client = new RuntimeClient(send);
  client.pageLoad().then((data) => {
    loggerCore.logger().debug("content start");
    const extMsg = new ExtensionMessage();
    const msg = new CustomEventMessage(data.flag, true);
    const server = new Server("content", [msg, scriptExecutorMsg]);
    // Opera中没有chrome.runtime.onConnect，并且content也不需要chrome.runtime.onConnect
    // 所以不需要处理连接，设置为false
    const extServer = new Server("content", extMsg, false);
    // scriptExecutor的消息接口
    // 初始化运行环境
    const runtime = new ContentRuntime(extServer, server, send, msg, scriptExecutorMsg, scriptExecutor);
    runtime.init();
    runtime.start(data.scripts, data.envInfo);
  });
}
