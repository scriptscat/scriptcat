import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { PageMessage } from "@Packages/message/page_message";
import { ExtensionMessage, hasNativeRuntimeChannel } from "@Packages/message/extension_message";
import { Server } from "@Packages/message/server";
import { Client } from "@Packages/message/client";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { getEventFlag } from "@Packages/message/common";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";
import { type TExtensionEnv } from "./app/service/extension/extension_env";
import { connectUserScriptChannel, requestUserScriptReconnect } from "./app/service/content/user_script_connection";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import { createMainWorldPageLoadGate } from "./app/service/content/main_world_page_load_gate";

const messageFlag = process.env.SC_RANDOM_KEY!;

const NATIVE_BOOTSTRAP_TIMEOUT_MS = 1000;

getEventFlag(messageFlag, (eventFlag: string, extensionEnv: TExtensionEnv | undefined) => {
  const scriptEnvTag = ScriptEnvTag.inject;

  const pageMsg: Message = new PageMessage(eventFlag, "inject");
  const nativeMsg: Message = new ExtensionMessage(false);
  // 特权 GM RPC 使用浏览器标记的 USER_SCRIPT 来源；页面桥只保留 bootstrap 与 DOM 引用辅助。
  const canUseNativeChannel = hasNativeRuntimeChannel;
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
  let pendingNativeReady:
    | {
        resolve: (connected: boolean) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let reconnectToken: string | undefined;

  const settleNativeReady = (connected: boolean): void => {
    const pending = pendingNativeReady;
    if (!pending) return;
    pendingNativeReady = undefined;
    clearTimeout(pending.timer);
    pending.resolve(connected);
  };

  const handleNativePacket = (_connection: MessageConnect, packet: TMessage) => {
    if (packet.action === "inject/pageLoad") {
      if (!pendingNativeReady) return;
      nativeConnection = _connection;
      settleNativeReady(true);
      const nextToken = runtime.receivePageLoad(packet.data);
      if (nextToken) reconnectToken = nextToken;
    } else if (packet.action === "inject/runtime/valueUpdate") {
      runtime.receiveValueUpdate(packet.data);
    } else if (packet.action === "inject/runtime/emitEvent") {
      runtime.receiveEmitEvent(packet.data);
    }
  };

  const openNativeChannel = async (bootstrapToken: string): Promise<boolean> => {
    if (openingNative || nativeConnection) return Boolean(nativeConnection);
    openingNative = true;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const connection = nativeConnection;
        nativeConnection = undefined;
        settleNativeReady(false);
        try {
          connection?.disconnect(true);
        } catch (error) {
          logger.logger().debug("MAIN USER_SCRIPT channel cleanup failed", { error: String(error) });
        }
      }, NATIVE_BOOTSTRAP_TIMEOUT_MS);
      pendingNativeReady = { resolve, timer };

      void connectUserScriptChannel(
        nativeMsg,
        bootstrapToken,
        handleNativePacket,
        (isSelfDisconnected) => {
          nativeConnection = undefined;
          settleNativeReady(false);
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
      )
        .then((connection) => {
          if (!connection) {
            settleNativeReady(false);
            return;
          }
          if (pendingNativeReady || nativeConnection === connection) {
            nativeConnection = connection;
            return;
          }
          connection.disconnect(true);
        })
        .catch((error) => {
          logger.logger().debug("MAIN USER_SCRIPT channel failed", { error: String(error) });
          settleNativeReady(false);
        })
        .finally(() => {
          openingNative = false;
        });
    });
  };

  if (pageServer) {
    const pageLoadGate = createMainWorldPageLoadGate(
      openNativeChannel,
      (data) => runtime.receivePageLoad(data),
      () => {
        void new Client(pageMsg, "scripting").do("pageLoadFallback");
      }
    );
    pageServer.on("bootstrap", (data: { bootstrapToken?: unknown }) => {
      if (typeof data?.bootstrapToken !== "string" || data.bootstrapToken.length === 0) return;
      reconnectToken = data.bootstrapToken;
      pageLoadGate.onBootstrap(data.bootstrapToken);
    });
    pageServer.on("pageLoad", pageLoadGate.onPageLoad);
  } else {
    // 没有原生 runtime 通道时，bootstrap 只作为页面桥上的兼容握手，随后请求完整 pageLoad。
    server.on("bootstrap", () => {
      void new Client(pageMsg, "scripting").do("pageLoadFallback");
    });
  }
  runtime.init();

  // inject环境，直接判断白名单，注入对外接口
  runtime.externalMessage("scripting", pageMsg);
});
