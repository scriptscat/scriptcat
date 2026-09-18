import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { PageMessage } from "@Packages/message/page_message";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { Server } from "@Packages/message/server";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { getEventFlag } from "@Packages/message/common";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";
import { type TExtensionEnv } from "./app/service/extension/extension_env";
import { connectUserScriptChannel, requestUserScriptReconnect } from "./app/service/content/user_script_connection";
import type { MessageConnect, TMessage } from "@Packages/message/types";

const messageFlag = process.env.SC_RANDOM_KEY!;

getEventFlag(messageFlag, (eventFlag: string, extensionEnv: TExtensionEnv | undefined) => {
  const scriptEnvTag = ScriptEnvTag.inject;

  const pageMsg: Message = new PageMessage(eventFlag, "inject");
  const nativeMsg: Message = new ExtensionMessage(false);
  // 特权 GM RPC 使用浏览器标记的 USER_SCRIPT 来源；页面桥只保留 bootstrap 与 DOM 引用辅助。
  const canUseNativeChannel =
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.connect === "function" &&
    typeof chrome.runtime?.sendMessage === "function";
  const msg: Message = canUseNativeChannel ? nativeMsg : pageMsg;

  // 初始化日志组件
  const logger = new LoggerCore({
    writer: new MessageWriter(msg, canUseNativeChannel ? "serviceWorker/logger" : "scripting/logger"),
    consoleLevel: process.env.NODE_ENV === "development" ? "debug" : "none", // 只让日志在scripting环境中打印
    labels: { env: "inject", href: window.location.href },
  });

  logger.logger().debug("inject start");

  const server = new Server("inject", msg);
  const scriptExecutor = new ScriptExecutor(
    msg,
    new CustomEventMessage(eventFlag, true, ScriptEnvTag.content),
    canUseNativeChannel ? "serviceWorker" : "scripting"
  );
  const runtime = new ScriptRuntime(scriptEnvTag, server, msg, scriptExecutor, extensionEnv);
  const pageServer = canUseNativeChannel ? new Server("inject", pageMsg) : undefined;
  let reconnecting = false;
  let openingNative = false;
  let nativeConnection: MessageConnect | undefined;
  let reconnectToken: string | undefined;

  const handleNativePacket = (_connection: MessageConnect, packet: TMessage) => {
    if (packet.action === "inject/pageLoad") {
      const nextToken = runtime.receivePageLoad(packet.data);
      if (nextToken) reconnectToken = nextToken;
    } else if (packet.action === "inject/runtime/valueUpdate") {
      runtime.receiveValueUpdate(packet.data);
    } else if (packet.action === "inject/runtime/emitEvent") {
      runtime.receiveEmitEvent(packet.data);
    }
  };

  const openNativeChannel = async (bootstrapToken: string): Promise<void> => {
    if (openingNative || nativeConnection) return;
    openingNative = true;
    let connection: MessageConnect | undefined;
    try {
      connection = await connectUserScriptChannel(
        nativeMsg,
        bootstrapToken,
        handleNativePacket,
        (isSelfDisconnected) => {
          if (nativeConnection === connection) nativeConnection = undefined;
          if (isSelfDisconnected || reconnecting || !reconnectToken) return;
          reconnecting = true;
          void requestUserScriptReconnect(nativeMsg, reconnectToken)
            .then((nextToken) => (nextToken ? openNativeChannel(nextToken) : undefined))
            .catch((error) => logger.logger().debug("MAIN USER_SCRIPT reconnect failed", { error: String(error) }))
            .finally(() => {
              reconnecting = false;
            });
        },
        "MAIN"
      );
      nativeConnection = connection;
    } catch (error) {
      logger.logger().debug("MAIN USER_SCRIPT channel failed", { error: String(error) });
    } finally {
      openingNative = false;
    }
  };

  pageServer?.on("bootstrap", (data: { bootstrapToken?: unknown }) => {
    if (typeof data?.bootstrapToken !== "string" || data.bootstrapToken.length === 0) return;
    reconnectToken = data.bootstrapToken;
    void openNativeChannel(data.bootstrapToken);
  });
  pageServer?.on("pageLoad", (data) => {
    runtime.receivePageLoad(data);
  });
  runtime.init();

  // inject环境，直接判断白名单，注入对外接口
  runtime.externalMessage("scripting", pageMsg);
});
